/**
 * AL-IMAAMA - Fees, Income & Expenses Management Module (ADMIN-ONLY)
 * Manages Student Fee Ledger (Class & School Fees, ZAAD/eDahab/Cash, Receipts),
 * Institutional Other Income & Expenses CRUD with Financial Overview KPIs,
 * and Unified Transaction History with Print, PDF, and Excel (.xlsx) export.
 */

import { Data } from './data.js';
import { Auth } from './auth.js';
import { Permissions } from './permissions.js';
import { Components } from './components.js';
import { I18n } from './i18n.js';

let activeMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
let feeSearch = '';
let feeClassFilter = '';
let activeTab = 'ledger'; // 'ledger' | 'income-expenses' | 'history'

// Income & Expenses state
let ieSearch = '';
let ieTypeFilter = ''; // '' | 'income' | 'expense'
let ieCategoryFilter = '';
let ieMethodFilter = '';
let ieStartDate = '';
let ieEndDate = '';

// Transaction History state
let histSearch = '';
let histTypeFilter = ''; // '' | 'fee' | 'income' | 'expense'

const INCOME_CATEGORIES = ['Donations', 'Book Sales', 'Grants & Waqf', 'Transport & Uniforms', 'Event Revenue', 'Other Income'];
const EXPENSE_CATEGORIES = ['Salaries & Stipends', 'Utilities', 'Supplies & Stationery', 'Maintenance', 'Operations', 'Miscellaneous'];

export const PaymentsView = {
  render(container) {
    const user = Auth.getCurrentUser();
    if (!Permissions.isAdmin(user) || !Permissions.hasPermission(user, 'payments', 'view')) {
      container.innerHTML = `
        <div class="p-8 max-w-lg mx-auto text-center space-y-3">
          <div class="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            ${Components.icon('alert-circle', 'w-6 h-6')}
          </div>
          <h2 class="text-base font-bold text-slate-900">Access Restricted</h2>
          <p class="text-xs text-slate-500">Financial modules, ledgers, and payment operations are restricted to authorized administrators.</p>
        </div>
      `;
      return;
    }

    const canAdd = Permissions.hasPermission(user, 'payments', 'add');
    const canEdit = Permissions.hasPermission(user, 'payments', 'edit');
    const canDelete = Permissions.hasPermission(user, 'payments', 'delete');
    const canPrint = Permissions.hasPermission(user, 'payments', 'print');
    const canExport = Permissions.hasPermission(user, 'payments', 'export');

    const classes = Data.getClasses();
    const settings = Data.getSettings();
    const currency = settings.currencySymbol || '$';

    const ledger = Data.getStudentFeeLedger(activeMonth);

    container.innerHTML = `
      <div class="space-y-6">
        <!-- Module Header -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 no-print">
          <div>
            <h1 class="text-2xl font-bold tracking-tight text-slate-900">${I18n.t('payments.title', 'Fee Ledger, Income & Expenses')}</h1>
            <p class="text-sm text-slate-500 mt-1">${I18n.t('payments.sub', 'Manage student fee collections, other institutional income, operating expenses, and audited receipts.')}</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            ${activeTab === 'ledger' ? `
              ${canExport ? `
                <button id="export-fees-btn" class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                  ${Components.icon('download', 'w-4 h-4')} Export Excel (.xlsx)
                </button>
              ` : ''}
              ${canAdd ? `
                <button id="record-payment-btn" class="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors">
                  ${Components.icon('plus', 'w-4 h-4')} ${I18n.t('payments.recordPayment', 'Record Payment')}
                </button>
              ` : ''}
            ` : ''}

            ${activeTab === 'income-expenses' ? `
              ${canPrint ? `
                <button id="ie-print-btn" class="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                  ${Components.icon('printer', 'w-4 h-4')} Print
                </button>
                <button id="ie-pdf-btn" class="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                  ${Components.icon('file-text', 'w-4 h-4')} Export PDF
                </button>
              ` : ''}
              ${canExport ? `
                <button id="ie-excel-btn" class="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                  ${Components.icon('download', 'w-4 h-4')} Export Excel
                </button>
              ` : ''}
              ${canAdd ? `
                <button id="add-income-btn" class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors">
                  ${Components.icon('plus', 'w-4 h-4')} ${I18n.t('payments.addIncome', 'Add Income')}
                </button>
                <button id="add-expense-btn" class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition-colors">
                  ${Components.icon('plus', 'w-4 h-4')} ${I18n.t('payments.addExpense', 'Add Expense')}
                </button>
              ` : ''}
            ` : ''}

            ${activeTab === 'history' && canExport ? `
              <button id="hist-excel-btn" class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                ${Components.icon('download', 'w-4 h-4')} Export Excel (.xlsx)
              </button>
            ` : ''}
          </div>
        </div>

        <!-- Module Sub-Tabs -->
        <div class="bg-white p-1.5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap gap-1 no-print">
          <button class="pay-tab-btn px-4 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 ${activeTab === 'ledger' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'}" data-tab="ledger">
            ${Components.icon('wallet', 'w-3.5 h-3.5')} ${I18n.t('payments.tabLedger', 'Student Fee Ledger')}
          </button>
          <button class="pay-tab-btn px-4 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 ${activeTab === 'income-expenses' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'}" data-tab="income-expenses">
            ${Components.icon('dollar-sign', 'w-3.5 h-3.5')} ${I18n.t('payments.tabIncomeExpenses', 'Income & Expenses')}
          </button>
          <button class="pay-tab-btn px-4 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 ${activeTab === 'history' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'}" data-tab="history">
            ${Components.icon('file-spreadsheet', 'w-3.5 h-3.5')} ${I18n.t('payments.tabHistory', 'Transaction History')}
          </button>
        </div>

        ${activeTab === 'ledger' ? this.renderFeeLedgerTab(ledger, classes, settings, currency, canAdd) : ''}
        ${activeTab === 'income-expenses' ? this.renderIncomeExpensesTab(settings, currency, canEdit, canDelete) : ''}
        ${activeTab === 'history' ? this.renderHistoryTab(settings, currency) : ''}
      </div>
    `;

    this.bindEvents(container, ledger, settings, currency);
  },

  renderFeeLedgerTab(ledger, classes, settings, currency, canAdd) {
    const totalDue = ledger.reduce((sum, item) => sum + item.totalDue, 0);
    const totalCollected = ledger.reduce((sum, item) => sum + item.totalPaid, 0);
    const totalOutstanding = ledger.reduce((sum, item) => sum + item.outstandingBalance, 0);

    const paidCount = ledger.filter(item => item.status === 'Paid').length;
    const partialCount = ledger.filter(item => item.status === 'Partially Paid').length;
    const unpaidCount = ledger.filter(item => item.status === 'Unpaid').length;

    let filteredLedger = ledger;
    if (feeSearch) {
      const q = feeSearch.toLowerCase();
      filteredLedger = filteredLedger.filter(item =>
        item.studentName.toLowerCase().includes(q) || item.studentId.toLowerCase().includes(q)
      );
    }
    if (feeClassFilter) {
      filteredLedger = filteredLedger.filter(item => item.classId === feeClassFilter);
    }

    return `
      <!-- Metric KPI Cards -->
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <span class="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">${I18n.t('payments.totalDue', 'Total Obligation')}</span>
          <h3 class="text-lg font-bold text-slate-900 mt-1 tabular-nums">${currency}${totalDue.toFixed(2)}</h3>
          <span class="text-[10px] text-slate-500">Period: ${activeMonth}</span>
        </div>

        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <span class="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">${I18n.t('payments.collected', 'Collected')}</span>
          <h3 class="text-lg font-bold text-emerald-600 mt-1 tabular-nums">${currency}${totalCollected.toFixed(2)}</h3>
          <span class="text-[10px] text-emerald-600 font-semibold">${totalDue > 0 ? Math.round((totalCollected / totalDue) * 100) : 0}% reconciled</span>
        </div>

        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <span class="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">${I18n.t('payments.outstanding', 'Outstanding')}</span>
          <h3 class="text-lg font-bold text-rose-600 mt-1 tabular-nums">${currency}${totalOutstanding.toFixed(2)}</h3>
          <span class="text-[10px] text-rose-500 font-semibold">${totalDue > 0 ? Math.round((totalOutstanding / totalDue) * 100) : 0}% pending</span>
        </div>

        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <span class="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">${I18n.t('payments.fullyPaid', 'Fully Paid')}</span>
          <h3 class="text-lg font-bold text-emerald-700 mt-1 tabular-nums">${paidCount}</h3>
          <span class="text-[10px] text-slate-500">Students clear</span>
        </div>

        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <span class="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">${I18n.t('payments.partiallyPaid', 'Partially Paid')}</span>
          <h3 class="text-lg font-bold text-amber-600 mt-1 tabular-nums">${partialCount}</h3>
          <span class="text-[10px] text-slate-500">Partial balances</span>
        </div>

        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <span class="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">${I18n.t('payments.unpaid', 'Unpaid')}</span>
          <h3 class="text-lg font-bold text-rose-700 mt-1 tabular-nums">${unpaidCount}</h3>
          <span class="text-[10px] text-slate-500">No payment logged</span>
        </div>
      </div>

      <!-- Filter & Month Toolbar -->
      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div class="flex items-center gap-3 w-full md:w-auto">
          <div>
            <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">${I18n.t('payments.billingMonth', 'Billing Month:')}</label>
            <input 
              type="month" 
              id="fee-month-input" 
              value="${activeMonth}" 
              class="py-1.5 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-semibold text-slate-800"
            />
          </div>

          <div>
            <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Filter Class:</label>
            <select id="fee-class-filter" class="py-1.5 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-medium text-slate-800">
              <option value="">All Classes (${ledger.length})</option>
              ${classes.map(c => `
                <option value="${c.id}" ${feeClassFilter === c.id ? 'selected' : ''}>
                  ${c.name}
                </option>
              `).join('')}
            </select>
          </div>
        </div>

        <div class="relative w-full md:w-72">
          <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            ${Components.icon('search', 'w-3.5 h-3.5')}
          </span>
          <input 
            type="text" 
            id="fee-search-input" 
            placeholder="Search student in ledger..." 
            value="${feeSearch}"
            class="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 text-slate-800"
          />
        </div>
      </div>

      <!-- Master Student Fee Ledger Table -->
      <div class="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div class="p-3 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Roster includes ALL registered students · Configured rates: Class Fee (${currency}${settings.classFeeMonthly}/mo), School Fee (${currency}${settings.schoolFeeMonthly}/mo)</span>
          <span>Ledger Period: <strong>${activeMonth}</strong></span>
        </div>

        <div class="overflow-x-auto custom-scrollbar">
          <table class="w-full text-left text-xs text-slate-600">
            <thead class="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th class="py-3 px-4">${I18n.t('students.studentId', 'Student ID')}</th>
                <th class="py-3 px-4">${I18n.t('students.fullName', 'Student Name')}</th>
                <th class="py-3 px-4">${I18n.t('students.classLabel', 'Class')}</th>
                <th class="py-3 px-4">${I18n.t('payments.classFeeStatus', 'Class Fee Status')}</th>
                <th class="py-3 px-4">${I18n.t('payments.schoolFeeStatus', 'School Fee Status')}</th>
                <th class="py-3 px-4 text-right">${I18n.t('payments.amountPaid', 'Amount Paid')}</th>
                <th class="py-3 px-4 text-right">${I18n.t('payments.outstandingBalance', 'Outstanding Balance')}</th>
                <th class="py-3 px-4 text-right">${I18n.t('common.actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${filteredLedger.length > 0 ? filteredLedger.map(item => {
                const getStatusBadge = (status) => {
                  if (status === 'Paid') return '<span class="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Paid</span>';
                  if (status === 'Partially Paid') return '<span class="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">Partial</span>';
                  return '<span class="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">Unpaid</span>';
                };

                return `
                  <tr class="hover:bg-slate-50 transition-colors">
                    <td class="py-3 px-4 font-mono font-medium text-blue-600">${item.studentId}</td>
                    <td class="py-3 px-4 font-semibold text-slate-900">${item.studentName}</td>
                    <td class="py-3 px-4">${item.className}</td>
                    <td class="py-3 px-4">${getStatusBadge(item.classFeeStatus)}</td>
                    <td class="py-3 px-4">${getStatusBadge(item.schoolFeeStatus)}</td>
                    <td class="py-3 px-4 text-right tabular-nums font-bold text-slate-900">${currency}${item.totalPaid.toFixed(2)}</td>
                    <td class="py-3 px-4 text-right tabular-nums font-bold ${item.outstandingBalance > 0 ? 'text-rose-600' : 'text-slate-400'}">
                      ${currency}${item.outstandingBalance.toFixed(2)}
                    </td>
                    <td class="py-3 px-4 text-right whitespace-nowrap">
                      <div class="inline-flex items-center gap-1.5">
                        ${canAdd ? `
                          <button class="quick-pay-btn px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors" data-id="${item.studentId}">
                            ${I18n.t('payments.pay', 'Pay')}
                          </button>
                        ` : ''}
                        <button class="view-history-btn p-1 text-slate-400 hover:text-slate-700" data-id="${item.studentId}" title="View Transactions">
                          ${Components.icon('eye', 'w-4 h-4')}
                        </button>
                      </div>
                    </td>
                  </tr>
                `;
              }).join('') : `
                <tr><td colspan="8" class="p-8 text-center text-slate-400">No students found matching filters.</td></tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  _getFilteredIncomeExpenseEntries() {
    const filterObj = {
      search: ieSearch || undefined,
      category: ieCategoryFilter || undefined,
      paymentMethod: ieMethodFilter || undefined,
      startDate: ieStartDate || undefined,
      endDate: ieEndDate || undefined
    };

    const incomes = (ieTypeFilter === 'expense') ? [] : Data.getIncomes(filterObj).map(i => ({ ...i, entryType: 'income' }));
    const expenses = (ieTypeFilter === 'income') ? [] : Data.getExpenses(filterObj).map(e => ({ ...e, entryType: 'expense' }));

    return [...incomes, ...expenses].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  },

  renderIncomeExpensesTab(settings, currency, canEdit, canDelete) {
    const overview = Data.getFinancialOverview({
      paymentMethod: ieMethodFilter || undefined,
      startDate: ieStartDate || undefined,
      endDate: ieEndDate || undefined
    });

    const allIncomes = Data.getIncomes();
    const allExpenses = Data.getExpenses();
    const categories = Array.from(new Set([
      ...allIncomes.map(i => i.category),
      ...allExpenses.map(e => e.category)
    ])).filter(Boolean);

    const entries = this._getFilteredIncomeExpenseEntries();

    return `
      <div class="space-y-6 printable-area">
        <!-- Print-Only Institutional Header -->
        <div class="hidden print:flex items-start justify-between border-b-2 border-blue-900 pb-4 mb-4">
          <div class="flex items-center gap-3.5">
            ${Components.getLogoHtml('w-14 h-14')}
            <div>
              <span class="text-[10px] font-bold uppercase tracking-wider text-amber-600 block">AL-IMAAMA · Official School System</span>
              <h2 class="text-lg font-extrabold text-blue-900">${settings.institutionName || 'MADARASATUL AL-IMAAM'}</h2>
              <p class="text-xs text-slate-600">${settings.address || 'Hargeisa, Somaliland'} · Tel: ${settings.contactPhone || '063-4129440'}</p>
            </div>
          </div>
          <div class="text-right text-xs">
            <span class="inline-block px-2.5 py-1 font-bold bg-blue-900 text-amber-300 border border-amber-400/50 rounded-md">FINANCIAL INCOME & EXPENSES STATEMENT</span>
            <p class="text-slate-500 mt-1.5">Generated: ${new Date().toLocaleDateString()}</p>
          </div>
        </div>

        <!-- 5 Financial Overview KPI Cards -->
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div class="flex items-center justify-between text-slate-400">
              <span class="text-[10px] font-bold uppercase tracking-wider">${I18n.t('payments.totalIncome', 'Total Income')}</span>
              ${Components.icon('arrow-up-right', 'w-4 h-4 text-emerald-600')}
            </div>
            <h3 class="text-xl font-bold text-emerald-700 mt-1.5 tabular-nums">${currency}${overview.totalIncome.toFixed(2)}</h3>
            <span class="text-[11px] text-slate-500 mt-0.5 block">Fees + Other Income</span>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div class="flex items-center justify-between text-slate-400">
              <span class="text-[10px] font-bold uppercase tracking-wider">${I18n.t('payments.totalExpenses', 'Total Expenses')}</span>
              ${Components.icon('arrow-down-left', 'w-4 h-4 text-rose-600')}
            </div>
            <h3 class="text-xl font-bold text-rose-600 mt-1.5 tabular-nums">${currency}${overview.totalExpenses.toFixed(2)}</h3>
            <span class="text-[11px] text-slate-500 mt-0.5 block">${overview.expensesCount} recorded entries</span>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div class="flex items-center justify-between text-slate-400">
              <span class="text-[10px] font-bold uppercase tracking-wider">${I18n.t('payments.netBalance', 'Net Balance')}</span>
              ${Components.icon('dollar-sign', 'w-4 h-4 text-blue-600')}
            </div>
            <h3 class="text-xl font-bold ${overview.netBalance >= 0 ? 'text-emerald-700' : 'text-rose-700'} mt-1.5 tabular-nums">${currency}${overview.netBalance.toFixed(2)}</h3>
            <span class="text-[11px] text-slate-500 mt-0.5 block">${overview.netBalance >= 0 ? 'Surplus position' : 'Deficit position'}</span>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div class="flex items-center justify-between text-slate-400">
              <span class="text-[10px] font-bold uppercase tracking-wider">${I18n.t('payments.studentFeeCollections', 'Student Fee Collections')}</span>
              ${Components.icon('wallet', 'w-4 h-4 text-blue-600')}
            </div>
            <h3 class="text-xl font-bold text-blue-700 mt-1.5 tabular-nums">${currency}${overview.studentFeeCollections.toFixed(2)}</h3>
            <span class="text-[11px] text-slate-500 mt-0.5 block">${overview.paymentsCount} tuition receipts</span>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div class="flex items-center justify-between text-slate-400">
              <span class="text-[10px] font-bold uppercase tracking-wider">${I18n.t('payments.otherIncome', 'Other Income')}</span>
              ${Components.icon('trending-up', 'w-4 h-4 text-emerald-600')}
            </div>
            <h3 class="text-xl font-bold text-slate-900 mt-1.5 tabular-nums">${currency}${overview.otherIncome.toFixed(2)}</h3>
            <span class="text-[11px] text-slate-500 mt-0.5 block">${overview.incomesCount} non-tuition entries</span>
          </div>
        </div>

        <!-- Filter & Search Bar -->
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3 no-print">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs">
            <div class="lg:col-span-2 relative">
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">Search Entries</label>
              <div class="relative">
                <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  ${Components.icon('search', 'w-3.5 h-3.5')}
                </span>
                <input type="text" id="ie-search-input" value="${ieSearch}" placeholder="Title, category, ref #..." class="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 text-slate-800"/>
              </div>
            </div>

            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">Entry Type</label>
              <select id="ie-type-filter" class="w-full py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-medium text-slate-800">
                <option value="">All Types</option>
                <option value="income" ${ieTypeFilter === 'income' ? 'selected' : ''}>Other Income</option>
                <option value="expense" ${ieTypeFilter === 'expense' ? 'selected' : ''}>Expenses</option>
              </select>
            </div>

            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">Category</label>
              <select id="ie-category-filter" class="w-full py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-medium text-slate-800">
                <option value="">All Categories</option>
                ${categories.map(cat => `<option value="${cat}" ${ieCategoryFilter === cat ? 'selected' : ''}>${cat}</option>`).join('')}
              </select>
            </div>

            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">Method</label>
              <select id="ie-method-filter" class="w-full py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-medium text-slate-800">
                <option value="">All Methods</option>
                <option value="Cash" ${ieMethodFilter === 'Cash' ? 'selected' : ''}>Cash</option>
                <option value="ZAAD" ${ieMethodFilter === 'ZAAD' ? 'selected' : ''}>ZAAD</option>
                <option value="eDahab" ${ieMethodFilter === 'eDahab' ? 'selected' : ''}>eDahab</option>
              </select>
            </div>

            <div class="flex items-end gap-1.5">
              <div class="flex-1">
                <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">From / To</label>
                <div class="flex gap-1">
                  <input type="date" id="ie-start-date" value="${ieStartDate}" title="Start Date" class="w-1/2 py-1.5 px-1.5 text-[11px] bg-slate-50 border border-slate-200 rounded-lg"/>
                  <input type="date" id="ie-end-date" value="${ieEndDate}" title="End Date" class="w-1/2 py-1.5 px-1.5 text-[11px] bg-slate-50 border border-slate-200 rounded-lg"/>
                </div>
              </div>
              ${(ieSearch || ieTypeFilter || ieCategoryFilter || ieMethodFilter || ieStartDate || ieEndDate) ? `
                <button id="ie-clear-filters" class="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[11px] font-semibold" title="Clear Filters">Clear</button>
              ` : ''}
            </div>
          </div>
        </div>

        <!-- Income & Expenses Table -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div class="p-3 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <span>Institutional Other Income & Operating Expenses Ledger</span>
            <span>Showing <strong class="text-slate-800">${entries.length}</strong> records</span>
          </div>

          <div class="overflow-x-auto custom-scrollbar">
            <table class="w-full text-left text-xs text-slate-600">
              <thead class="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th class="py-3 px-4">Date</th>
                  <th class="py-3 px-4">Type</th>
                  <th class="py-3 px-4">Title & Description</th>
                  <th class="py-3 px-4">Category</th>
                  <th class="py-3 px-4">Method</th>
                  <th class="py-3 px-4">Reference #</th>
                  <th class="py-3 px-4 text-right">Amount</th>
                  ${(canEdit || canDelete) ? '<th class="py-3 px-4 text-right no-print">Actions</th>' : ''}
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${entries.length > 0 ? entries.map(entry => {
                  const isInc = entry.entryType === 'income';
                  return `
                    <tr class="hover:bg-slate-50 transition-colors">
                      <td class="py-3 px-4 tabular-nums font-mono text-slate-600 whitespace-nowrap">${entry.date}</td>
                      <td class="py-3 px-4 whitespace-nowrap">
                        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${isInc ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}">
                          ${isInc ? 'Other Income' : 'Expense'}
                        </span>
                      </td>
                      <td class="py-3 px-4">
                        <p class="font-semibold text-slate-900">${entry.title}</p>
                        ${entry.description ? `<p class="text-[11px] text-slate-500">${entry.description}</p>` : ''}
                        ${entry.notes ? `<p class="text-[10px] text-slate-400 italic mt-0.5">${entry.notes}</p>` : ''}
                      </td>
                      <td class="py-3 px-4">
                        <span class="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-medium">${entry.category}</span>
                      </td>
                      <td class="py-3 px-4"><span class="px-1.5 py-0.5 rounded bg-slate-100 font-mono text-[11px]">${entry.paymentMethod}</span></td>
                      <td class="py-3 px-4 font-mono text-slate-500">${entry.referenceNumber || '—'}</td>
                      <td class="py-3 px-4 text-right tabular-nums font-bold ${isInc ? 'text-emerald-600' : 'text-rose-600'} whitespace-nowrap">
                        ${isInc ? '+' : '-'}${currency}${(parseFloat(entry.amount) || 0).toFixed(2)}
                      </td>
                      ${(canEdit || canDelete) ? `
                        <td class="py-3 px-4 text-right whitespace-nowrap no-print">
                          <div class="inline-flex items-center gap-1">
                            ${canEdit ? `
                              <button class="edit-ie-btn p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-md transition-colors" data-type="${entry.entryType}" data-id="${entry.id}" title="Edit">
                                ${Components.icon('edit', 'w-4 h-4')}
                              </button>
                            ` : ''}
                            ${canDelete ? `
                              <button class="delete-ie-btn p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors" data-type="${entry.entryType}" data-id="${entry.id}" title="Delete">
                                ${Components.icon('trash-2', 'w-4 h-4')}
                              </button>
                            ` : ''}
                          </div>
                        </td>
                      ` : ''}
                    </tr>
                  `;
                }).join('') : `
                  <tr><td colspan="${(canEdit || canDelete) ? 8 : 7}" class="p-8 text-center text-slate-400">No income or expense entries match the active filters.</td></tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  _getUnifiedHistoryEntries() {
    const payments = Data.getPayments();
    const incomes = Data.getIncomes();
    const expenses = Data.getExpenses();
    const students = Data.getStudents();

    const list = [];
    payments.forEach(p => {
      const st = students.find(s => s.id === p.studentId);
      list.push({
        id: p.id,
        kind: 'fee',
        date: p.paymentDate,
        title: `${st ? st.fullName : p.studentId} (${p.feeCategory})`,
        category: p.feeCategory,
        method: p.paymentMethod,
        ref: p.transactionRef,
        amount: parseFloat(p.amountPaid) || 0,
        isOutflow: false,
        rawPayment: p
      });
    });

    incomes.forEach(i => {
      list.push({
        id: i.id,
        kind: 'income',
        date: i.date,
        title: i.title,
        category: i.category,
        method: i.paymentMethod,
        ref: i.referenceNumber,
        amount: parseFloat(i.amount) || 0,
        isOutflow: false
      });
    });

    expenses.forEach(e => {
      list.push({
        id: e.id,
        kind: 'expense',
        date: e.date,
        title: e.title,
        category: e.category,
        method: e.paymentMethod,
        ref: e.referenceNumber,
        amount: parseFloat(e.amount) || 0,
        isOutflow: true
      });
    });

    let filtered = list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (histTypeFilter) {
      filtered = filtered.filter(x => x.kind === histTypeFilter);
    }
    if (histSearch) {
      const q = histSearch.toLowerCase();
      filtered = filtered.filter(x =>
        (x.title || '').toLowerCase().includes(q) ||
        (x.category || '').toLowerCase().includes(q) ||
        (x.ref || '').toLowerCase().includes(q) ||
        (x.method || '').toLowerCase().includes(q)
      );
    }
    return filtered;
  },

  renderHistoryTab(settings, currency) {
    const entries = this._getUnifiedHistoryEntries();

    return `
      <div class="space-y-4">
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <div class="flex items-center gap-3 w-full sm:w-auto">
            <select id="hist-type-filter" class="py-1.5 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-medium text-slate-800">
              <option value="">All Transactions (${entries.length})</option>
              <option value="fee" ${histTypeFilter === 'fee' ? 'selected' : ''}>Student Fee Payments</option>
              <option value="income" ${histTypeFilter === 'income' ? 'selected' : ''}>Other Income</option>
              <option value="expense" ${histTypeFilter === 'expense' ? 'selected' : ''}>Expenses</option>
            </select>
          </div>
          <div class="relative w-full sm:w-72">
            <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              ${Components.icon('search', 'w-3.5 h-3.5')}
            </span>
            <input type="text" id="hist-search-input" value="${histSearch}" placeholder="Search reference, name, category..." class="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 text-slate-800"/>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div class="overflow-x-auto custom-scrollbar">
            <table class="w-full text-left text-xs text-slate-600">
              <thead class="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th class="py-3 px-4">Date</th>
                  <th class="py-3 px-4">Source</th>
                  <th class="py-3 px-4">Title / Student</th>
                  <th class="py-3 px-4">Category</th>
                  <th class="py-3 px-4">Method</th>
                  <th class="py-3 px-4">Reference #</th>
                  <th class="py-3 px-4 text-right">Amount</th>
                  <th class="py-3 px-4 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${entries.length > 0 ? entries.map(row => `
                  <tr class="hover:bg-slate-50">
                    <td class="py-3 px-4 tabular-nums font-mono">${row.date}</td>
                    <td class="py-3 px-4">
                      <span class="px-2 py-0.5 rounded text-[10px] font-bold ${
                        row.kind === 'fee' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                        row.kind === 'income' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                        'bg-rose-50 text-rose-700 border border-rose-200'
                      }">
                        ${row.kind === 'fee' ? 'Student Fee' : row.kind === 'income' ? 'Other Income' : 'Expense'}
                      </span>
                    </td>
                    <td class="py-3 px-4 font-semibold text-slate-900">${row.title}</td>
                    <td class="py-3 px-4">${row.category}</td>
                    <td class="py-3 px-4"><span class="px-1.5 py-0.5 rounded bg-slate-100 font-mono text-[11px]">${row.method}</span></td>
                    <td class="py-3 px-4 font-mono text-slate-500">${row.ref || '—'}</td>
                    <td class="py-3 px-4 text-right tabular-nums font-bold ${row.isOutflow ? 'text-rose-600' : 'text-emerald-600'}">
                      ${row.isOutflow ? '-' : '+'}${currency}${row.amount.toFixed(2)}
                    </td>
                    <td class="py-3 px-4 text-right">
                      ${row.kind === 'fee' ? `
                        <button class="hist-receipt-btn text-blue-600 hover:underline font-semibold" data-id="${row.id}">Receipt</button>
                      ` : '<span class="text-slate-400">—</span>'}
                    </td>
                  </tr>
                `).join('') : `
                  <tr><td colspan="8" class="p-8 text-center text-slate-400">No financial transactions found.</td></tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  bindEvents(container, ledger, settings, currency) {
    // Sub-tab switcher
    container.querySelectorAll('.pay-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        this.render(container);
      });
    });

    // Fee Ledger events
    const monthInput = container.querySelector('#fee-month-input');
    if (monthInput) {
      monthInput.addEventListener('change', (e) => {
        activeMonth = e.target.value;
        this.render(container);
      });
    }

    const classFilter = container.querySelector('#fee-class-filter');
    if (classFilter) {
      classFilter.addEventListener('change', (e) => {
        feeClassFilter = e.target.value;
        this.render(container);
      });
    }

    const searchInput = container.querySelector('#fee-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        feeSearch = e.target.value;
        this.render(container);
      });
    }

    const exportBtn = container.querySelector('#export-fees-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportFeeLedger(ledger));
    }

    const recordBtn = container.querySelector('#record-payment-btn');
    if (recordBtn) {
      recordBtn.addEventListener('click', () => this.openRecordPaymentModal(null, container));
    }

    container.querySelectorAll('.quick-pay-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.openRecordPaymentModal(btn.dataset.id, container);
      });
    });

    container.querySelectorAll('.view-history-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.openPaymentHistoryModal(btn.dataset.id);
      });
    });

    // Income & Expenses events
    const addIncomeBtn = container.querySelector('#add-income-btn');
    if (addIncomeBtn) {
      addIncomeBtn.addEventListener('click', () => this.openIncomeExpenseModal('income', null, container));
    }

    const addExpenseBtn = container.querySelector('#add-expense-btn');
    if (addExpenseBtn) {
      addExpenseBtn.addEventListener('click', () => this.openIncomeExpenseModal('expense', null, container));
    }

    const iePrintBtn = container.querySelector('#ie-print-btn');
    if (iePrintBtn) iePrintBtn.addEventListener('click', () => Components.triggerPrint({ orientation: 'portrait' }));

    const iePdfBtn = container.querySelector('#ie-pdf-btn');
    if (iePdfBtn) iePdfBtn.addEventListener('click', () => Components.triggerPrint({ orientation: 'portrait' }));

    const ieExcelBtn = container.querySelector('#ie-excel-btn');
    if (ieExcelBtn) {
      ieExcelBtn.addEventListener('click', () => {
        const entries = this._getFilteredIncomeExpenseEntries();
        const headers = ['Date', 'Type', 'Title', 'Category', 'Description', 'Method', 'Reference Number', 'Notes', `Amount (${currency})`];
        const rows = entries.map(e => [
          e.date,
          e.entryType === 'income' ? 'Other Income' : 'Expense',
          e.title,
          e.category,
          e.description || '',
          e.paymentMethod,
          e.referenceNumber || '',
          e.notes || '',
          (e.entryType === 'income' ? 1 : -1) * (parseFloat(e.amount) || 0)
        ]);
        Components.exportToExcel(
          `AL_IMAAMA_Income_Expenses_${new Date().toISOString().split('T')[0]}.xlsx`,
          'Income and Expenses',
          headers,
          rows
        );
        Components.showToast('Income & Expenses exported to Excel (.xlsx).', 'success');
      });
    }

    const ieSearchInput = container.querySelector('#ie-search-input');
    if (ieSearchInput) {
      ieSearchInput.addEventListener('input', (e) => {
        ieSearch = e.target.value;
        this.render(container);
      });
    }

    const ieTypeSelect = container.querySelector('#ie-type-filter');
    if (ieTypeSelect) {
      ieTypeSelect.addEventListener('change', (e) => {
        ieTypeFilter = e.target.value;
        this.render(container);
      });
    }

    const ieCatSelect = container.querySelector('#ie-category-filter');
    if (ieCatSelect) {
      ieCatSelect.addEventListener('change', (e) => {
        ieCategoryFilter = e.target.value;
        this.render(container);
      });
    }

    const ieMethodSelect = container.querySelector('#ie-method-filter');
    if (ieMethodSelect) {
      ieMethodSelect.addEventListener('change', (e) => {
        ieMethodFilter = e.target.value;
        this.render(container);
      });
    }

    const ieStartInput = container.querySelector('#ie-start-date');
    if (ieStartInput) {
      ieStartInput.addEventListener('change', (e) => {
        ieStartDate = e.target.value;
        this.render(container);
      });
    }

    const ieEndInput = container.querySelector('#ie-end-date');
    if (ieEndInput) {
      ieEndInput.addEventListener('change', (e) => {
        ieEndDate = e.target.value;
        this.render(container);
      });
    }

    const ieClearBtn = container.querySelector('#ie-clear-filters');
    if (ieClearBtn) {
      ieClearBtn.addEventListener('click', () => {
        ieSearch = '';
        ieTypeFilter = '';
        ieCategoryFilter = '';
        ieMethodFilter = '';
        ieStartDate = '';
        ieEndDate = '';
        this.render(container);
      });
    }

    container.querySelectorAll('.edit-ie-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        const id = btn.dataset.id;
        const existing = type === 'income'
          ? Data.getIncomes().find(i => i.id === id)
          : Data.getExpenses().find(e => e.id === id);
        if (existing) this.openIncomeExpenseModal(type, existing, container);
      });
    });

    container.querySelectorAll('.delete-ie-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        const id = btn.dataset.id;
        const existing = type === 'income'
          ? Data.getIncomes().find(i => i.id === id)
          : Data.getExpenses().find(e => e.id === id);
        if (!existing) return;

        Components.confirmDialog({
          title: `Delete ${type === 'income' ? 'Income' : 'Expense'}: ${existing.title}`,
          message: `Are you sure you want to permanently remove <strong>${existing.title}</strong> (${currency}${(parseFloat(existing.amount) || 0).toFixed(2)})? Financial totals will recalculate immediately.`,
          confirmText: 'Delete Entry',
          isDestructive: true,
          onConfirm: () => {
            if (type === 'income') {
              Data.deleteIncome(id);
            } else {
              Data.deleteExpense(id);
            }
            Components.showToast(`${type === 'income' ? 'Income' : 'Expense'} entry deleted.`, 'success');
            this.render(container);
          }
        });
      });
    });

    // Transaction History events
    const histTypeSelect = container.querySelector('#hist-type-filter');
    if (histTypeSelect) {
      histTypeSelect.addEventListener('change', (e) => {
        histTypeFilter = e.target.value;
        this.render(container);
      });
    }

    const histSearchInput = container.querySelector('#hist-search-input');
    if (histSearchInput) {
      histSearchInput.addEventListener('input', (e) => {
        histSearch = e.target.value;
        this.render(container);
      });
    }

    const histExcelBtn = container.querySelector('#hist-excel-btn');
    if (histExcelBtn) {
      histExcelBtn.addEventListener('click', () => {
        const entries = this._getUnifiedHistoryEntries();
        const headers = ['Date', 'Source', 'Title / Student', 'Category', 'Method', 'Reference', `Amount (${currency})`];
        const rows = entries.map(r => [
          r.date,
          r.kind === 'fee' ? 'Student Fee' : r.kind === 'income' ? 'Other Income' : 'Expense',
          r.title,
          r.category,
          r.method,
          r.ref || '',
          (r.isOutflow ? -1 : 1) * r.amount
        ]);
        Components.exportToExcel(
          `AL_IMAAMA_Transactions_${new Date().toISOString().split('T')[0]}.xlsx`,
          'Transactions',
          headers,
          rows
        );
        Components.showToast('Transaction history exported to Excel (.xlsx).', 'success');
      });
    }

    container.querySelectorAll('.hist-receipt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = Data.getPayments().find(x => x.id === btn.dataset.id);
        if (!p) return;
        const student = Data.getStudentById(p.studentId);
        const studentClass = student ? Data.getClassById(student.classId) : null;
        if (student) Components.showReceiptModal(p, student, studentClass, settings);
      });
    });
  },

  openIncomeExpenseModal(type = 'income', existing = null, parentContainer) {
    const isEdit = !!existing;
    const isIncome = type === 'income';
    const settings = Data.getSettings();
    const currency = settings.currencySymbol || '$';
    const today = new Date().toISOString().split('T')[0];
    const presetCats = isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

    const content = `
      <form id="ie-form" class="space-y-4 text-xs">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block font-semibold text-slate-700 mb-1">1. Title <span class="text-rose-500">*</span></label>
            <input type="text" name="title" required placeholder="${isIncome ? 'e.g. Community Waqf Donation' : 'e.g. Monthly Electricity Bill'}" value="${isEdit ? existing.title : ''}" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600"/>
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">2. Category <span class="text-rose-500">*</span></label>
            <input list="ie-cat-datalist" name="category" required placeholder="Select or type category" value="${isEdit ? existing.category : presetCats[0]}" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600"/>
            <datalist id="ie-cat-datalist">
              ${presetCats.map(c => `<option value="${c}">`).join('')}
            </datalist>
          </div>
        </div>

        <div>
          <label class="block font-semibold text-slate-700 mb-1">3. Description</label>
          <input type="text" name="description" placeholder="Brief explanation of the transaction..." value="${isEdit ? (existing.description || '') : ''}" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600"/>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label class="block font-semibold text-slate-700 mb-1">4. Amount (${currency}) <span class="text-rose-500">*</span></label>
            <input type="number" name="amount" step="0.01" min="0.01" required value="${isEdit ? existing.amount : ''}" placeholder="0.00" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-mono font-bold"/>
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">5. Payment Method <span class="text-rose-500">*</span></label>
            <select name="paymentMethod" required class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-medium">
              <option value="Cash" ${isEdit && existing.paymentMethod === 'Cash' ? 'selected' : ''}>Cash</option>
              <option value="ZAAD" ${isEdit && existing.paymentMethod === 'ZAAD' ? 'selected' : ''}>ZAAD</option>
              <option value="eDahab" ${isEdit && existing.paymentMethod === 'eDahab' ? 'selected' : ''}>eDahab</option>
            </select>
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">6. Date <span class="text-rose-500">*</span></label>
            <input type="date" name="date" required value="${isEdit ? existing.date : today}" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600"/>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block font-semibold text-slate-700 mb-1">7. Reference Number</label>
            <input type="text" name="referenceNumber" placeholder="${isIncome ? 'e.g. INC-2026-101' : 'e.g. EXP-2026-101'}" value="${isEdit ? (existing.referenceNumber || '') : ''}" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-mono"/>
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">8. Notes</label>
            <input type="text" name="notes" placeholder="Optional internal remarks..." value="${isEdit ? (existing.notes || '') : ''}" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600"/>
          </div>
        </div>

        <div class="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <button type="button" id="ie-modal-cancel" class="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
          <button type="submit" class="px-4 py-2 text-xs font-semibold text-white ${isIncome ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'} rounded-lg shadow-sm">
            ${isEdit ? 'Update Entry' : (isIncome ? 'Save Income Entry' : 'Save Expense Entry')}
          </button>
        </div>
      </form>
    `;

    const title = isEdit
      ? `Edit ${isIncome ? 'Income' : 'Expense'}: ${existing.title}`
      : (isIncome ? 'Record Other Income' : 'Record Institutional Expense');

    Components.openModal(content, title, { maxWidth: 'max-w-xl' });
    document.getElementById('ie-modal-cancel').addEventListener('click', () => Components.closeModal());

    document.getElementById('ie-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        title: fd.get('title'),
        category: fd.get('category'),
        description: fd.get('description'),
        amount: fd.get('amount'),
        paymentMethod: fd.get('paymentMethod'),
        date: fd.get('date'),
        referenceNumber: fd.get('referenceNumber'),
        notes: fd.get('notes')
      };

      if (isIncome) {
        if (isEdit) {
          Data.updateIncome(existing.id, payload);
          Components.showToast(`Income "${payload.title}" updated.`, 'success');
        } else {
          Data.addIncome(payload);
          Components.showToast(`Income "${payload.title}" recorded.`, 'success');
        }
      } else {
        if (isEdit) {
          Data.updateExpense(existing.id, payload);
          Components.showToast(`Expense "${payload.title}" updated.`, 'success');
        } else {
          Data.addExpense(payload);
          Components.showToast(`Expense "${payload.title}" recorded.`, 'success');
        }
      }

      Components.closeModal();
      this.render(parentContainer);
    });
  },

  openRecordPaymentModal(preselectedStudentId = null, parentContainer) {
    const students = Data.getStudents();
    const settings = Data.getSettings();
    const currency = settings.currencySymbol || '$';
    const classes = Data.getClasses();

    const selectedStudent = preselectedStudentId ? Data.getStudentById(preselectedStudentId) : students[0];
    const initialCategory = 'Class Fee';
    const initialDue = initialCategory === 'Class Fee' ? settings.classFeeMonthly : settings.schoolFeeMonthly;
    const today = new Date().toISOString().split('T')[0];

    const content = `
      <form id="record-payment-form" class="space-y-4 text-xs">
        <div>
          <label class="block font-semibold text-slate-700 mb-1">Select Student <span class="text-rose-500">*</span></label>
          <select name="studentId" id="pay-student-select" required class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-semibold text-slate-800">
            ${students.map(s => {
              const cls = classes.find(c => c.id === s.classId);
              return `
                <option value="${s.id}" ${selectedStudent && selectedStudent.id === s.id ? 'selected' : ''}>
                  ${s.fullName} (${s.id} · ${cls ? cls.name : ''})
                </option>
              `;
            }).join('')}
          </select>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-semibold text-slate-700 mb-1">Fee Category <span class="text-rose-500">*</span></label>
            <select name="feeCategory" id="pay-category-select" required class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-medium">
              <option value="Class Fee" selected>Class Fee</option>
              <option value="School Fee">School Fee</option>
            </select>
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">Billing Month <span class="text-rose-500">*</span></label>
            <input 
              type="month" 
              name="month" 
              required 
              value="${activeMonth}" 
              class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-medium text-slate-800"
            />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-semibold text-slate-700 mb-1">Amount Due (${currency})</label>
            <input 
              type="number" 
              name="amountDue" 
              id="pay-amount-due" 
              readonly 
              value="${initialDue}" 
              class="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg font-mono font-bold text-slate-700 cursor-not-allowed"
            />
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">Amount Paid (${currency}) <span class="text-rose-500">*</span></label>
            <input 
              type="number" 
              name="amountPaid" 
              id="pay-amount-paid" 
              step="0.01" 
              min="1" 
              required 
              value="${initialDue}" 
              class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-mono font-bold text-emerald-700"
            />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-semibold text-slate-700 mb-1">Payment Method <span class="text-rose-500">*</span></label>
            <select name="paymentMethod" required class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-medium">
              <option value="ZAAD">ZAAD Mobile Money</option>
              <option value="eDahab">eDahab Mobile Money</option>
              <option value="Cash">Cash at Bursar</option>
            </select>
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">Payment Date <span class="text-rose-500">*</span></label>
            <input 
              type="date" 
              name="paymentDate" 
              required 
              value="${today}" 
              class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 text-slate-800"
            />
          </div>
        </div>

        <div>
          <label class="block font-semibold text-slate-700 mb-1">Transaction Reference (Optional)</label>
          <input 
            type="text" 
            name="transactionRef" 
            placeholder="e.g. ZAAD-789012 or Cash Receipt #104" 
            class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-mono"
          />
        </div>

        <div class="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs text-slate-600">
          <span>Remaining Balance for this obligation:</span>
          <span id="remaining-balance-preview" class="font-bold font-mono text-emerald-600 tabular-nums">${currency}0.00</span>
        </div>

        <div class="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <button type="button" id="modal-cancel-pay" class="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button type="submit" class="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors">
            Record Transaction & Issue Receipt
          </button>
        </div>
      </form>
    `;

    Components.openModal(content, 'Record Tuition & Fee Payment', { maxWidth: 'max-w-md' });

    document.getElementById('modal-cancel-pay').addEventListener('click', () => Components.closeModal());

    const catSelect = document.getElementById('pay-category-select');
    const dueInput = document.getElementById('pay-amount-due');
    const paidInput = document.getElementById('pay-amount-paid');
    const balancePreview = document.getElementById('remaining-balance-preview');

    const updatePreview = () => {
      const due = parseFloat(dueInput.value) || 0;
      const paid = parseFloat(paidInput.value) || 0;
      const rem = Math.max(0, due - paid);
      balancePreview.textContent = `${currency}${rem.toFixed(2)}`;
      balancePreview.className = rem > 0 ? 'font-bold font-mono text-rose-600' : 'font-bold font-mono text-emerald-600';
    };

    if (catSelect) {
      catSelect.addEventListener('change', (e) => {
        const val = e.target.value === 'Class Fee' ? settings.classFeeMonthly : settings.schoolFeeMonthly;
        dueInput.value = val;
        paidInput.value = val;
        updatePreview();
      });
    }

    if (paidInput) {
      paidInput.addEventListener('input', updatePreview);
    }

    document.getElementById('record-payment-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target;
      const formData = new FormData(form);

      const user = Auth.getCurrentUser();
      const paymentPayload = {
        studentId: formData.get('studentId'),
        feeCategory: formData.get('feeCategory'),
        month: formData.get('month'),
        amountDue: formData.get('amountDue'),
        amountPaid: formData.get('amountPaid'),
        paymentMethod: formData.get('paymentMethod'),
        paymentDate: formData.get('paymentDate'),
        transactionRef: formData.get('transactionRef'),
        recordedBy: user ? user.fullName : 'Administrator'
      };

      const recorded = Data.recordPayment(paymentPayload);
      Components.closeModal();
      Components.showToast(`Recorded ${paymentPayload.feeCategory} payment of ${currency}${paymentPayload.amountPaid} via ${paymentPayload.paymentMethod}.`, 'success');

      const student = Data.getStudentById(paymentPayload.studentId);
      const studentClass = classes.find(c => c.id === student.classId);
      Components.showReceiptModal(recorded, student, studentClass, settings);

      if (parentContainer) this.render(parentContainer);
    });
  },

  openPaymentHistoryModal(studentId) {
    const student = Data.getStudentById(studentId);
    if (!student) return;

    const payments = Data.getPayments({ studentId });
    const settings = Data.getSettings();
    const currency = settings.currencySymbol || '$';
    const classes = Data.getClasses();
    const studentClass = classes.find(c => c.id === student.classId);

    const content = `
      <div class="space-y-4">
        <div class="flex items-center justify-between pb-3 border-b border-slate-200">
          <div>
            <h3 class="text-sm font-bold text-slate-900">${student.fullName}</h3>
            <p class="text-xs text-slate-500 font-mono">ID: ${student.id} · Class: ${studentClass ? studentClass.name : 'N/A'}</p>
          </div>
          <span class="text-xs text-slate-500">${payments.length} transactions recorded</span>
        </div>

        <div class="max-h-72 overflow-y-auto custom-scrollbar border border-slate-200 rounded-lg">
          <table class="w-full text-left text-xs text-slate-600">
            <thead class="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th class="py-2.5 px-3">Date</th>
                <th class="py-2.5 px-3">Category</th>
                <th class="py-2.5 px-3">Month</th>
                <th class="py-2.5 px-3">Method</th>
                <th class="py-2.5 px-3 text-right">Amount</th>
                <th class="py-2.5 px-3 text-right">Receipt</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${payments.length > 0 ? payments.map(p => `
                <tr class="hover:bg-slate-50">
                  <td class="py-2 px-3 tabular-nums">${p.paymentDate}</td>
                  <td class="py-2 px-3 font-medium text-slate-800">${p.feeCategory}</td>
                  <td class="py-2 px-3 font-mono text-slate-500">${p.month}</td>
                  <td class="py-2 px-3"><span class="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-mono">${p.paymentMethod}</span></td>
                  <td class="py-2 px-3 text-right tabular-nums font-bold text-emerald-600">${currency}${p.amountPaid.toFixed(2)}</td>
                  <td class="py-2 px-3 text-right">
                    <button class="view-single-receipt-btn text-blue-600 hover:underline font-semibold" data-id="${p.id}">
                      Print
                    </button>
                  </td>
                </tr>
              `).join('') : `
                <tr><td colspan="6" class="p-6 text-center text-slate-400">No payment transactions recorded for this student.</td></tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;

    Components.openModal(content, `Payment Ledger: ${student.fullName}`, { maxWidth: 'max-w-xl' });

    document.querySelectorAll('.view-single-receipt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const pay = payments.find(p => p.id === btn.dataset.id);
        if (pay) Components.showReceiptModal(pay, student, studentClass, settings);
      });
    });
  },

  exportFeeLedger(ledger) {
    const settings = Data.getSettings();
    const currency = settings.currencySymbol || '$';

    const headers = ['Student ID', 'Student Name', 'Class', 'Period', 'Class Fee Status', 'School Fee Status', `Amount Paid (${currency})`, `Outstanding Balance (${currency})`];
    const rows = ledger.map(item => [
      item.studentId,
      item.studentName,
      item.className,
      item.targetMonth,
      item.classFeeStatus,
      item.schoolFeeStatus,
      item.totalPaid,
      item.outstandingBalance
    ]);

    Components.exportToExcel(
      `AL_IMAAMA_Fee_Ledger_${activeMonth}.xlsx`,
      'Fee Ledger',
      headers,
      rows
    );
    Components.showToast('Fee ledger exported to Excel (.xlsx) successfully.', 'success');
  }
};
