/**
 * AL-IMAAMA - School Reports Module (MADARASATUL AL-IMAAM)
 * Professional Madrasah reporting system with 7 simplified report categories, sub-report views,
 * strict Madrasah terminology, single-row aligned tables, RBAC & teacher subject isolation,
 * official letterhead Print, PDF Export (jsPDF), and real Excel (.xlsx) Export (SheetJS).
 */

import { Data } from './data.js';
import { Auth } from './auth.js';
import { Permissions } from './permissions.js';
import { Components } from './components.js';
import { I18n } from './i18n.js';

let selectedCategory = 'students';
let selectedSubReport = 'all';

// Relevant filter states
let filterClassId = '';
let filterStudentId = '';
let filterStudentQuery = '';
let filterAcademicYear = '';
let filterTerm = '';
let filterExamType = '';
let filterSubjectId = '';
let filterDate = new Date().toISOString().split('T')[0];
let filterMonth = new Date().toISOString().slice(0, 7);
let filterStartDate = '';
let filterEndDate = '';
let filterPaymentStatus = '';

let activeReportData = null;

const CATEGORY_DEFINITIONS = [
  {
    id: 'students',
    number: '1',
    titleKey: 'reports.catStudents',
    title: '1. Student Reports',
    shortTitle: 'Student Reports',
    icon: 'graduation-cap',
    description: 'View complete student lists, class rosters, and individual student profiles.',
    defaultSub: 'all',
    subReports: [
      { id: 'all', label: 'Complete Student List', adminOnly: true },
      { id: 'by-class', label: 'Class Student List' },
      { id: 'individual', label: 'Individual Student Report' }
    ]
  },
  {
    id: 'attendance',
    number: '2',
    titleKey: 'reports.catAttendance',
    title: '2. Attendance Reports',
    shortTitle: 'Attendance Reports',
    icon: 'clipboard-check',
    description: 'Monitor daily attendance, monthly student summaries, attendance history, and class attendance summaries.',
    defaultSub: 'daily',
    subReports: [
      { id: 'daily', label: 'Daily Attendance Report' },
      { id: 'monthly', label: 'Monthly Attendance Summary' },
      { id: 'individual', label: 'Student Attendance History' },
      { id: 'class', label: 'Class Attendance Summary' }
    ]
  },
  {
    id: 'examinations',
    number: '3',
    titleKey: 'reports.catExams',
    title: '3. Examination Reports',
    shortTitle: 'Examination Reports',
    icon: 'file-spreadsheet',
    description: 'Review separate Midterm and Final examinations, subject marks, class summaries, and historical examination records.',
    defaultSub: 'midterm',
    subReports: [
      { id: 'midterm', label: 'Midterm Examination Report' },
      { id: 'final', label: 'Final Examination Report' },
      { id: 'subject', label: 'Subject Marks Report' },
      { id: 'class-summary', label: 'Class Examination Summary' },
      { id: 'individual', label: 'Individual Student Examination Report' },
      { id: 'historical', label: 'Historical Examination Records' }
    ]
  },
  {
    id: 'results',
    number: '4',
    titleKey: 'reports.catResults',
    title: '4. Results & Ranking Reports',
    shortTitle: 'Results & Ranking Reports',
    icon: 'award',
    description: 'Generate aligned class results, student rankings, and individual student result summaries with one student per row.',
    defaultSub: 'class-results',
    subReports: [
      { id: 'class-results', label: 'Class Results' },
      { id: 'class-ranking', label: 'Student Ranking', adminOnly: true },
      { id: 'individual', label: 'Individual Student Results' }
    ]
  },
  {
    id: 'promotion',
    number: '5',
    titleKey: 'reports.catPromotion',
    title: '5. Promotion Reports',
    shortTitle: 'Promotion Reports',
    icon: 'trending-up',
    description: 'Track class promotion summaries and individual student class progression history.',
    defaultSub: 'class-summary',
    subReports: [
      { id: 'class-summary', label: 'Class Promotion Summary' },
      { id: 'individual', label: 'Individual Student Promotion History' }
    ]
  },
  {
    id: 'payments',
    number: '6',
    titleKey: 'reports.catPayments',
    title: '6. Fee & Payment Reports',
    shortTitle: 'Fee & Payment Reports',
    icon: 'wallet',
    description: 'Track Class Fee and School Fee reports, individual student payment history, and outstanding fee balances.',
    defaultSub: 'class-fee',
    subReports: [
      { id: 'class-fee', label: 'Class Fee Report' },
      { id: 'school-fee', label: 'School Fee Report' },
      { id: 'individual', label: 'Student Payment History' },
      { id: 'outstanding', label: 'Outstanding Fees Report' }
    ]
  },
  {
    id: 'income-expenses',
    number: '7',
    titleKey: 'reports.catIncomeExpenses',
    title: '7. Income & Expenses Reports',
    shortTitle: 'Income & Expenses Reports',
    icon: 'dollar-sign',
    description: 'Review income entries, school expenses, and complete financial summaries with Net Balance.',
    defaultSub: 'summary',
    subReports: [
      { id: 'income', label: 'Income Report' },
      { id: 'expenses', label: 'Expenses Report' },
      { id: 'summary', label: 'Financial Summary' }
    ]
  }
];

function renderAttendanceStatusBadge(status) {
  if (status === 'Present') {
    return '<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">Present</span>';
  }
  if (status === 'Excused') {
    return '<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">Excused</span>';
  }
  return '<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap">Absent</span>';
}

function renderPaymentStatusBadge(status) {
  if (status === 'Paid') {
    return '<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">Paid</span>';
  }
  if (status === 'Partially Paid') {
    return '<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">Partially Paid</span>';
  }
  return '<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap">Unpaid</span>';
}

function renderPositionBadge(pos) {
  if (!pos) return '<span class="text-slate-400">—</span>';
  if (pos === 1) {
    return `<span class="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 tabular-nums">${pos}</span>`;
  }
  if (pos <= 3) {
    return `<span class="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold bg-blue-50 text-blue-900 border border-blue-200 tabular-nums">${pos}</span>`;
  }
  return `<span class="font-semibold text-slate-700 tabular-nums">${pos}</span>`;
}

export const ReportsView = {
  render(container) {
    const user = Auth.getCurrentUser();
    if (!Permissions.hasPermission(user, 'reports', 'view')) {
      container.innerHTML = `
        <div class="p-8 max-w-lg mx-auto text-center space-y-3">
          <div class="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            ${Components.icon('alert-circle', 'w-6 h-6')}
          </div>
          <h2 class="text-base font-bold text-slate-900">Access Restricted</h2>
          <p class="text-xs text-slate-500">Your account does not currently have permission to view school reports.</p>
        </div>
      `;
      return;
    }

    const isAdmin = Permissions.isAdmin(user);
    const canPrint = Permissions.hasPermission(user, 'reports', 'print');
    const canExport = Permissions.hasPermission(user, 'reports', 'export');

    const classes = Data.getClasses();
    const allSubjects = Data.getSubjects();
    const allExams = Data.getExaminations({}, user);
    const settings = Data.getSettings();

    // Teacher class isolation
    let availableClasses = classes;
    if (!isAdmin) {
      const assignedIds = Permissions.getTeacherAssignedClassIds(user);
      availableClasses = classes.filter(c => assignedIds.includes(c.id));
    }
    const availableClassIds = availableClasses.map(c => c.id);
    const scopedStudents = Data.getStudents()
      .filter(s => isAdmin || availableClassIds.includes(s.classId))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));

    // Filter permitted categories via RBAC
    const availableCategories = CATEGORY_DEFINITIONS.filter(cat => Permissions.canAccessReport(user, cat.id));

    if (availableCategories.length === 0) {
      container.innerHTML = `<div class="p-8 text-center text-sm text-slate-500">No report categories permitted for your account.</div>`;
      return;
    }

    if (!availableCategories.some(c => c.id === selectedCategory)) {
      selectedCategory = availableCategories[0].id;
    }
    const activeCatDef = availableCategories.find(c => c.id === selectedCategory);
    // Filter permitted sub-reports for this user (Stage 3.9 RBAC Sub-Report Security)
    const permittedSubReports = activeCatDef.subReports.filter(sr =>
      Permissions.canAccessSubReport(user, selectedCategory, sr.id)
    );
    if (!permittedSubReports.some(sr => sr.id === selectedSubReport)) {
      selectedSubReport = permittedSubReports.length > 0 ? permittedSubReports[0].id : activeCatDef.defaultSub;
    }

    // Validate selected class and student against permitted scope
    if (filterClassId && !availableClasses.some(c => c.id === filterClassId)) {
      filterClassId = availableClasses.length > 0 ? availableClasses[0].id : '';
    }
    if (filterStudentId && !scopedStudents.some(s => s.id === filterStudentId)) {
      filterStudentId = '';
    }
    if (selectedSubReport === 'individual' && !filterStudentId && scopedStudents.length > 0) {
      filterStudentId = scopedStudents[0].id;
    }

    // Dynamic Academic Years
    const yearSet = new Set([settings.academicYear || '2026-2027', '2025-2026']);
    allExams.forEach(ex => {
      if (ex.academicYear) yearSet.add(ex.academicYear);
    });
    const academicYears = Array.from(yearSet).sort().reverse();

    // Scoped Subjects
    const teacherSubIds = !isAdmin ? Permissions.getTeacherAssignedSubjectIds(user) : null;
    const scopedSubjects = allSubjects.filter(sub => {
      if (!availableClassIds.includes(sub.classId)) return false;
      if (filterClassId && sub.classId !== filterClassId) return false;
      if (teacherSubIds && !teacherSubIds.includes(sub.id)) return false;
      return true;
    });
    if (filterSubjectId && !scopedSubjects.some(s => s.id === filterSubjectId)) {
      filterSubjectId = '';
    }

    // Build report data
    activeReportData = this.generateReportData(user, availableClasses, scopedStudents);
    const activeFiltersHtml = this.renderFilterFields(user, activeCatDef, availableClasses, scopedStudents, academicYears, scopedSubjects, settings);

    container.innerHTML = `
      <div class="space-y-5">
        <!-- Module Page Header -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 no-print">
          <div>
            <h1 class="text-2xl font-bold tracking-tight text-blue-900">${I18n.t('reports.title', 'School Reports')}</h1>
            <p class="text-sm text-slate-600 mt-0.5">${I18n.t('reports.sub', 'Generate clear, official Madrasah reports for students, attendance, examinations, fees, and school finances.')}</p>
          </div>
          <div class="flex flex-wrap items-center gap-2 shrink-0">
            ${canExport ? `
              <button id="export-excel-btn" class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-blue-900 bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 rounded-lg transition-colors">
                ${Components.icon('download', 'w-4 h-4 text-emerald-600')} Export Excel (.xlsx)
              </button>
              <button id="export-csv-btn" class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-blue-900 bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 rounded-lg transition-colors">
                ${Components.icon('file-spreadsheet', 'w-4 h-4 text-emerald-700')} Export CSV
              </button>
            ` : ''}
            ${canPrint ? `
              <button id="export-pdf-btn" class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-blue-900 bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 rounded-lg transition-colors">
                ${Components.icon('file-text', 'w-4 h-4 text-blue-600')} Export PDF
              </button>
              <button id="print-report-btn" class="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors">
                ${Components.icon('printer', 'w-4 h-4')} ${I18n.t('common.print', 'Print')}
              </button>
            ` : ''}
          </div>
        </div>

        <!-- 7 Simplified Official Report Categories Navigation -->
        <div class="bg-white p-2.5 rounded-xl border border-slate-200 shadow-xs no-print">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-1.5">
            ${availableCategories.map(cat => {
              const isActive = selectedCategory === cat.id;
              return `
                <button
                  class="report-category-tab text-left px-3 py-2.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-2.5 border ${
                    isActive
                      ? 'bg-blue-900 text-white border-blue-900 shadow-xs'
                      : 'bg-slate-50/70 text-slate-700 border-slate-200/80 hover:bg-blue-50/60 hover:text-blue-900 hover:border-blue-200'
                  }"
                  data-cat="${cat.id}"
                >
                  <span class="${isActive ? 'text-amber-300' : 'text-blue-700'} shrink-0">
                    ${Components.icon(cat.icon, 'w-4 h-4')}
                  </span>
                  <span class="truncate">${I18n.t(cat.titleKey, cat.title)}</span>
                </button>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Selected Report Explanation & Sub-Report Selector -->
        <div class="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs space-y-4 no-print">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <div class="flex items-center gap-2">
                <span class="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200 rounded">
                  Report ${activeCatDef.number}
                </span>
                <h2 class="text-base font-bold text-blue-900">${activeCatDef.shortTitle}</h2>
              </div>
              <p class="text-xs text-slate-600 mt-1">${activeCatDef.description}</p>
            </div>
            <div class="text-xs text-slate-500 shrink-0">
              Showing <strong class="text-blue-900 tabular-nums">${activeReportData.rows.length}</strong> record(s)
            </div>
          </div>

          ${permittedSubReports.length > 1 ? `
            <div>
              <span class="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Choose Report View</span>
              <div class="flex flex-wrap gap-1.5">
                ${permittedSubReports.map(sr => `
                  <button
                    class="report-sub-tab px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                      selectedSubReport === sr.id
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-blue-50 hover:text-blue-900'
                    }"
                    data-sub="${sr.id}"
                  >
                    ${sr.label}
                  </button>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <!-- Compact Contextual Filters (Relevant Filters Only) -->
          <div class="pt-1">
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3 items-end">
              ${activeFiltersHtml}
              <div class="flex items-center gap-2 sm:col-span-2 lg:col-span-1">
                <button id="run-report-btn" class="flex-1 sm:flex-none px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors whitespace-nowrap">
                  ${I18n.t('reports.generateBtn', 'Generate Report')}
                </button>
                <button id="reset-report-filters-btn" class="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap">
                  Reset Filters
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Official Printable & Exportable Report Sheet (Dedicated Per-Report Layout) -->
        <div
          class="bg-white p-5 sm:p-8 rounded-xl border border-slate-200 border-t-4 border-t-blue-900 shadow-xs printable-area space-y-5"
          data-report-cat="${selectedCategory}"
          data-report-sub="${selectedSubReport}"
          data-report-code="${activeReportData.reportCode || ''}"
          data-print-orientation="${activeReportData.printOrientation || 'portrait'}"
        >
          <!-- Official School Letterhead -->
          <div class="border-b-2 border-blue-900 pb-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div class="flex items-center gap-4">
              ${Components.getLogoHtml('w-16 h-16')}
              <div>
                <span class="text-[10px] font-bold uppercase tracking-widest text-amber-600 block">AL-IMAAMA · ${activeReportData.categoryBadge || 'OFFICIAL MADRASAH REPORT'}</span>
                <h2 class="text-xl font-black text-blue-900 tracking-tight">${settings.institutionName || 'MADARASATUL AL-IMAAM'}</h2>
                <p class="text-xs text-slate-600 mt-0.5">${settings.address || 'Hargeisa, Somaliland'} · Tel: ${settings.contactPhone || '063-4129440'}</p>
                <h3 class="text-sm font-bold text-blue-700 mt-1.5 uppercase tracking-wide">${activeReportData.title}</h3>
              </div>
            </div>
            <div class="text-left sm:text-right text-xs shrink-0 space-y-1">
              <div class="flex sm:justify-end items-center gap-1.5">
                ${activeReportData.reportCode ? `<span class="inline-block px-2 py-0.5 text-[10px] font-mono font-bold bg-amber-50 text-amber-800 border border-amber-300 rounded">${activeReportData.reportCode}</span>` : ''}
                <span class="inline-block px-2.5 py-0.5 text-[10px] font-bold bg-blue-900 text-amber-300 border border-amber-400/50 rounded tracking-wider">OFFICIAL RECORD</span>
              </div>
              ${activeReportData.academicPeriod ? `<p class="text-slate-600">Period: <strong class="text-slate-900">${activeReportData.academicPeriod}</strong></p>` : ''}
              <p class="text-slate-600">Generated: <strong class="text-slate-900 tabular-nums">${new Date().toLocaleDateString()}</strong></p>
            </div>
          </div>

          <!-- Active Filters & Context Metadata Strip -->
          <div class="bg-blue-50/60 px-3.5 py-2.5 rounded-lg border border-blue-100 text-xs flex flex-wrap items-center justify-between gap-2 avoid-page-break">
            ${Array.isArray(activeReportData.filterPills) && activeReportData.filterPills.length > 0 ? `
              <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
                ${activeReportData.filterPills.map(fp => `
                  <span class="text-slate-700"><strong class="text-blue-900">${fp.label}:</strong> <span class="font-medium text-slate-900">${fp.value}</span></span>
                `).join('')}
              </div>
            ` : `
              <span class="text-slate-700"><strong class="text-blue-900">Report Scope:</strong> ${activeReportData.filterDescription}</span>
            `}
            <span class="text-slate-700 shrink-0"><strong class="text-blue-900">Total Records:</strong> <span class="font-bold text-blue-900 tabular-nums">${activeReportData.rows.length}</span></span>
          </div>

          ${activeReportData.dedicatedHeaderSectionHtml || ''}

          ${activeReportData.summaryCardsHtml || ''}

          <!-- Single-Row Aligned Report Data Table -->
          <div class="overflow-x-auto custom-scrollbar">
            <table class="w-full text-left text-xs border border-slate-200 border-collapse rounded-lg overflow-hidden">
              <thead class="bg-blue-900 text-white font-semibold border-b border-blue-950">
                <tr>
                  ${activeReportData.headers.map(h => `
                    <th class="py-2.5 px-3 whitespace-nowrap ${h.align === 'right' ? 'text-right' : h.align === 'center' ? 'text-center' : 'text-left'}">${h.label}</th>
                  `).join('')}
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200 bg-white">
                ${activeReportData.rows.length > 0 ? activeReportData.rows.map(row => `
                  <tr class="hover:bg-blue-50/30 transition-colors avoid-page-break">
                    ${row.map((cell, idx) => {
                      const h = activeReportData.headers[idx];
                      const alignClass = h && h.align === 'right' ? 'text-right' : h && h.align === 'center' ? 'text-center' : 'text-left';
                      const nowrapClass = h && h.wrap ? '' : 'whitespace-nowrap';
                      const weightClass = idx === 0 ? 'font-semibold text-slate-900' : 'text-slate-700';
                      const numClass = h && h.numeric ? 'tabular-nums' : '';
                      return `
                        <td class="py-2.5 px-3 ${alignClass} ${nowrapClass} ${weightClass} ${numClass}">
                          ${cell}
                        </td>
                      `;
                    }).join('')}
                  </tr>
                `).join('') : `
                  <tr>
                    <td colspan="${Math.max(1, activeReportData.headers.length)}" class="p-8 text-center text-slate-500 font-medium">
                      ${activeReportData.emptyMessage || 'No records found matching the selected filters.'}
                    </td>
                  </tr>
                `}
              </tbody>
              ${activeReportData.totals && activeReportData.rows.length > 0 ? `
                <tfoot class="bg-blue-50/70 font-bold border-t-2 border-blue-900/30 avoid-page-break">
                  <tr>
                    ${activeReportData.totals.map((t, idx) => {
                      const h = activeReportData.headers[idx];
                      const alignClass = h && h.align === 'right' ? 'text-right' : h && h.align === 'center' ? 'text-center' : 'text-left';
                      const currencyCols = ['Amount Due', 'Amount Paid', 'Outstanding Balance', 'Total Amount', 'Total Expenses', 'Amount'];
                      const currency = settings.currencySymbol || '$';
                      const formattedTotal = (typeof t === 'number' && h && currencyCols.includes(h.label))
                        ? `${t < 0 ? '-' : ''}${currency}${Math.abs(t).toFixed(2)}`
                        : t;
                      return `
                        <td class="py-2.5 px-3 whitespace-nowrap tabular-nums ${alignClass} text-blue-900">
                          ${formattedTotal}
                        </td>
                      `;
                    }).join('')}
                  </tr>
                </tfoot>
              ` : ''}
            </table>
          </div>

          ${activeReportData.extraSectionsHtml || ''}

          <!-- Official Signature Footer -->
          <div class="pt-6 grid grid-cols-1 sm:grid-cols-2 gap-8 text-xs text-slate-500 border-t border-slate-200 mt-6 avoid-page-break">
            <div>
              <p class="font-semibold text-slate-800">Prepared By:</p>
              <div class="h-9 border-b border-slate-300 w-48 mt-2"></div>
              <p class="text-[11px] mt-1">${user ? user.fullName : 'Administrator'} (${user ? user.role : 'ADMIN'})</p>
            </div>
            <div class="sm:text-right">
              <p class="font-semibold text-slate-800">Principal / Authorized Signature:</p>
              <div class="h-9 border-b border-slate-300 w-48 mt-2 sm:ml-auto"></div>
              <p class="text-[11px] mt-1">MADARASATUL AL-IMAAM Official Stamp</p>
            </div>
          </div>

          <!-- Print-Only Document Footer -->
          <div class="print-only-flex items-center justify-between pt-3 mt-4 border-t border-slate-300 text-[10px] text-slate-600 avoid-page-break">
            <span><strong class="text-blue-900">${settings.institutionName || 'MADARASATUL AL-IMAAM'}</strong> · AL-IMAAMA</span>
            <span>${activeReportData.title}${activeReportData.reportCode ? ` (${activeReportData.reportCode})` : ''}</span>
            <span class="tabular-nums">Generated: ${new Date().toLocaleDateString()}</span>
          </div>
        </div>
      </div>
    `;

    this.bindEvents(container, settings, user);
  },

  renderFilterFields(user, catDef, availableClasses, scopedStudents, academicYears, scopedSubjects, settings) {
    const isAdmin = Permissions.isAdmin(user);
    const cat = catDef.id;
    const sub = selectedSubReport;
    const fields = [];

    const classField = (allowAll = true) => `
      <div>
        <label class="block text-[11px] font-semibold text-slate-600 mb-1">Class</label>
        <select id="report-class-select" class="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-medium text-slate-800">
          ${allowAll ? `<option value="">${isAdmin ? 'All Classes' : 'All My Classes'}</option>` : ''}
          ${availableClasses.map(c => `<option value="${c.id}" ${filterClassId === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
        </select>
      </div>
    `;

    const studentSelectField = (required = false) => `
      <div>
        <label class="block text-[11px] font-semibold text-slate-600 mb-1">Student</label>
        <select id="report-student-select" class="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-medium text-slate-800">
          ${!required ? '<option value="">All Students</option>' : ''}
          ${scopedStudents.map(s => `<option value="${s.id}" ${filterStudentId === s.id ? 'selected' : ''}>${s.fullName} (${s.id})</option>`).join('')}
        </select>
      </div>
    `;

    const studentSearchField = () => `
      <div>
        <label class="block text-[11px] font-semibold text-slate-600 mb-1">Student ID / Name</label>
        <input type="text" id="report-student-query" value="${filterStudentQuery}" placeholder="e.g. STD-1001 or name" class="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 text-slate-800" />
      </div>
    `;

    const yearField = (allowAll = false, defaultVal = '') => `
      <div>
        <label class="block text-[11px] font-semibold text-slate-600 mb-1">Academic Year</label>
        <select id="report-year-select" class="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-medium text-slate-800">
          ${allowAll ? '<option value="">All Academic Years</option>' : ''}
          ${academicYears.map(yr => `<option value="${yr}" ${(filterAcademicYear || defaultVal) === yr ? 'selected' : ''}>${yr}</option>`).join('')}
        </select>
      </div>
    `;

    const termField = (allowAll = false, defaultVal = '') => `
      <div>
        <label class="block text-[11px] font-semibold text-slate-600 mb-1">Term</label>
        <select id="report-term-select" class="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-medium text-slate-800">
          ${allowAll ? '<option value="">All Terms</option>' : ''}
          <option value="Term 1" ${(filterTerm || defaultVal) === 'Term 1' ? 'selected' : ''}>Term 1</option>
          <option value="Term 2" ${(filterTerm || defaultVal) === 'Term 2' ? 'selected' : ''}>Term 2</option>
          <option value="Term 3" ${(filterTerm || defaultVal) === 'Term 3' ? 'selected' : ''}>Term 3</option>
        </select>
      </div>
    `;

    const examTypeField = (allowAll = true) => `
      <div>
        <label class="block text-[11px] font-semibold text-slate-600 mb-1">Examination Type</label>
        <select id="report-exam-select" class="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-medium text-slate-800">
          ${allowAll ? '<option value="">All Exam Types</option>' : ''}
          <option value="Midterm" ${filterExamType === 'Midterm' ? 'selected' : ''}>Midterm</option>
          <option value="Final" ${filterExamType === 'Final' ? 'selected' : ''}>Final</option>
        </select>
      </div>
    `;

    const subjectField = () => `
      <div>
        <label class="block text-[11px] font-semibold text-slate-600 mb-1">Subject</label>
        <select id="report-subject-select" class="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-medium text-slate-800">
          <option value="">All Subjects</option>
          ${scopedSubjects.map(s => {
            const cObj = availableClasses.find(c => c.id === s.classId);
            const label = filterClassId || !cObj ? s.name : `${s.name} (${cObj.name})`;
            return `<option value="${s.id}" ${filterSubjectId === s.id ? 'selected' : ''}>${label}</option>`;
          }).join('')}
        </select>
      </div>
    `;

    const dateField = (label = 'Date') => `
      <div>
        <label class="block text-[11px] font-semibold text-slate-600 mb-1">${label}</label>
        <input type="date" id="report-date-input" value="${filterDate}" class="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 text-slate-800" />
      </div>
    `;

    const monthField = () => `
      <div>
        <label class="block text-[11px] font-semibold text-slate-600 mb-1">Month</label>
        <input type="month" id="report-month-input" value="${filterMonth}" class="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 text-slate-800" />
      </div>
    `;

    const startDateField = () => `
      <div>
        <label class="block text-[11px] font-semibold text-slate-600 mb-1">Start Date</label>
        <input type="date" id="report-start-date" value="${filterStartDate}" class="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 text-slate-800" />
      </div>
    `;

    const endDateField = () => `
      <div>
        <label class="block text-[11px] font-semibold text-slate-600 mb-1">End Date</label>
        <input type="date" id="report-end-date" value="${filterEndDate}" class="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 text-slate-800" />
      </div>
    `;

    if (cat === 'students') {
      if (sub === 'individual') {
        fields.push(studentSelectField(true));
      } else {
        fields.push(classField(sub !== 'by-class'));
        fields.push(studentSearchField());
      }
    } else if (cat === 'attendance') {
      if (sub === 'daily') {
        fields.push(classField(true));
        fields.push(dateField('Attendance Date'));
      } else if (sub === 'monthly') {
        fields.push(classField(true));
        fields.push(monthField());
      } else if (sub === 'class') {
        fields.push(classField(true));
        fields.push(startDateField());
        fields.push(endDateField());
      } else if (sub === 'individual') {
        fields.push(studentSelectField(true));
        fields.push(startDateField());
        fields.push(endDateField());
      }
    } else if (cat === 'examinations') {
      if (sub === 'historical') {
        fields.push(studentSelectField(false));
        fields.push(studentSearchField());
        fields.push(classField(true));
        fields.push(yearField(true));
        fields.push(termField(true));
        fields.push(examTypeField(true));
        fields.push(subjectField());
      } else if (sub === 'individual') {
        fields.push(studentSelectField(true));
        fields.push(yearField(true));
        fields.push(termField(true));
        fields.push(examTypeField(true));
      } else {
        fields.push(classField(true));
        fields.push(yearField(false, settings.academicYear));
        fields.push(termField(false, settings.currentTerm));
        if (sub === 'subject' || sub === 'class-summary') {
          fields.push(examTypeField(true));
        }
        if (sub === 'subject') {
          fields.push(subjectField());
        }
        fields.push(studentSearchField());
      }
    } else if (cat === 'results') {
      if (sub === 'individual') {
        fields.push(studentSelectField(true));
      } else {
        fields.push(classField(true));
        fields.push(studentSearchField());
      }
      fields.push(yearField(false, settings.academicYear));
      fields.push(termField(false, settings.currentTerm));
    } else if (cat === 'promotion') {
      if (sub === 'individual') {
        fields.push(studentSelectField(true));
      } else {
        fields.push(classField(true));
        fields.push(yearField(true));
      }
    } else if (cat === 'payments') {
      if (sub === 'individual') {
        fields.push(studentSelectField(true));
        fields.push(startDateField());
        fields.push(endDateField());
      } else {
        fields.push(classField(true));
        fields.push(monthField());
        fields.push(`
          <div>
            <label class="block text-[11px] font-semibold text-slate-600 mb-1">Payment Status</label>
            <select id="report-payment-status" class="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-medium text-slate-800">
              <option value="">All Statuses</option>
              <option value="Paid" ${filterPaymentStatus === 'Paid' ? 'selected' : ''}>Paid</option>
              <option value="Partially Paid" ${filterPaymentStatus === 'Partially Paid' ? 'selected' : ''}>Partially Paid</option>
              <option value="Unpaid" ${filterPaymentStatus === 'Unpaid' ? 'selected' : ''}>Unpaid</option>
            </select>
          </div>
        `);
        fields.push(studentSearchField());
      }
    } else if (cat === 'income-expenses') {
      if (sub !== 'expenses') {
        fields.push(monthField());
      }
      fields.push(startDateField());
      fields.push(endDateField());
    }

    return fields.join('');
  },

  generateReportData(user, availableClasses, scopedStudents) {
    // Enforce backend/permission guard before computing any report dataset
    if (!Permissions.canAccessReport(user, selectedCategory) || !Permissions.canAccessSubReport(user, selectedCategory, selectedSubReport)) {
      return {
        title: 'Access Restricted',
        academicPeriod: '',
        filterDescription: 'Unauthorized report category or sub-report view',
        headers: [{ label: 'Status', align: 'left' }],
        rows: [],
        exportRows: [],
        emptyMessage: 'You do not have permission to access this report view.'
      };
    }

    const isAdmin = Permissions.isAdmin(user);
    const classes = Data.getClasses();
    const subjects = Data.getSubjects();
    const settings = Data.getSettings();
    const currency = settings.currencySymbol || '$';
    const availableClassIds = availableClasses.map(c => c.id);
    const currentClass = classes.find(c => c.id === filterClassId);
    const selectedStudent = Data.getStudentById(filterStudentId);

    // 1. STUDENT REPORTS (STRICT 5-COLUMN TABLE: Student ID, Student Name, Class, Gender, Date of Birth)
    if (selectedCategory === 'students') {
      let filtered = [...scopedStudents];
      if (selectedSubReport === 'individual' && filterStudentId) {
        filtered = filtered.filter(s => s.id === filterStudentId);
      } else {
        if (filterClassId) filtered = filtered.filter(s => s.classId === filterClassId);
        if (filterStudentQuery.trim()) {
          const q = filterStudentQuery.trim().toLowerCase();
          filtered = filtered.filter(s =>
            s.id.toLowerCase().includes(q) || s.fullName.toLowerCase().includes(q)
          );
        }
      }

      const subTitles = {
        'all': 'Complete Student List',
        'by-class': 'Class Student List',
        'individual': 'Individual Student Report'
      };
      const subBadges = {
        'all': 'STUDENT REPORT · COMPLETE ROSTER',
        'by-class': 'STUDENT REPORT · CLASS ROSTER',
        'individual': 'STUDENT REPORT · INDIVIDUAL PROFILE'
      };
      const subCodes = {
        'all': 'RPT-STU-01',
        'by-class': 'RPT-STU-02',
        'individual': 'RPT-STU-03'
      };

      const maleCount = filtered.filter(s => s.gender === 'Male').length;
      const femaleCount = filtered.filter(s => s.gender === 'Female').length;
      const classSetCount = new Set(filtered.map(s => s.classId).filter(Boolean)).size;

      let dedicatedHeaderSectionHtml = '';
      if (selectedSubReport === 'individual' && selectedStudent) {
        const stuClass = classes.find(c => c.id === selectedStudent.classId);
        const stuAtt = Data.getAttendance({ studentId: selectedStudent.id });
        const stuPresent = stuAtt.filter(a => a.status === 'Present' || a.status === 'Excused').length;
        const stuAttRate = stuAtt.length > 0 ? Math.round((stuPresent / stuAtt.length) * 100) : 100;
        dedicatedHeaderSectionHtml = `
          <div class="p-4 rounded-xl border border-blue-200 bg-slate-50/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs avoid-page-break">
            <div>
              <span class="text-[10px] font-bold uppercase text-slate-400 block">Student Profile</span>
              <p class="font-bold text-blue-900 mt-0.5">${selectedStudent.fullName}</p>
              <span class="font-mono text-[11px] text-blue-700">${selectedStudent.id}</span>
            </div>
            <div>
              <span class="text-[10px] font-bold uppercase text-slate-400 block">Assigned Class</span>
              <p class="font-semibold text-slate-900 mt-0.5">${stuClass ? `${stuClass.name} (Sec ${stuClass.section})` : 'Unassigned'}</p>
              <span class="text-[11px] text-slate-500">Gender: ${selectedStudent.gender || '—'}</span>
            </div>
            <div>
              <span class="text-[10px] font-bold uppercase text-slate-400 block">Guardian Contact</span>
              <p class="font-mono font-semibold text-slate-900 mt-0.5">${selectedStudent.parentPhone || '—'}</p>
              <span class="text-[11px] text-slate-500">Registered: ${selectedStudent.registrationDate || '—'}</span>
            </div>
            <div>
              <span class="text-[10px] font-bold uppercase text-slate-400 block">Attendance Standing</span>
              <p class="font-bold text-emerald-700 mt-0.5 tabular-nums">${stuAttRate}% (${stuPresent}/${stuAtt.length || 0})</p>
              <span class="text-[11px] text-slate-500">DOB: ${selectedStudent.dateOfBirth || '—'}</span>
            </div>
          </div>
        `;
      } else if (selectedSubReport === 'by-class') {
        const clsTeacher = currentClass && currentClass.classTeacherId ? Data.getTeacherById(currentClass.classTeacherId) : null;
        dedicatedHeaderSectionHtml = `
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs avoid-page-break">
            <div class="p-3 rounded-lg border border-blue-200 bg-blue-50/50">
              <span class="text-[10px] font-bold uppercase text-blue-700 block">Selected Class</span>
              <span class="text-sm font-bold text-blue-900">${currentClass ? `${currentClass.name}` : (isAdmin ? 'All Classes' : 'Assigned Classes')}</span>
              ${currentClass ? `<span class="block text-[11px] text-slate-500">Section ${currentClass.section} · Room ${currentClass.room || '101'}</span>` : ''}
            </div>
            <div class="p-3 rounded-lg border border-slate-200 bg-slate-50">
              <span class="text-[10px] font-bold uppercase text-slate-500 block">Homeroom Teacher</span>
              <span class="text-sm font-bold text-slate-900 truncate block">${clsTeacher ? clsTeacher.fullName : 'Multiple / Assigned'}</span>
            </div>
            <div class="p-3 rounded-lg border border-slate-200 bg-slate-50">
              <span class="text-[10px] font-bold uppercase text-slate-500 block">Enrolled Count</span>
              <span class="text-lg font-bold text-blue-900 tabular-nums">${filtered.length}</span>
            </div>
            <div class="p-3 rounded-lg border border-amber-200 bg-amber-50/60">
              <span class="text-[10px] font-bold uppercase text-amber-800 block">Gender Breakdown</span>
              <span class="text-sm font-bold text-amber-900 tabular-nums">${maleCount} Male · ${femaleCount} Female</span>
            </div>
          </div>
        `;
      } else {
        dedicatedHeaderSectionHtml = `
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs avoid-page-break">
            <div class="p-3 rounded-lg border border-blue-200 bg-blue-50/50">
              <span class="text-[10px] font-bold uppercase text-blue-700 block">Total Enrolled</span>
              <span class="text-lg font-bold text-blue-900 tabular-nums">${filtered.length}</span>
            </div>
            <div class="p-3 rounded-lg border border-slate-200 bg-slate-50">
              <span class="text-[10px] font-bold uppercase text-slate-500 block">Classes Represented</span>
              <span class="text-lg font-bold text-slate-900 tabular-nums">${classSetCount}</span>
            </div>
            <div class="p-3 rounded-lg border border-slate-200 bg-slate-50">
              <span class="text-[10px] font-bold uppercase text-slate-500 block">Male Students</span>
              <span class="text-lg font-bold text-blue-800 tabular-nums">${maleCount}</span>
            </div>
            <div class="p-3 rounded-lg border border-rose-200 bg-rose-50/50">
              <span class="text-[10px] font-bold uppercase text-rose-700 block">Female Students</span>
              <span class="text-lg font-bold text-rose-800 tabular-nums">${femaleCount}</span>
            </div>
          </div>
        `;
      }

      const rows = filtered.map(s => {
        const cls = classes.find(c => c.id === s.classId);
        return [
          `<span class="font-mono text-blue-700">${s.id}</span>`,
          `<span class="font-semibold text-slate-900">${s.fullName}</span>`,
          cls ? cls.name : '—',
          s.gender || '—',
          s.dateOfBirth || '—'
        ];
      });

      const exportRows = filtered.map(s => {
        const cls = classes.find(c => c.id === s.classId);
        return [s.id, s.fullName, cls ? cls.name : '—', s.gender || '—', s.dateOfBirth || '—'];
      });

      const filterPills = selectedSubReport === 'individual' && selectedStudent
        ? [
            { label: 'Student', value: `${selectedStudent.fullName} (${selectedStudent.id})` },
            { label: 'Academic Year', value: settings.academicYear }
          ]
        : [
            { label: 'Class', value: currentClass ? currentClass.name : (isAdmin ? 'All Classes' : 'Assigned Classes') },
            { label: 'Academic Year', value: settings.academicYear },
            ...(filterStudentQuery.trim() ? [{ label: 'Search', value: filterStudentQuery.trim() }] : [])
          ];

      return {
        reportCode: subCodes[selectedSubReport] || 'RPT-STU-01',
        categoryBadge: subBadges[selectedSubReport] || 'STUDENT REPORT',
        printOrientation: 'portrait',
        title: subTitles[selectedSubReport] || 'Student Report',
        academicPeriod: settings.academicYear,
        filterDescription: selectedSubReport === 'individual' && selectedStudent
          ? `${selectedStudent.fullName} (${selectedStudent.id})`
          : `${currentClass ? currentClass.name : (isAdmin ? 'All Classes' : 'Assigned Classes')}`,
        filterPills,
        dedicatedHeaderSectionHtml,
        headers: [
          { label: 'Student ID', align: 'left' },
          { label: 'Student Name', align: 'left' },
          { label: 'Class', align: 'left' },
          { label: 'Gender', align: 'center' },
          { label: 'Date of Birth', align: 'center', numeric: true }
        ],
        rows,
        exportRows,
        totals: ['Total Students', filtered.length, '', '', '']
      };
    }

    // 2. ATTENDANCE REPORTS
    if (selectedCategory === 'attendance') {
      let attendance = Data.getAttendance().filter(a => isAdmin || availableClassIds.includes(a.classId));

      if (selectedSubReport === 'daily') {
        if (filterClassId) attendance = attendance.filter(a => a.classId === filterClassId);
        if (filterDate) attendance = attendance.filter(a => a.date === filterDate);
      } else if (selectedSubReport === 'monthly') {
        if (filterClassId) attendance = attendance.filter(a => a.classId === filterClassId);
        if (filterMonth) attendance = attendance.filter(a => (a.date || '').startsWith(filterMonth));
      } else if (selectedSubReport === 'class') {
        if (filterClassId) attendance = attendance.filter(a => a.classId === filterClassId);
        if (filterStartDate) attendance = attendance.filter(a => a.date >= filterStartDate);
        if (filterEndDate) attendance = attendance.filter(a => a.date <= filterEndDate);
      } else if (selectedSubReport === 'individual') {
        if (filterStudentId) attendance = attendance.filter(a => a.studentId === filterStudentId);
        if (filterStartDate) attendance = attendance.filter(a => a.date >= filterStartDate);
        if (filterEndDate) attendance = attendance.filter(a => a.date <= filterEndDate);
      }

      attendance.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (a.studentId || '').localeCompare(b.studentId || ''));

      const presentCount = attendance.filter(a => a.status === 'Present').length;
      const absentCount = attendance.filter(a => a.status === 'Absent').length;
      const excusedCount = attendance.filter(a => a.status === 'Excused').length;

      const summaryCardsHtml = `
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs avoid-page-break">
          <div class="p-3 rounded-lg border border-slate-200 bg-slate-50">
            <span class="text-[10px] font-bold uppercase text-slate-500 block">Total Records</span>
            <span class="text-lg font-bold text-blue-900 tabular-nums">${attendance.length}</span>
          </div>
          <div class="p-3 rounded-lg border border-emerald-200 bg-emerald-50/60">
            <span class="text-[10px] font-bold uppercase text-emerald-700 block">Present</span>
            <span class="text-lg font-bold text-emerald-800 tabular-nums">${presentCount}</span>
          </div>
          <div class="p-3 rounded-lg border border-rose-200 bg-rose-50/60">
            <span class="text-[10px] font-bold uppercase text-rose-700 block">Absent</span>
            <span class="text-lg font-bold text-rose-800 tabular-nums">${absentCount}</span>
          </div>
          <div class="p-3 rounded-lg border border-amber-200 bg-amber-50/60">
            <span class="text-[10px] font-bold uppercase text-amber-800 block">Excused</span>
            <span class="text-lg font-bold text-amber-900 tabular-nums">${excusedCount}</span>
          </div>
        </div>
      `;

      // Monthly Attendance Summary (grouped per student)
      if (selectedSubReport === 'monthly') {
        const studentMap = new Map();
        attendance.forEach(a => {
          if (!studentMap.has(a.studentId)) {
            const s = Data.getStudentById(a.studentId);
            const c = classes.find(cls => cls.id === a.classId);
            studentMap.set(a.studentId, {
              studentId: a.studentId,
              studentName: s ? s.fullName : a.studentId,
              className: c ? c.name : '—',
              present: 0,
              absent: 0,
              excused: 0,
              total: 0
            });
          }
          const entry = studentMap.get(a.studentId);
          if (a.status === 'Present') entry.present += 1;
          else if (a.status === 'Excused') entry.excused += 1;
          else entry.absent += 1;
          entry.total += 1;
        });

        const summaryList = Array.from(studentMap.values()).sort((a, b) => a.className.localeCompare(b.className) || a.studentName.localeCompare(b.studentName));
        const overallRate = attendance.length > 0 ? Math.round(((presentCount + excusedCount) / attendance.length) * 100) : 0;

        return {
          reportCode: 'RPT-ATT-02',
          categoryBadge: 'ATTENDANCE REPORT · MONTHLY SUMMARY',
          printOrientation: 'landscape',
          title: 'Monthly Attendance Summary',
          academicPeriod: `Month: ${filterMonth}`,
          filterDescription: `${currentClass ? currentClass.name : (isAdmin ? 'All Classes' : 'Assigned Classes')} · Month: ${filterMonth}`,
          filterPills: [
            { label: 'Class', value: currentClass ? currentClass.name : (isAdmin ? 'All Classes' : 'Assigned Classes') },
            { label: 'Billing/Calendar Month', value: filterMonth },
            { label: 'Overall Attendance Rate', value: `${overallRate}%` }
          ],
          summaryCardsHtml,
          summaryItems: [
            { label: 'Present', value: presentCount },
            { label: 'Absent', value: absentCount },
            { label: 'Excused', value: excusedCount }
          ],
          headers: [
            { label: 'Student ID', align: 'left' },
            { label: 'Student Name', align: 'left' },
            { label: 'Class', align: 'left' },
            { label: 'Present', align: 'right', numeric: true },
            { label: 'Absent', align: 'right', numeric: true },
            { label: 'Excused', align: 'right', numeric: true },
            { label: 'Total Days', align: 'right', numeric: true },
            { label: 'Attendance Rate', align: 'right', numeric: true }
          ],
          rows: summaryList.map(item => {
            const rate = item.total > 0 ? Math.round(((item.present + item.excused) / item.total) * 100) : 0;
            return [
              `<span class="font-mono text-blue-700">${item.studentId}</span>`,
              `<span class="font-semibold text-slate-900">${item.studentName}</span>`,
              item.className,
              `<span class="font-semibold text-emerald-700">${item.present}</span>`,
              `<span class="font-semibold text-rose-700">${item.absent}</span>`,
              `<span class="font-semibold text-amber-800">${item.excused}</span>`,
              item.total,
              `<span class="font-bold text-blue-900">${rate}%</span>`
            ];
          }),
          exportRows: summaryList.map(item => {
            const rate = item.total > 0 ? Math.round(((item.present + item.excused) / item.total) * 100) : 0;
            return [item.studentId, item.studentName, item.className, item.present, item.absent, item.excused, item.total, `${rate}%`];
          }),
          totals: ['Totals', `${summaryList.length} students`, '', presentCount, absentCount, excusedCount, attendance.length, `${overallRate}%`]
        };
      }

      // Class Attendance Summary (grouped per class)
      if (selectedSubReport === 'class') {
        const classMap = new Map();
        attendance.forEach(a => {
          if (!classMap.has(a.classId)) {
            const c = classes.find(cls => cls.id === a.classId);
            classMap.set(a.classId, {
              className: c ? c.name : a.classId,
              studentIds: new Set(),
              present: 0,
              absent: 0,
              excused: 0,
              total: 0
            });
          }
          const entry = classMap.get(a.classId);
          entry.studentIds.add(a.studentId);
          if (a.status === 'Present') entry.present += 1;
          else if (a.status === 'Excused') entry.excused += 1;
          else entry.absent += 1;
          entry.total += 1;
        });

        const summaryList = Array.from(classMap.values()).sort((a, b) => a.className.localeCompare(b.className));
        const overallRate = attendance.length > 0 ? Math.round(((presentCount + excusedCount) / attendance.length) * 100) : 0;
        const periodDesc = `${filterStartDate || 'All'} to ${filterEndDate || 'Present'}`;

        return {
          reportCode: 'RPT-ATT-04',
          categoryBadge: 'ATTENDANCE REPORT · CLASS SUMMARY',
          printOrientation: 'portrait',
          title: 'Class Attendance Summary',
          academicPeriod: periodDesc,
          filterDescription: `${currentClass ? currentClass.name : (isAdmin ? 'All Classes' : 'Assigned Classes')} · ${periodDesc}`,
          filterPills: [
            { label: 'Class', value: currentClass ? currentClass.name : (isAdmin ? 'All Classes' : 'Assigned Classes') },
            { label: 'Date Range', value: periodDesc },
            { label: 'Overall Rate', value: `${overallRate}%` }
          ],
          summaryCardsHtml,
          summaryItems: [
            { label: 'Present', value: presentCount },
            { label: 'Absent', value: absentCount },
            { label: 'Excused', value: excusedCount }
          ],
          headers: [
            { label: 'Class', align: 'left' },
            { label: 'Students Recorded', align: 'right', numeric: true },
            { label: 'Present', align: 'right', numeric: true },
            { label: 'Absent', align: 'right', numeric: true },
            { label: 'Excused', align: 'right', numeric: true },
            { label: 'Total Entries', align: 'right', numeric: true },
            { label: 'Attendance Rate', align: 'right', numeric: true }
          ],
          rows: summaryList.map(item => {
            const rate = item.total > 0 ? Math.round(((item.present + item.excused) / item.total) * 100) : 0;
            return [
              `<span class="font-semibold text-slate-900">${item.className}</span>`,
              item.studentIds.size,
              `<span class="font-semibold text-emerald-700">${item.present}</span>`,
              `<span class="font-semibold text-rose-700">${item.absent}</span>`,
              `<span class="font-semibold text-amber-800">${item.excused}</span>`,
              item.total,
              `<span class="font-bold text-blue-900">${rate}%</span>`
            ];
          }),
          exportRows: summaryList.map(item => {
            const rate = item.total > 0 ? Math.round(((item.present + item.excused) / item.total) * 100) : 0;
            return [item.className, item.studentIds.size, item.present, item.absent, item.excused, item.total, `${rate}%`];
          }),
          totals: ['Totals', new Set(attendance.map(a => a.studentId)).size, presentCount, absentCount, excusedCount, attendance.length, `${overallRate}%`]
        };
      }

      // Daily Attendance Report & Student Attendance History
      const rows = attendance.map(a => {
        const s = Data.getStudentById(a.studentId);
        const c = classes.find(cls => cls.id === a.classId);
        return [
          `<span class="font-mono text-blue-700">${a.studentId}</span>`,
          `<span class="font-semibold text-slate-900">${s ? s.fullName : '—'}</span>`,
          c ? c.name : '—',
          a.date || '—',
          renderAttendanceStatusBadge(a.status)
        ];
      });

      const exportRows = attendance.map(a => {
        const s = Data.getStudentById(a.studentId);
        const c = classes.find(cls => cls.id === a.classId);
        return [a.studentId, s ? s.fullName : '—', c ? c.name : '—', a.date || '—', a.status];
      });

      const periodDesc = selectedSubReport === 'daily'
        ? `Date: ${filterDate}`
        : `${filterStartDate || 'All'} to ${filterEndDate || 'Present'}`;
      const overallAttRate = attendance.length > 0 ? Math.round(((presentCount + excusedCount) / attendance.length) * 100) : 0;
      const stuClsObj = selectedStudent ? classes.find(c => c.id === selectedStudent.classId) : null;

      return {
        reportCode: selectedSubReport === 'individual' ? 'RPT-ATT-03' : 'RPT-ATT-01',
        categoryBadge: selectedSubReport === 'individual' ? 'ATTENDANCE REPORT · STUDENT HISTORY' : 'ATTENDANCE REPORT · DAILY ROLL CALL',
        printOrientation: 'portrait',
        title: selectedSubReport === 'individual' ? 'Student Attendance History' : 'Daily Attendance Report',
        academicPeriod: periodDesc,
        filterDescription: selectedSubReport === 'individual' && selectedStudent
          ? `${selectedStudent.fullName} (${selectedStudent.id}) · ${periodDesc}`
          : `${currentClass ? currentClass.name : (isAdmin ? 'All Classes' : 'Assigned Classes')} · ${periodDesc}`,
        filterPills: selectedSubReport === 'individual' && selectedStudent
          ? [
              { label: 'Student', value: `${selectedStudent.fullName} (${selectedStudent.id})` },
              { label: 'Class', value: stuClsObj ? stuClsObj.name : '—' },
              { label: 'Date Range', value: periodDesc },
              { label: 'Attendance Rate', value: `${overallAttRate}%` }
            ]
          : [
              { label: 'Class', value: currentClass ? currentClass.name : (isAdmin ? 'All Classes' : 'Assigned Classes') },
              { label: 'Attendance Date', value: filterDate || 'All Dates' },
              { label: 'Daily Rate', value: `${overallAttRate}%` }
            ],
        summaryCardsHtml,
        summaryItems: [
          { label: 'Present', value: presentCount },
          { label: 'Absent', value: absentCount },
          { label: 'Excused', value: excusedCount }
        ],
        headers: [
          { label: 'Student ID', align: 'left' },
          { label: 'Student Name', align: 'left' },
          { label: 'Class', align: 'left' },
          { label: 'Attendance Date', align: 'center', numeric: true },
          { label: 'Attendance Status', align: 'center' }
        ],
        rows,
        exportRows,
        totals: ['Totals', `${attendance.length} entries`, `Present: ${presentCount}`, `Absent: ${absentCount}`, `Excused: ${excusedCount}`]
      };
    }

    // 3. EXAMINATION REPORTS (MIDTERM & FINAL KEPT SEPARATE + CONSOLIDATED HISTORICAL RECORDS)
    if (selectedCategory === 'examinations') {
      if (selectedSubReport === 'historical') {
        let records = Data.getStudentHistoricalExams({
          studentId: filterStudentId || undefined,
          classId: filterClassId || undefined,
          academicYear: filterAcademicYear || undefined,
          term: filterTerm || undefined,
          examType: filterExamType || undefined,
          subjectId: filterSubjectId || undefined
        }, user);

        if (filterStudentQuery.trim()) {
          const q = filterStudentQuery.trim().toLowerCase();
          records = records.filter(r =>
            (r.studentId || '').toLowerCase().includes(q) || (r.studentName || '').toLowerCase().includes(q)
          );
        }

        records.sort((a, b) =>
          (b.academicYear || '').localeCompare(a.academicYear || '') ||
          (a.term || '').localeCompare(b.term || '') ||
          (a.studentName || '').localeCompare(b.studentName || '')
        );

        const rows = [];
        const exportRows = [];
        records.forEach(r => {
          r.subjectRows.forEach(sr => {
            rows.push([
              `<span class="font-mono text-blue-700">${r.studentId}</span>`,
              `<span class="font-semibold text-slate-900">${r.studentName}</span>`,
              r.historicalClassName,
              r.academicYear,
              r.term,
              r.examType,
              sr.subjectName,
              sr.score !== null ? `<span class="font-semibold text-slate-900">${sr.score}</span>` : '<span class="text-slate-400">—</span>',
              sr.maxMarks,
              `<span class="font-bold text-blue-900">${r.totalMarks}</span>`,
              !filterSubjectId && r.position ? renderPositionBadge(r.position) : '<span class="text-slate-400">—</span>'
            ]);
            exportRows.push([
              r.studentId,
              r.studentName,
              r.historicalClassName,
              r.academicYear,
              r.term,
              r.examType,
              sr.subjectName,
              sr.score !== null ? sr.score : '—',
              sr.maxMarks,
              r.totalMarks,
              !filterSubjectId && r.position ? r.position : '—'
            ]);
          });
        });

        const scopeParts = [
          selectedStudent ? `${selectedStudent.fullName} (${selectedStudent.id})` : 'All Students',
          currentClass ? `Class: ${currentClass.name}` : (isAdmin ? 'All Classes' : 'Assigned Classes'),
          filterAcademicYear || 'All Academic Years',
          filterTerm || 'All Terms',
          filterExamType || 'All Exam Types'
        ];
        if (filterSubjectId) {
          const subObj = subjects.find(s => s.id === filterSubjectId);
          if (subObj) scopeParts.push(`Subject: ${subObj.name}`);
        }

        const selectedSubObj = filterSubjectId ? subjects.find(s => s.id === filterSubjectId) : null;
        return {
          reportCode: 'RPT-EXM-06',
          categoryBadge: 'EXAMINATION REPORT · HISTORICAL ARCHIVE',
          printOrientation: 'landscape',
          title: 'Historical Examination Records',
          academicPeriod: `${filterAcademicYear || 'All Academic Years'}${filterTerm ? ` (${filterTerm})` : ''}`,
          filterDescription: scopeParts.join(' · '),
          filterPills: [
            { label: 'Student', value: selectedStudent ? `${selectedStudent.fullName} (${selectedStudent.id})` : 'All Students' },
            { label: 'Class', value: currentClass ? currentClass.name : (isAdmin ? 'All Classes' : 'Assigned Classes') },
            { label: 'Academic Year', value: filterAcademicYear || 'All Years' },
            { label: 'Term', value: filterTerm || 'All Terms' },
            { label: 'Exam Type', value: filterExamType || 'All Types' },
            { label: 'Subject', value: selectedSubObj ? selectedSubObj.name : (isAdmin ? 'All Subjects' : 'Assigned Subjects') }
          ],
          dedicatedHeaderSectionHtml: `
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs avoid-page-break">
              <div class="p-3 rounded-lg border border-blue-200 bg-blue-50/50">
                <span class="text-[10px] font-bold uppercase text-blue-700 block">Examination Sessions</span>
                <span class="text-lg font-bold text-blue-900 tabular-nums">${records.length}</span>
              </div>
              <div class="p-3 rounded-lg border border-slate-200 bg-slate-50">
                <span class="text-[10px] font-bold uppercase text-slate-500 block">Subject Mark Rows</span>
                <span class="text-lg font-bold text-slate-900 tabular-nums">${rows.length}</span>
              </div>
              <div class="p-3 rounded-lg border border-amber-200 bg-amber-50/50">
                <span class="text-[10px] font-bold uppercase text-amber-800 block">Archive Scope</span>
                <span class="text-sm font-bold text-amber-900">${filterAcademicYear || 'Multi-Year Archive'}</span>
              </div>
            </div>
          `,
          headers: [
            { label: 'Student ID', align: 'left' },
            { label: 'Student Name', align: 'left' },
            { label: 'Class (Academic Year)', align: 'left' },
            { label: 'Academic Year', align: 'center', numeric: true },
            { label: 'Term', align: 'center' },
            { label: 'Examination Type', align: 'center' },
            { label: 'Subject', align: 'left' },
            { label: 'Subject Marks', align: 'right', numeric: true },
            { label: 'Maximum Marks', align: 'right', numeric: true },
            { label: 'Total Marks', align: 'right', numeric: true },
            { label: 'Position', align: 'center', numeric: true }
          ],
          rows,
          exportRows,
          emptyMessage: 'No historical examination records found for the selected filters.'
        };
      }

      const targetYear = filterAcademicYear || settings.academicYear;
      const targetTerm = filterTerm || settings.currentTerm;
      let targetExamType = filterExamType || undefined;
      if (selectedSubReport === 'midterm') targetExamType = 'Midterm';
      if (selectedSubReport === 'final') targetExamType = 'Final';

      let records = Data.getStudentHistoricalExams({
        studentId: selectedSubReport === 'individual' ? (filterStudentId || undefined) : undefined,
        classId: selectedSubReport === 'individual' ? undefined : (filterClassId || undefined),
        academicYear: selectedSubReport === 'individual' ? (filterAcademicYear || undefined) : targetYear,
        term: selectedSubReport === 'individual' ? (filterTerm || undefined) : targetTerm,
        examType: targetExamType,
        subjectId: selectedSubReport === 'subject' ? (filterSubjectId || undefined) : undefined
      }, user);

      if (filterStudentQuery.trim() && selectedSubReport !== 'individual') {
        const q = filterStudentQuery.trim().toLowerCase();
        records = records.filter(r =>
          (r.studentId || '').toLowerCase().includes(q) || (r.studentName || '').toLowerCase().includes(q)
        );
      }

      if (selectedSubReport === 'class-summary') {
        const rows = records.map(r => {
          const gradedCount = r.subjectRows.filter(sr => sr.score !== null).length;
          return [
            `<span class="font-mono text-blue-700">${r.studentId}</span>`,
            `<span class="font-semibold text-slate-900">${r.studentName}</span>`,
            r.historicalClassName,
            r.examType,
            `${gradedCount} / ${r.subjectRows.length}`,
            `<span class="font-bold text-blue-900">${r.totalMarks}</span>`,
            r.maxPossibleTotal + (r.activityScore !== null ? 20 : 0)
          ];
        });
        const exportRows = records.map(r => {
          const gradedCount = r.subjectRows.filter(sr => sr.score !== null).length;
          return [r.studentId, r.studentName, r.historicalClassName, r.examType, `${gradedCount}/${r.subjectRows.length}`, r.totalMarks, r.maxPossibleTotal + (r.activityScore !== null ? 20 : 0)];
        });
        const avgTotal = records.length > 0 ? (records.reduce((s, r) => s + (parseFloat(r.totalMarks) || 0), 0) / records.length).toFixed(1) : '0.0';
        const topTotal = records.length > 0 ? Math.max(...records.map(r => parseFloat(r.totalMarks) || 0)) : 0;

        return {
          reportCode: 'RPT-EXM-04',
          categoryBadge: 'EXAMINATION REPORT · CLASS SUMMARY',
          printOrientation: 'portrait',
          title: 'Class Examination Summary',
          academicPeriod: `${targetYear} (${targetTerm})`,
          filterDescription: `${currentClass ? currentClass.name : (isAdmin ? 'All Classes' : 'Assigned Classes')} · ${targetYear} · ${targetTerm} · ${targetExamType || 'All Exam Types'}`,
          filterPills: [
            { label: 'Class', value: currentClass ? currentClass.name : (isAdmin ? 'All Classes' : 'Assigned Classes') },
            { label: 'Academic Year', value: targetYear },
            { label: 'Term', value: targetTerm },
            { label: 'Exam Type', value: targetExamType || 'All Exam Types' }
          ],
          dedicatedHeaderSectionHtml: `
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs avoid-page-break">
              <div class="p-3 rounded-lg border border-blue-200 bg-blue-50/50">
                <span class="text-[10px] font-bold uppercase text-blue-700 block">Students Assessed</span>
                <span class="text-lg font-bold text-blue-900 tabular-nums">${records.length}</span>
              </div>
              <div class="p-3 rounded-lg border border-emerald-200 bg-emerald-50/50">
                <span class="text-[10px] font-bold uppercase text-emerald-700 block">Class Average Total</span>
                <span class="text-lg font-bold text-emerald-800 tabular-nums">${avgTotal}</span>
              </div>
              <div class="p-3 rounded-lg border border-amber-200 bg-amber-50/50">
                <span class="text-[10px] font-bold uppercase text-amber-800 block">Highest Total Score</span>
                <span class="text-lg font-bold text-amber-900 tabular-nums">${topTotal}</span>
              </div>
            </div>
          `,
          headers: [
            { label: 'Student ID', align: 'left' },
            { label: 'Student Name', align: 'left' },
            { label: 'Class', align: 'left' },
            { label: 'Exam Type', align: 'center' },
            { label: 'Subjects Graded', align: 'center', numeric: true },
            { label: 'Total Marks', align: 'right', numeric: true },
            { label: 'Maximum Marks', align: 'right', numeric: true }
          ],
          rows,
          exportRows,
          emptyMessage: 'No examination records found for the selected period.'
        };
      }

      const flatRows = [];
      records.forEach(r => {
        r.subjectRows.forEach(sr => {
          flatRows.push({
            studentId: r.studentId,
            studentName: r.studentName,
            className: r.historicalClassName,
            examType: r.examType,
            subjectName: sr.subjectName,
            marksObtained: sr.score !== null && !isNaN(sr.score) ? sr.score : null,
            maxMarks: sr.maxMarks,
            totalMarks: r.totalMarks
          });
        });
      });

      const subTitles = {
        'midterm': 'Midterm Examination Report',
        'final': 'Final Examination Report',
        'subject': 'Subject Marks Report',
        'individual': 'Individual Student Examination Report'
      };
      const subBadges = {
        'midterm': 'EXAMINATION REPORT · MIDTERM SESSION',
        'final': 'EXAMINATION REPORT · FINAL SESSION',
        'subject': 'EXAMINATION REPORT · SUBJECT ANALYSIS',
        'individual': 'EXAMINATION REPORT · STUDENT TRANSCRIPT CARD'
      };
      const subCodes = {
        'midterm': 'RPT-EXM-01',
        'final': 'RPT-EXM-02',
        'subject': 'RPT-EXM-03',
        'individual': 'RPT-EXM-05'
      };

      const numericScores = flatRows.filter(i => i.marksObtained !== null).map(i => parseFloat(i.marksObtained));
      const avgScoreVal = numericScores.length > 0 ? (numericScores.reduce((a, b) => a + b, 0) / numericScores.length).toFixed(1) : '—';
      const maxScoreVal = numericScores.length > 0 ? Math.max(...numericScores) : '—';
      const selectedSubObj = filterSubjectId ? subjects.find(s => s.id === filterSubjectId) : null;
      const stuClsObj = selectedStudent ? classes.find(c => c.id === selectedStudent.classId) : null;

      let examHeaderSectionHtml = '';
      if (selectedSubReport === 'individual' && selectedStudent) {
        examHeaderSectionHtml = `
          <div class="p-4 rounded-xl border border-blue-200 bg-slate-50/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs avoid-page-break">
            <div>
              <span class="text-[10px] font-bold uppercase text-slate-400 block">Student</span>
              <p class="font-bold text-blue-900 mt-0.5">${selectedStudent.fullName}</p>
              <span class="font-mono text-[11px] text-blue-700">${selectedStudent.id}</span>
            </div>
            <div>
              <span class="text-[10px] font-bold uppercase text-slate-400 block">Class</span>
              <p class="font-semibold text-slate-900 mt-0.5">${stuClsObj ? stuClsObj.name : '—'}</p>
            </div>
            <div>
              <span class="text-[10px] font-bold uppercase text-slate-400 block">Exam Entries Graded</span>
              <p class="font-bold text-blue-900 mt-0.5 tabular-nums">${numericScores.length} / ${flatRows.length}</p>
            </div>
            <div>
              <span class="text-[10px] font-bold uppercase text-slate-400 block">Average Subject Mark</span>
              <p class="font-bold text-emerald-700 mt-0.5 tabular-nums">${avgScoreVal}</p>
            </div>
          </div>
        `;
      } else {
        examHeaderSectionHtml = `
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs avoid-page-break">
            <div class="p-3 rounded-lg border border-blue-200 bg-blue-50/50">
              <span class="text-[10px] font-bold uppercase text-blue-700 block">Graded Subject Entries</span>
              <span class="text-lg font-bold text-blue-900 tabular-nums">${numericScores.length} / ${flatRows.length}</span>
            </div>
            <div class="p-3 rounded-lg border border-emerald-200 bg-emerald-50/50">
              <span class="text-[10px] font-bold uppercase text-emerald-700 block">Mean Subject Mark</span>
              <span class="text-lg font-bold text-emerald-800 tabular-nums">${avgScoreVal}</span>
            </div>
            <div class="p-3 rounded-lg border border-amber-200 bg-amber-50/50">
              <span class="text-[10px] font-bold uppercase text-amber-800 block">Highest Subject Mark</span>
              <span class="text-lg font-bold text-amber-900 tabular-nums">${maxScoreVal}</span>
            </div>
          </div>
        `;
      }

      const rows = flatRows.map(item => [
        `<span class="font-mono text-blue-700">${item.studentId}</span>`,
        `<span class="font-semibold text-slate-900">${item.studentName}</span>`,
        item.className,
        item.examType,
        item.subjectName,
        item.marksObtained !== null ? `<span class="font-semibold text-slate-900">${item.marksObtained}</span>` : '<span class="text-slate-400">—</span>',
        item.maxMarks,
        `<span class="font-bold text-blue-900">${item.totalMarks}</span>`
      ]);

      const exportRows = flatRows.map(item => [
        item.studentId,
        item.studentName,
        item.className,
        item.examType,
        item.subjectName,
        item.marksObtained !== null ? item.marksObtained : '—',
        item.maxMarks,
        item.totalMarks
      ]);

      const filterPills = selectedSubReport === 'individual' && selectedStudent
        ? [
            { label: 'Student', value: `${selectedStudent.fullName} (${selectedStudent.id})` },
            { label: 'Academic Year', value: filterAcademicYear || 'All Academic Years' },
            { label: 'Term', value: filterTerm || 'All Terms' },
            { label: 'Exam Type', value: targetExamType || 'All Exam Types' }
          ]
        : [
            { label: 'Class', value: currentClass ? currentClass.name : (isAdmin ? 'All Classes' : 'Assigned Classes') },
            { label: 'Academic Year', value: targetYear },
            { label: 'Term', value: targetTerm },
            ...(targetExamType ? [{ label: 'Exam Type', value: targetExamType }] : []),
            ...(selectedSubReport === 'subject' ? [{ label: 'Subject', value: selectedSubObj ? selectedSubObj.name : (isAdmin ? 'All Subjects' : 'Assigned Subjects') }] : [])
          ];

      return {
        reportCode: subCodes[selectedSubReport] || 'RPT-EXM-01',
        categoryBadge: subBadges[selectedSubReport] || 'EXAMINATION REPORT',
        printOrientation: 'landscape',
        title: subTitles[selectedSubReport] || 'Examination Report',
        academicPeriod: selectedSubReport === 'individual'
          ? `${filterAcademicYear || 'All Academic Years'}${filterTerm ? ` (${filterTerm})` : ''}`
          : `${targetYear} (${targetTerm})`,
        filterDescription: selectedSubReport === 'individual' && selectedStudent
          ? `${selectedStudent.fullName} (${selectedStudent.id}) · ${targetExamType || 'All Exam Types'}`
          : `${currentClass ? currentClass.name : (isAdmin ? 'All Classes' : 'Assigned Classes')} · ${targetYear} · ${targetTerm}${targetExamType ? ` · ${targetExamType}` : ''}`,
        filterPills,
        dedicatedHeaderSectionHtml: examHeaderSectionHtml,
        headers: [
          { label: 'Student ID', align: 'left' },
          { label: 'Student Name', align: 'left' },
          { label: 'Class', align: 'left' },
          { label: 'Exam Type', align: 'center' },
          { label: 'Subject', align: 'left' },
          { label: 'Marks Obtained', align: 'right', numeric: true },
          { label: 'Maximum Marks', align: 'right', numeric: true },
          { label: 'Total Marks', align: 'right', numeric: true }
        ],
        rows,
        exportRows,
        emptyMessage: 'No examination records found for the selected period.'
      };
    }

    // 4. RESULTS & RANKING REPORTS (EXACT 7-COLUMN SINGLE-ROW ALIGNMENT)
    if (selectedCategory === 'results') {
      const targetYear = filterAcademicYear || settings.academicYear;
      const targetTerm = filterTerm || settings.currentTerm;
      const targetClasses = (selectedSubReport !== 'individual' && filterClassId)
        ? availableClasses.filter(c => c.id === filterClassId)
        : availableClasses;
      const searchQ = selectedSubReport !== 'individual' ? filterStudentQuery.trim().toLowerCase() : '';

      const rows = [];
      const exportRows = [];
      const matchedResults = [];

      targetClasses.forEach(cls => {
        const rankingData = Data.calculateRankings(cls.id, targetYear, targetTerm, user);
        rankingData.results.forEach(r => {
          if (selectedSubReport === 'individual' && filterStudentId && r.studentId !== filterStudentId) return;
          if (searchQ && !r.studentId.toLowerCase().includes(searchQ) && !r.studentName.toLowerCase().includes(searchQ)) return;

          matchedResults.push({ ...r, className: cls.name });
          const displayMid = r.midtermTotal !== null ? r.midtermTotal : '—';
          const displayFin = r.finalTotal !== null ? r.finalTotal : '—';
          const displayComb = r.hasScores ? r.combinedTotal : '—';

          rows.push([
            r.position ? renderPositionBadge(r.position) : '<span class="text-slate-400">—</span>',
            `<span class="font-mono text-blue-700">${r.studentId}</span>`,
            `<span class="font-semibold text-slate-900">${r.studentName}</span>`,
            cls.name,
            displayMid !== '—' ? displayMid : '<span class="text-slate-400">—</span>',
            displayFin !== '—' ? displayFin : '<span class="text-slate-400">—</span>',
            displayComb !== '—' ? `<span class="font-bold text-blue-900">${displayComb}</span>` : '<span class="text-slate-400">—</span>'
          ]);

          exportRows.push([
            r.position ? r.position : '—',
            r.studentId,
            r.studentName,
            cls.name,
            displayMid,
            displayFin,
            displayComb
          ]);
        });
      });

      const subTitles = {
        'class-results': 'Class Results Report',
        'class-ranking': 'Student Ranking Report',
        'individual': 'Individual Student Results Report'
      };
      const subBadges = {
        'class-results': 'RESULTS REPORT · CLASS SUMMARY',
        'class-ranking': 'RESULTS REPORT · MERIT RANKING',
        'individual': 'RESULTS REPORT · STUDENT RESULT SLIP'
      };
      const subCodes = {
        'class-results': 'RPT-RES-01',
        'class-ranking': 'RPT-RES-02',
        'individual': 'RPT-RES-03'
      };

      const scoredResults = matchedResults.filter(r => r.hasScores);
      const classAvgCombined = scoredResults.length > 0
        ? (scoredResults.reduce((s, r) => s + (parseFloat(r.combinedTotal) || 0), 0) / scoredResults.length).toFixed(1)
        : '—';
      const topStudent = isAdmin && scoredResults.length > 0
        ? [...scoredResults].sort((a, b) => (b.combinedTotal || 0) - (a.combinedTotal || 0))[0]
        : null;

      let resultsHeaderSectionHtml = '';
      if (selectedSubReport === 'individual' && matchedResults.length > 0) {
        const resItem = matchedResults[0];
        resultsHeaderSectionHtml = `
          <div class="p-4 rounded-xl border border-blue-200 bg-slate-50/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs avoid-page-break">
            <div>
              <span class="text-[10px] font-bold uppercase text-slate-400 block">Student</span>
              <p class="font-bold text-blue-900 mt-0.5">${resItem.studentName}</p>
              <span class="font-mono text-[11px] text-blue-700">${resItem.studentId} · ${resItem.className}</span>
            </div>
            <div>
              <span class="text-[10px] font-bold uppercase text-slate-400 block">Midterm Total</span>
              <p class="text-base font-bold text-slate-900 mt-0.5 tabular-nums">${resItem.midtermTotal !== null ? resItem.midtermTotal : '—'}</p>
            </div>
            <div>
              <span class="text-[10px] font-bold uppercase text-slate-400 block">Final Total</span>
              <p class="text-base font-bold text-slate-900 mt-0.5 tabular-nums">${resItem.finalTotal !== null ? resItem.finalTotal : '—'}</p>
            </div>
            <div>
              <span class="text-[10px] font-bold uppercase text-slate-400 block">Combined Total${isAdmin ? ' & Rank' : ''}</span>
              <p class="text-base font-bold text-blue-900 mt-0.5 tabular-nums">${resItem.hasScores ? resItem.combinedTotal : '—'}${isAdmin && resItem.position ? ` · #${resItem.position}` : ''}</p>
            </div>
          </div>
        `;
      } else {
        resultsHeaderSectionHtml = `
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs avoid-page-break">
            <div class="p-3 rounded-lg border border-blue-200 bg-blue-50/50">
              <span class="text-[10px] font-bold uppercase text-blue-700 block">Graded Students</span>
              <span class="text-lg font-bold text-blue-900 tabular-nums">${scoredResults.length} / ${matchedResults.length}</span>
            </div>
            <div class="p-3 rounded-lg border border-emerald-200 bg-emerald-50/50">
              <span class="text-[10px] font-bold uppercase text-emerald-700 block">${isAdmin ? 'Combined Mean Total' : 'Assigned Mean Total'}</span>
              <span class="text-lg font-bold text-emerald-800 tabular-nums">${classAvgCombined}</span>
            </div>
            <div class="p-3 rounded-lg border border-amber-200 bg-amber-50/50">
              <span class="text-[10px] font-bold uppercase text-amber-800 block">${topStudent ? 'Top Performer (#1)' : 'Evaluation Scope'}</span>
              <span class="text-sm font-bold text-amber-900 truncate block">${topStudent ? `${topStudent.studentName} (${topStudent.combinedTotal} pts)` : (isAdmin ? 'Midterm + Final' : 'Assigned Subjects Only')}</span>
            </div>
          </div>
        `;
      }

      return {
        reportCode: subCodes[selectedSubReport] || 'RPT-RES-01',
        categoryBadge: subBadges[selectedSubReport] || 'RESULTS & RANKING REPORT',
        printOrientation: 'portrait',
        title: subTitles[selectedSubReport] || 'Results & Ranking Report',
        academicPeriod: `${targetYear} (${targetTerm})`,
        filterDescription: `${selectedSubReport === 'individual' && selectedStudent ? `${selectedStudent.fullName} (${selectedStudent.id})` : (currentClass ? currentClass.name : (isAdmin ? 'All Classes (Ranked Within Class)' : 'Assigned Classes (Assigned Subjects Only)'))} · ${targetYear} · ${targetTerm}`,
        filterPills: [
          selectedSubReport === 'individual' && selectedStudent
            ? { label: 'Student', value: `${selectedStudent.fullName} (${selectedStudent.id})` }
            : { label: 'Class', value: currentClass ? currentClass.name : (isAdmin ? 'All Classes' : 'Assigned Classes') },
          { label: 'Academic Year', value: targetYear },
          { label: 'Term', value: targetTerm },
          { label: 'Formula', value: isAdmin ? 'Midterm + Final = Combined' : 'Assigned Subjects Only' }
        ],
        dedicatedHeaderSectionHtml: resultsHeaderSectionHtml,
        headers: [
          { label: 'Position', align: 'center', numeric: true },
          { label: 'Student ID', align: 'left' },
          { label: 'Student Name', align: 'left' },
          { label: 'Class', align: 'left' },
          { label: 'Midterm Total', align: 'right', numeric: true },
          { label: 'Final Total', align: 'right', numeric: true },
          { label: 'Combined Total', align: 'right', numeric: true }
        ],
        rows,
        exportRows,
        emptyMessage: 'No examination results found for the selected class and term.'
      };
    }

    // 5. PROMOTION REPORTS
    if (selectedCategory === 'promotion') {
      let history = Data.getPromotionHistory();
      if (selectedSubReport === 'individual' && filterStudentId) {
        history = history.filter(p => p.studentId === filterStudentId);
      } else {
        if (filterClassId) {
          history = history.filter(p => p.previousClassId === filterClassId || p.newClassId === filterClassId);
        }
        if (filterAcademicYear) {
          history = history.filter(p => p.academicYear === filterAcademicYear);
        }
      }

      if (selectedSubReport === 'class-summary') {
        const summaryMap = new Map();
        history.forEach(p => {
          const key = `${p.previousClassId}__${p.newClassId}__${p.academicYear}`;
          if (!summaryMap.has(key)) {
            const prev = classes.find(c => c.id === p.previousClassId);
            const next = classes.find(c => c.id === p.newClassId);
            summaryMap.set(key, {
              previousClass: prev ? prev.name : p.previousClassId,
              newClass: next ? next.name : p.newClassId,
              academicYear: p.academicYear,
              count: 0,
              latestDate: p.promotedDate || ''
            });
          }
          const entry = summaryMap.get(key);
          entry.count += 1;
          if ((p.promotedDate || '') > entry.latestDate) entry.latestDate = p.promotedDate;
        });

        const summaryList = Array.from(summaryMap.values());
        return {
          reportCode: 'RPT-PRO-01',
          categoryBadge: 'PROMOTION REPORT · CLASS SUMMARY',
          printOrientation: 'portrait',
          title: 'Class Promotion Summary',
          academicPeriod: filterAcademicYear || 'All Academic Years',
          filterDescription: `${currentClass ? currentClass.name : 'All Classes'} · ${filterAcademicYear || 'All Academic Years'}`,
          filterPills: [
            { label: 'Class', value: currentClass ? currentClass.name : 'All Classes' },
            { label: 'Academic Year', value: filterAcademicYear || 'All Academic Years' },
            { label: 'Total Promoted', value: history.length }
          ],
          dedicatedHeaderSectionHtml: `
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs avoid-page-break">
              <div class="p-3 rounded-lg border border-blue-200 bg-blue-50/50">
                <span class="text-[10px] font-bold uppercase text-blue-700 block">Class Progression Groups</span>
                <span class="text-lg font-bold text-blue-900 tabular-nums">${summaryList.length}</span>
              </div>
              <div class="p-3 rounded-lg border border-emerald-200 bg-emerald-50/50">
                <span class="text-[10px] font-bold uppercase text-emerald-700 block">Students Promoted</span>
                <span class="text-lg font-bold text-emerald-800 tabular-nums">${history.length}</span>
              </div>
            </div>
          `,
          headers: [
            { label: 'Previous Class', align: 'left' },
            { label: 'New Class', align: 'left' },
            { label: 'Academic Year', align: 'center', numeric: true },
            { label: 'Students Promoted', align: 'right', numeric: true },
            { label: 'Promotion Date', align: 'center', numeric: true }
          ],
          rows: summaryList.map(item => [
            item.previousClass,
            `<span class="font-semibold text-blue-900">${item.newClass}</span>`,
            item.academicYear,
            `<span class="font-bold text-emerald-700">${item.count}</span>`,
            item.latestDate || '—'
          ]),
          exportRows: summaryList.map(item => [item.previousClass, item.newClass, item.academicYear, item.count, item.latestDate || '—']),
          totals: ['Total Promoted', '', '', history.length, '']
        };
      }

      const rows = history.map(p => {
        const s = Data.getStudentById(p.studentId);
        const prev = classes.find(c => c.id === p.previousClassId);
        const next = classes.find(c => c.id === p.newClassId);
        return [
          `<span class="font-mono text-blue-700">${p.studentId}</span>`,
          `<span class="font-semibold text-slate-900">${s ? s.fullName : '—'}</span>`,
          prev ? prev.name : p.previousClassId,
          `<span class="font-semibold text-blue-900">${next ? next.name : p.newClassId}</span>`,
          p.academicYear || '—',
          p.promotedDate || '—',
          p.promotedBy || 'Admin'
        ];
      });

      const exportRows = history.map(p => {
        const s = Data.getStudentById(p.studentId);
        const prev = classes.find(c => c.id === p.previousClassId);
        const next = classes.find(c => c.id === p.newClassId);
        return [p.studentId, s ? s.fullName : '—', prev ? prev.name : p.previousClassId, next ? next.name : p.newClassId, p.academicYear || '—', p.promotedDate || '—', p.promotedBy || 'Admin'];
      });

      const stuClsObj = selectedStudent ? classes.find(c => c.id === selectedStudent.classId) : null;
      return {
        reportCode: 'RPT-PRO-02',
        categoryBadge: 'PROMOTION REPORT · STUDENT HISTORY',
        printOrientation: 'landscape',
        title: 'Individual Student Promotion History',
        academicPeriod: filterAcademicYear || 'All Academic Years',
        filterDescription: selectedStudent ? `${selectedStudent.fullName} (${selectedStudent.id})` : 'All Students',
        filterPills: [
          { label: 'Student', value: selectedStudent ? `${selectedStudent.fullName} (${selectedStudent.id})` : 'All Students' },
          { label: 'Current Class', value: stuClsObj ? stuClsObj.name : 'All Classes' },
          { label: 'Academic Year', value: filterAcademicYear || 'All Years' }
        ],
        headers: [
          { label: 'Student ID', align: 'left' },
          { label: 'Student Name', align: 'left' },
          { label: 'Previous Class', align: 'left' },
          { label: 'New Class', align: 'left' },
          { label: 'Academic Year', align: 'center', numeric: true },
          { label: 'Promotion Date', align: 'center', numeric: true },
          { label: 'Authorized By', align: 'left' }
        ],
        rows,
        exportRows,
        totals: ['Total Promoted', history.length, '', '', '', '', '']
      };
    }

    // 6. FEE & PAYMENT REPORTS
    if (selectedCategory === 'payments') {
      if (selectedSubReport === 'individual') {
        const payments = Data.getPayments({
          studentId: filterStudentId || undefined,
          startDate: filterStartDate || undefined,
          endDate: filterEndDate || undefined
        });

        const totalPaid = payments.reduce((sum, p) => sum + (parseFloat(p.amountPaid) || 0), 0);

        const rows = payments.map(p => {
          const s = Data.getStudentById(p.studentId);
          const c = s ? classes.find(cls => cls.id === s.classId) : null;
          return [
            p.paymentDate || '—',
            `<span class="font-mono text-slate-600">${p.transactionRef || '—'}</span>`,
            `<span class="font-mono text-blue-700">${p.studentId}</span>`,
            `<span class="font-semibold text-slate-900">${s ? s.fullName : '—'}</span>`,
            c ? c.name : '—',
            p.feeCategory || '—',
            p.paymentMethod || 'Cash',
            `<span class="font-bold text-emerald-700">${currency}${parseFloat(p.amountPaid || 0).toFixed(2)}</span>`
          ];
        });

        const exportRows = payments.map(p => {
          const s = Data.getStudentById(p.studentId);
          const c = s ? classes.find(cls => cls.id === s.classId) : null;
          return [
            p.paymentDate || '—',
            p.transactionRef || '—',
            p.studentId,
            s ? s.fullName : '—',
            c ? c.name : '—',
            p.feeCategory || '—',
            p.paymentMethod || 'Cash',
            parseFloat((p.amountPaid || 0).toFixed(2))
          ];
        });

        const stuClsObj = selectedStudent ? classes.find(c => c.id === selectedStudent.classId) : null;
        return {
          reportCode: 'RPT-PAY-03',
          categoryBadge: 'FEE & PAYMENT REPORT · STUDENT RECEIPT LEDGER',
          printOrientation: 'landscape',
          title: 'Student Payment History',
          academicPeriod: `${filterStartDate || 'All'} to ${filterEndDate || 'Present'}`,
          filterDescription: selectedStudent ? `${selectedStudent.fullName} (${selectedStudent.id})` : 'All Students',
          filterPills: [
            { label: 'Student', value: selectedStudent ? `${selectedStudent.fullName} (${selectedStudent.id})` : 'All Students' },
            { label: 'Class', value: stuClsObj ? stuClsObj.name : 'All Classes' },
            { label: 'Date Range', value: `${filterStartDate || 'All'} to ${filterEndDate || 'Present'}` }
          ],
          dedicatedHeaderSectionHtml: `
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs avoid-page-break">
              <div class="p-3 rounded-lg border border-blue-200 bg-blue-50/50">
                <span class="text-[10px] font-bold uppercase text-blue-700 block">Payment Receipts Issued</span>
                <span class="text-lg font-bold text-blue-900 tabular-nums">${payments.length}</span>
              </div>
              <div class="p-3 rounded-lg border border-emerald-200 bg-emerald-50/50">
                <span class="text-[10px] font-bold uppercase text-emerald-700 block">Total Amount Paid</span>
                <span class="text-lg font-bold text-emerald-800 tabular-nums">${currency}${totalPaid.toFixed(2)}</span>
              </div>
            </div>
          `,
          headers: [
            { label: 'Payment Date', align: 'center', numeric: true },
            { label: 'Reference', align: 'left' },
            { label: 'Student ID', align: 'left' },
            { label: 'Student Name', align: 'left' },
            { label: 'Class', align: 'left' },
            { label: 'Fee Category', align: 'left' },
            { label: 'Method', align: 'center' },
            { label: 'Amount Paid', align: 'right', numeric: true }
          ],
          rows,
          exportRows,
          totals: ['Total Collected', `${payments.length} receipts`, '', '', '', '', '', parseFloat(totalPaid.toFixed(2))]
        };
      }

      const ledger = Data.getStudentFeeLedger(filterMonth);
      let items = ledger.map(l => {
        if (selectedSubReport === 'class-fee') {
          const bal = Math.max(0, l.classFeeDue - l.classFeePaid);
          return {
            studentId: l.studentId,
            studentName: l.studentName,
            classId: l.classId,
            className: l.className,
            feeCategory: 'Class Fee',
            amountDue: l.classFeeDue,
            amountPaid: l.classFeePaid,
            outstandingBalance: bal,
            status: l.classFeeStatus
          };
        }
        if (selectedSubReport === 'school-fee') {
          const bal = Math.max(0, l.schoolFeeDue - l.schoolFeePaid);
          return {
            studentId: l.studentId,
            studentName: l.studentName,
            classId: l.classId,
            className: l.className,
            feeCategory: 'School Fee',
            amountDue: l.schoolFeeDue,
            amountPaid: l.schoolFeePaid,
            outstandingBalance: bal,
            status: l.schoolFeeStatus
          };
        }
        return {
          studentId: l.studentId,
          studentName: l.studentName,
          classId: l.classId,
          className: l.className,
          feeCategory: 'Class Fee & School Fee',
          amountDue: l.totalDue,
          amountPaid: l.totalPaid,
          outstandingBalance: l.outstandingBalance,
          status: l.status
        };
      });

      if (filterClassId) items = items.filter(i => i.classId === filterClassId);
      if (filterStudentQuery.trim()) {
        const q = filterStudentQuery.trim().toLowerCase();
        items = items.filter(i => i.studentId.toLowerCase().includes(q) || i.studentName.toLowerCase().includes(q));
      }
      if (selectedSubReport === 'outstanding') {
        items = items.filter(i => i.outstandingBalance > 0);
      }
      if (filterPaymentStatus) {
        items = items.filter(i => i.status === filterPaymentStatus);
      }

      const totalDue = items.reduce((s, i) => s + i.amountDue, 0);
      const totalPaid = items.reduce((s, i) => s + i.amountPaid, 0);
      const totalBal = items.reduce((s, i) => s + i.outstandingBalance, 0);

      const subTitles = {
        'class-fee': 'Class Fee Report',
        'school-fee': 'School Fee Report',
        'outstanding': 'Outstanding Fees Report'
      };

      const summaryCardsHtml = `
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs avoid-page-break">
          <div class="p-3 rounded-lg border border-slate-200 bg-slate-50">
            <span class="text-[10px] font-bold uppercase text-slate-500 block">Total Amount Due</span>
            <span class="text-lg font-bold text-blue-900 tabular-nums">${currency}${totalDue.toFixed(2)}</span>
          </div>
          <div class="p-3 rounded-lg border border-emerald-200 bg-emerald-50/60">
            <span class="text-[10px] font-bold uppercase text-emerald-700 block">Total Amount Paid</span>
            <span class="text-lg font-bold text-emerald-800 tabular-nums">${currency}${totalPaid.toFixed(2)}</span>
          </div>
          <div class="p-3 rounded-lg border border-rose-200 bg-rose-50/60">
            <span class="text-[10px] font-bold uppercase text-rose-700 block">Total Outstanding Balance</span>
            <span class="text-lg font-bold text-rose-800 tabular-nums">${currency}${totalBal.toFixed(2)}</span>
          </div>
        </div>
      `;

      const rows = items.map(i => [
        `<span class="font-mono text-blue-700">${i.studentId}</span>`,
        `<span class="font-semibold text-slate-900">${i.studentName}</span>`,
        i.className,
        i.feeCategory,
        `${currency}${i.amountDue.toFixed(2)}`,
        `<span class="font-semibold text-emerald-700">${currency}${i.amountPaid.toFixed(2)}</span>`,
        `<span class="font-semibold ${i.outstandingBalance > 0 ? 'text-rose-700' : 'text-slate-600'}">${currency}${i.outstandingBalance.toFixed(2)}</span>`,
        renderPaymentStatusBadge(i.status)
      ]);

      const exportRows = items.map(i => [
        i.studentId,
        i.studentName,
        i.className,
        i.feeCategory,
        parseFloat(i.amountDue.toFixed(2)),
        parseFloat(i.amountPaid.toFixed(2)),
        parseFloat(i.outstandingBalance.toFixed(2)),
        i.status
      ]);

      const subCodes = {
        'class-fee': 'RPT-PAY-01',
        'school-fee': 'RPT-PAY-02',
        'outstanding': 'RPT-PAY-04'
      };
      const subBadges = {
        'class-fee': 'FEE & PAYMENT REPORT · CLASS FEES',
        'school-fee': 'FEE & PAYMENT REPORT · SCHOOL FEES',
        'outstanding': 'FEE & PAYMENT REPORT · OUTSTANDING BALANCES'
      };

      return {
        reportCode: subCodes[selectedSubReport] || 'RPT-PAY-01',
        categoryBadge: subBadges[selectedSubReport] || 'FEE & PAYMENT REPORT',
        printOrientation: 'landscape',
        title: subTitles[selectedSubReport] || 'Fee & Payment Report',
        academicPeriod: `Month: ${filterMonth}`,
        filterDescription: `${currentClass ? currentClass.name : 'All Classes'} · Billing Month: ${filterMonth}${filterPaymentStatus ? ` · Status: ${filterPaymentStatus}` : ''}`,
        filterPills: [
          { label: 'Class', value: currentClass ? currentClass.name : 'All Classes' },
          { label: 'Billing Month', value: filterMonth },
          { label: 'Status', value: filterPaymentStatus || (selectedSubReport === 'outstanding' ? 'Unpaid / Partial' : 'All Statuses') }
        ],
        summaryCardsHtml,
        summaryItems: [
          { label: 'Amount Due', value: `${currency}${totalDue.toFixed(2)}` },
          { label: 'Amount Paid', value: `${currency}${totalPaid.toFixed(2)}` },
          { label: 'Outstanding', value: `${currency}${totalBal.toFixed(2)}` }
        ],
        headers: [
          { label: 'Student ID', align: 'left' },
          { label: 'Student Name', align: 'left' },
          { label: 'Class', align: 'left' },
          { label: 'Fee Category', align: 'left' },
          { label: 'Amount Due', align: 'right', numeric: true },
          { label: 'Amount Paid', align: 'right', numeric: true },
          { label: 'Outstanding Balance', align: 'right', numeric: true },
          { label: 'Payment Status', align: 'center' }
        ],
        rows,
        exportRows,
        totals: ['Totals', `${items.length} students`, '', '', parseFloat(totalDue.toFixed(2)), parseFloat(totalPaid.toFixed(2)), parseFloat(totalBal.toFixed(2)), '']
      };
    }

    // 7. INCOME & EXPENSES REPORTS (ADMIN ONLY — STRICTLY NO DOUBLE COUNTING)
    if (selectedCategory === 'income-expenses') {
      const overview = Data.getFinancialOverview({
        month: filterMonth || undefined,
        startDate: filterStartDate || undefined,
        endDate: filterEndDate || undefined
      });
      const payments = Data.getPayments({
        month: filterMonth || undefined,
        startDate: filterStartDate || undefined,
        endDate: filterEndDate || undefined
      });
      const incomes = Data.getIncomes({
        startDate: filterStartDate || undefined,
        endDate: filterEndDate || undefined
      });
      const expenses = Data.getExpenses({
        startDate: filterStartDate || undefined,
        endDate: filterEndDate || undefined
      });

      if (selectedSubReport === 'income') {
        const incomeRows = [
          ...payments.map(p => {
            const st = Data.getStudentById(p.studentId);
            const isReversal = p.transactionType && p.transactionType.toUpperCase() === 'REVERSAL';
            const isRefund = p.transactionType && p.transactionType.toUpperCase() === 'REFUND';
            const isDeduction = isReversal || isRefund;
            const sourceLabel = isReversal ? 'Fee Reversal' : (isRefund ? 'Fee Refund' : 'Student Fee Collection');
            const rawAmt = parseFloat(p.amountPaid) || 0;
            return {
              date: p.paymentDate || '',
              source: sourceLabel,
              description: `${st ? st.fullName : p.studentId} (${p.month || '—'})${isDeduction ? ` · ${p.reversalReason || 'Deduction'}` : ''}`,
              category: p.feeCategory || 'School Fee',
              amount: isDeduction ? -rawAmt : rawAmt,
              method: p.paymentMethod || 'Cash'
            };
          }),
          ...incomes.map(i => ({
            date: i.date || '',
            source: 'Other Income',
            description: i.title || i.description || 'Income Entry',
            category: i.category || 'Other Income',
            amount: parseFloat(i.amount) || 0,
            method: i.paymentMethod || 'Cash'
          }))
        ].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        const summaryCardsHtml = `
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs avoid-page-break">
            <div class="p-3 bg-blue-50/70 border border-blue-200 rounded-lg">
              <span class="text-[10px] font-bold text-blue-800 uppercase block">Student Fee Collections</span>
              <span class="text-base font-extrabold text-blue-900 tabular-nums">${currency}${overview.studentFeeCollections.toFixed(2)}</span>
            </div>
            <div class="p-3 bg-emerald-50/60 border border-emerald-200 rounded-lg">
              <span class="text-[10px] font-bold text-emerald-700 uppercase block">Other Income</span>
              <span class="text-base font-extrabold text-emerald-800 tabular-nums">${currency}${overview.otherIncome.toFixed(2)}</span>
            </div>
            <div class="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <span class="text-[10px] font-bold text-slate-600 uppercase block">Total Income</span>
              <span class="text-base font-extrabold text-emerald-700 tabular-nums">${currency}${overview.totalIncome.toFixed(2)}</span>
            </div>
          </div>
        `;

        return {
          reportCode: 'RPT-FIN-01',
          categoryBadge: 'FINANCIAL STATEMENT · INCOME LEDGER',
          printOrientation: 'portrait',
          title: 'Income Report',
          academicPeriod: filterMonth || 'Selected Date Range',
          filterDescription: `${filterMonth ? `Month: ${filterMonth}` : 'All Months'}${filterStartDate || filterEndDate ? ` · ${filterStartDate || 'Start'} to ${filterEndDate || 'Present'}` : ''}`,
          filterPills: [
            { label: 'Month', value: filterMonth || 'All Months' },
            ...(filterStartDate || filterEndDate ? [{ label: 'Date Range', value: `${filterStartDate || 'Start'} to ${filterEndDate || 'Present'}` }] : []),
            { label: 'Total Income', value: `${currency}${overview.totalIncome.toFixed(2)}` }
          ],
          summaryCardsHtml,
          summaryItems: [
            { label: 'Student Fee Collections', value: `${currency}${overview.studentFeeCollections.toFixed(2)}` },
            { label: 'Other Income', value: `${currency}${overview.otherIncome.toFixed(2)}` },
            { label: 'Total Income', value: `${currency}${overview.totalIncome.toFixed(2)}` }
          ],
          headers: [
            { label: 'Date', align: 'center', numeric: true },
            { label: 'Income Source', align: 'left' },
            { label: 'Description', align: 'left' },
            { label: 'Category', align: 'left' },
            { label: 'Amount', align: 'right', numeric: true },
            { label: 'Payment Method', align: 'center' }
          ],
          rows: incomeRows.map(t => [
            t.date || '—',
            `<span class="font-semibold ${t.amount < 0 ? 'text-rose-700' : 'text-blue-800'}">${t.source}</span>`,
            t.description,
            t.category,
            `<span class="font-bold ${t.amount < 0 ? 'text-rose-700' : 'text-emerald-700'}">${t.amount < 0 ? '-' : '+'}${currency}${Math.abs(t.amount).toFixed(2)}</span>`,
            t.method
          ]),
          exportRows: incomeRows.map(t => [
            t.date || '—',
            t.source,
            t.description,
            t.category,
            parseFloat(t.amount.toFixed(2)),
            t.method
          ]),
          totals: ['Total Income', `${incomeRows.length} entries`, '', '', parseFloat(overview.totalIncome.toFixed(2)), '']
        };
      }

      if (selectedSubReport === 'expenses') {
        const sortedExpenses = [...expenses].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        const summaryCardsHtml = `
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs avoid-page-break">
            <div class="p-3 bg-rose-50/60 border border-rose-200 rounded-lg">
              <span class="text-[10px] font-bold text-rose-700 uppercase block">Total Expenses</span>
              <span class="text-base font-extrabold text-rose-700 tabular-nums">${currency}${overview.totalExpenses.toFixed(2)}</span>
            </div>
            <div class="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <span class="text-[10px] font-bold text-slate-600 uppercase block">Expense Entries</span>
              <span class="text-base font-extrabold text-blue-900 tabular-nums">${sortedExpenses.length}</span>
            </div>
          </div>
        `;

        return {
          reportCode: 'RPT-FIN-02',
          categoryBadge: 'FINANCIAL STATEMENT · EXPENSES LEDGER',
          printOrientation: 'portrait',
          title: 'Expenses Report',
          academicPeriod: filterStartDate || filterEndDate ? `${filterStartDate || 'Start'} to ${filterEndDate || 'Present'}` : 'All Recorded Expenses',
          filterDescription: `${filterStartDate || filterEndDate ? `${filterStartDate || 'Start'} to ${filterEndDate || 'Present'}` : 'All Recorded School Expenses'}`,
          filterPills: [
            { label: 'Date Range', value: filterStartDate || filterEndDate ? `${filterStartDate || 'Start'} to ${filterEndDate || 'Present'}` : 'All Recorded Dates' },
            { label: 'Total Expenses', value: `${currency}${overview.totalExpenses.toFixed(2)}` }
          ],
          summaryCardsHtml,
          summaryItems: [
            { label: 'Total Expenses', value: `${currency}${overview.totalExpenses.toFixed(2)}` },
            { label: 'Entries', value: sortedExpenses.length }
          ],
          headers: [
            { label: 'Date', align: 'center', numeric: true },
            { label: 'Description', align: 'left' },
            { label: 'Category', align: 'left' },
            { label: 'Reference', align: 'left' },
            { label: 'Amount', align: 'right', numeric: true },
            { label: 'Payment Method', align: 'center' }
          ],
          rows: sortedExpenses.map(e => [
            e.date || '—',
            `<span class="font-semibold text-slate-900">${e.title || e.description || 'Expense Entry'}</span>`,
            e.category || 'Operations',
            `<span class="font-mono text-slate-600">${e.referenceNumber || '—'}</span>`,
            `<span class="font-bold text-rose-700">-${currency}${(parseFloat(e.amount) || 0).toFixed(2)}</span>`,
            e.paymentMethod || 'Cash'
          ]),
          exportRows: sortedExpenses.map(e => [
            e.date || '—',
            e.title || e.description || 'Expense Entry',
            e.category || 'Operations',
            e.referenceNumber || '—',
            parseFloat((parseFloat(e.amount) || 0).toFixed(2)),
            e.paymentMethod || 'Cash'
          ]),
          totals: ['Total Expenses', `${sortedExpenses.length} entries`, '', '', parseFloat(overview.totalExpenses.toFixed(2)), '']
        };
      }

      // Financial Summary (Unified non-duplicated ledger + Net Balance)
      const summaryCardsHtml = `
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs avoid-page-break">
          <div class="p-3 bg-blue-50/70 border border-blue-200 rounded-lg">
            <span class="text-[10px] font-bold text-blue-800 uppercase block">Student Fee Collections</span>
            <span class="text-base font-extrabold text-blue-900 tabular-nums">${currency}${overview.studentFeeCollections.toFixed(2)}</span>
          </div>
          <div class="p-3 bg-emerald-50/60 border border-emerald-200 rounded-lg">
            <span class="text-[10px] font-bold text-emerald-700 uppercase block">Other Income</span>
            <span class="text-base font-extrabold text-emerald-800 tabular-nums">${currency}${overview.otherIncome.toFixed(2)}</span>
          </div>
          <div class="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <span class="text-[10px] font-bold text-slate-600 uppercase block">Total Income</span>
            <span class="text-base font-extrabold text-emerald-700 tabular-nums">${currency}${overview.totalIncome.toFixed(2)}</span>
          </div>
          <div class="p-3 bg-rose-50/60 border border-rose-200 rounded-lg">
            <span class="text-[10px] font-bold text-rose-700 uppercase block">Total Expenses</span>
            <span class="text-base font-extrabold text-rose-700 tabular-nums">${currency}${overview.totalExpenses.toFixed(2)}</span>
          </div>
          <div class="p-3 ${overview.netBalance >= 0 ? 'bg-emerald-50 border-emerald-300' : 'bg-rose-50 border-rose-300'} border rounded-lg">
            <span class="text-[10px] font-bold text-slate-700 uppercase block">Net Balance</span>
            <span class="text-base font-extrabold ${overview.netBalance >= 0 ? 'text-emerald-800' : 'text-rose-800'} tabular-nums">${currency}${overview.netBalance.toFixed(2)}</span>
          </div>
        </div>
      `;

      const summaryItems = [
        { label: 'Total Income', value: `${currency}${overview.totalIncome.toFixed(2)}` },
        { label: 'Total Expenses', value: `${currency}${overview.totalExpenses.toFixed(2)}` },
        { label: 'Net Balance', value: `${currency}${overview.netBalance.toFixed(2)}` }
      ];

      const allTransactions = [
        ...payments.map(p => {
          const st = Data.getStudentById(p.studentId);
          const isReversal = p.transactionType && p.transactionType.toUpperCase() === 'REVERSAL';
          const isRefund = p.transactionType && p.transactionType.toUpperCase() === 'REFUND';
          const isDeduction = isReversal || isRefund;
          const typeLabel = isReversal ? 'Fee Reversal' : (isRefund ? 'Fee Refund' : 'Student Fee Collection');
          const rawAmt = parseFloat(p.amountPaid) || 0;
          return {
            date: p.paymentDate || '',
            type: typeLabel,
            description: `${st ? st.fullName : p.studentId} (${p.month || '—'})${isDeduction ? ` · ${p.reversalReason || 'Deduction'}` : ''}`,
            category: p.feeCategory || 'School Fee',
            amount: isDeduction ? -rawAmt : rawAmt,
            method: p.paymentMethod || 'Cash'
          };
        }),
        ...incomes.map(i => ({
          date: i.date || '',
          type: 'Other Income',
          description: i.title || i.description || 'Income Entry',
          category: i.category || 'Other Income',
          amount: parseFloat(i.amount) || 0,
          method: i.paymentMethod || 'Cash'
        })),
        ...expenses.map(e => ({
          date: e.date || '',
          type: 'Expense',
          description: e.title || e.description || 'Expense Entry',
          category: e.category || 'Operations',
          amount: parseFloat(e.amount) || 0,
          method: e.paymentMethod || 'Cash'
        }))
      ].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

      const rows = allTransactions.map(t => [
        t.date || '—',
        `<span class="font-semibold ${t.type === 'Expense' || t.amount < 0 ? 'text-rose-700' : 'text-emerald-700'}">${t.type}</span>`,
        t.description,
        t.category,
        `<span class="font-bold ${t.type === 'Expense' || t.amount < 0 ? 'text-rose-700' : 'text-emerald-700'}">${t.type === 'Expense' || t.amount < 0 ? '-' : '+'}${currency}${Math.abs(t.amount).toFixed(2)}</span>`,
        t.method
      ]);

      const exportRows = allTransactions.map(t => [
        t.date || '—',
        t.type,
        t.description,
        t.category,
        t.type === 'Expense' ? parseFloat((-Math.abs(t.amount)).toFixed(2)) : parseFloat(t.amount.toFixed(2)),
        t.method
      ]);

      return {
        reportCode: 'RPT-FIN-03',
        categoryBadge: 'FINANCIAL STATEMENT · INCOME & EXPENSES SUMMARY',
        printOrientation: 'portrait',
        title: 'Income & Expenses Financial Summary',
        academicPeriod: filterMonth || 'Selected Date Range',
        filterDescription: `${filterMonth ? `Month: ${filterMonth}` : 'All Months'}${filterStartDate || filterEndDate ? ` · ${filterStartDate || 'Start'} to ${filterEndDate || 'Present'}` : ''}`,
        filterPills: [
          { label: 'Month', value: filterMonth || 'All Months' },
          ...(filterStartDate || filterEndDate ? [{ label: 'Date Range', value: `${filterStartDate || 'Start'} to ${filterEndDate || 'Present'}` }] : []),
          { label: 'Net Balance', value: `${currency}${overview.netBalance.toFixed(2)}` }
        ],
        summaryCardsHtml,
        summaryItems,
        headers: [
          { label: 'Date', align: 'center', numeric: true },
          { label: 'Transaction Type', align: 'left' },
          { label: 'Description', align: 'left' },
          { label: 'Category', align: 'left' },
          { label: 'Amount', align: 'right', numeric: true },
          { label: 'Payment Method', align: 'center' }
        ],
        rows,
        exportRows,
        totals: ['Net Balance', `${allTransactions.length} entries`, `Income: ${currency}${overview.totalIncome.toFixed(2)}`, `Expenses: ${currency}${overview.totalExpenses.toFixed(2)}`, parseFloat(overview.netBalance.toFixed(2)), '']
      };
    }

    return { title: 'Report', academicPeriod: '', filterDescription: '', headers: [], rows: [], exportRows: [] };
  },

  syncFiltersFromDOM(container) {
    if (!container || typeof container.querySelector !== 'function') return;
    const readVal = (sel) => {
      const el = container.querySelector(sel);
      return el ? el.value : null;
    };

    const cls = readVal('#report-class-select');
    if (cls !== null) filterClassId = cls;
    const stu = readVal('#report-student-select');
    if (stu !== null) filterStudentId = stu;
    const query = readVal('#report-student-query');
    if (query !== null) filterStudentQuery = query;
    const yr = readVal('#report-year-select');
    if (yr !== null) filterAcademicYear = yr;
    const term = readVal('#report-term-select');
    if (term !== null) filterTerm = term;
    const exam = readVal('#report-exam-select');
    if (exam !== null) filterExamType = exam;
    const sub = readVal('#report-subject-select');
    if (sub !== null) filterSubjectId = sub;
    const dateVal = readVal('#report-date-input');
    if (dateVal !== null) filterDate = dateVal;
    const monthVal = readVal('#report-month-input');
    if (monthVal !== null) filterMonth = monthVal;
    const startVal = readVal('#report-start-date');
    if (startVal !== null) filterStartDate = startVal;
    const endVal = readVal('#report-end-date');
    if (endVal !== null) filterEndDate = endVal;
    const payStatus = readVal('#report-payment-status');
    if (payStatus !== null) filterPaymentStatus = payStatus;
  },

  bindEvents(container, settings, user) {
    container.querySelectorAll('.report-category-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        selectedCategory = tab.dataset.cat;
        const catDef = CATEGORY_DEFINITIONS.find(c => c.id === selectedCategory);
        const permitted = catDef ? catDef.subReports.filter(sr => Permissions.canAccessSubReport(user, selectedCategory, sr.id)) : [];
        selectedSubReport = permitted.length > 0 ? (permitted.some(sr => sr.id === catDef.defaultSub) ? catDef.defaultSub : permitted[0].id) : (catDef ? catDef.defaultSub : 'all');
        filterStudentId = '';
        filterStudentQuery = '';
        filterExamType = '';
        filterSubjectId = '';
        filterPaymentStatus = '';
        this.render(container);
      });
    });

    container.querySelectorAll('.report-sub-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        if (!Permissions.canAccessSubReport(user, selectedCategory, tab.dataset.sub)) {
          Components.showToast('Access to that report view is restricted.', 'warning');
          return;
        }
        if (selectedSubReport === 'individual' && tab.dataset.sub !== 'individual') {
          filterStudentId = '';
        }
        selectedSubReport = tab.dataset.sub;
        this.render(container);
      });
    });

    const classSelect = container.querySelector('#report-class-select');
    if (classSelect) {
      classSelect.addEventListener('change', (e) => {
        filterClassId = e.target.value;
        filterSubjectId = '';
        this.render(container);
      });
    }

    const studentSelect = container.querySelector('#report-student-select');
    if (studentSelect) {
      studentSelect.addEventListener('change', (e) => {
        filterStudentId = e.target.value;
      });
    }

    const studentQueryInput = container.querySelector('#report-student-query');
    if (studentQueryInput) {
      studentQueryInput.addEventListener('input', (e) => {
        filterStudentQuery = e.target.value;
      });
    }

    const yearSelect = container.querySelector('#report-year-select');
    if (yearSelect) {
      yearSelect.addEventListener('change', (e) => {
        filterAcademicYear = e.target.value;
      });
    }

    const termSelect = container.querySelector('#report-term-select');
    if (termSelect) {
      termSelect.addEventListener('change', (e) => {
        filterTerm = e.target.value;
      });
    }

    const examSelect = container.querySelector('#report-exam-select');
    if (examSelect) {
      examSelect.addEventListener('change', (e) => {
        filterExamType = e.target.value;
      });
    }

    const subjectSelect = container.querySelector('#report-subject-select');
    if (subjectSelect) {
      subjectSelect.addEventListener('change', (e) => {
        filterSubjectId = e.target.value;
      });
    }

    const dateInput = container.querySelector('#report-date-input');
    if (dateInput) {
      dateInput.addEventListener('change', (e) => {
        filterDate = e.target.value;
      });
    }

    const monthInput = container.querySelector('#report-month-input');
    if (monthInput) {
      monthInput.addEventListener('change', (e) => {
        filterMonth = e.target.value;
      });
    }

    const startDateInput = container.querySelector('#report-start-date');
    if (startDateInput) {
      startDateInput.addEventListener('change', (e) => {
        filterStartDate = e.target.value;
      });
    }

    const endDateInput = container.querySelector('#report-end-date');
    if (endDateInput) {
      endDateInput.addEventListener('change', (e) => {
        filterEndDate = e.target.value;
      });
    }

    const paymentStatusSelect = container.querySelector('#report-payment-status');
    if (paymentStatusSelect) {
      paymentStatusSelect.addEventListener('change', (e) => {
        filterPaymentStatus = e.target.value;
      });
    }

    const runBtn = container.querySelector('#run-report-btn');
    if (runBtn) {
      runBtn.addEventListener('click', () => {
        this.syncFiltersFromDOM(container);
        this.render(container);
        Components.showToast('Report updated with selected filters.', 'info', 2000);
      });
    }

    const resetBtn = container.querySelector('#reset-report-filters-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        filterClassId = '';
        filterStudentId = '';
        filterStudentQuery = '';
        filterAcademicYear = '';
        filterTerm = '';
        filterExamType = '';
        filterSubjectId = '';
        filterDate = new Date().toISOString().split('T')[0];
        filterMonth = new Date().toISOString().slice(0, 7);
        filterStartDate = '';
        filterEndDate = '';
        filterPaymentStatus = '';
        this.render(container);
      });
    }

    const printBtn = container.querySelector('#print-report-btn');
    if (printBtn) {
      printBtn.addEventListener('click', async () => {
        if (!Permissions.hasPermission(user, 'reports', 'print') || !Permissions.canAccessReport(user, selectedCategory) || !Permissions.canAccessSubReport(user, selectedCategory, selectedSubReport)) return;
        this.syncFiltersFromDOM(container);
        this.render(container);
        if (!activeReportData) return;
        const colCount = Array.isArray(activeReportData.headers) ? activeReportData.headers.length : 0;
        const orientation = activeReportData.printOrientation || (colCount >= 8 ? 'landscape' : 'portrait');
        await Components.triggerPrint({
          orientation,
          targetSelector: '.printable-area'
        });
      });
    }

    const pdfBtn = container.querySelector('#export-pdf-btn');
    if (pdfBtn) {
      pdfBtn.addEventListener('click', async () => {
        if (!Permissions.hasPermission(user, 'reports', 'print') || !Permissions.canAccessReport(user, selectedCategory) || !Permissions.canAccessSubReport(user, selectedCategory, selectedSubReport)) return;
        this.syncFiltersFromDOM(container);
        this.render(container);
        if (!activeReportData) return;
        const filename = `MADARASATUL_AL_IMAAM_${selectedCategory}_${selectedSubReport}_${new Date().toISOString().split('T')[0]}.pdf`;
        await Components.exportToPDF({
          filename,
          institutionName: settings.institutionName || 'MADARASATUL AL-IMAAM',
          systemName: 'AL-IMAAMA',
          address: settings.address || 'Hargeisa, Somaliland',
          contactPhone: settings.contactPhone || '063-4129440',
          reportTitle: activeReportData.title,
          academicPeriod: activeReportData.academicPeriod || '',
          filterDescription: activeReportData.filterDescription || '',
          generatedDate: new Date().toLocaleDateString(),
          headers: activeReportData.headers,
          rows: activeReportData.exportRows || activeReportData.rows,
          totalsRow: activeReportData.totals || null,
          summaryItems: activeReportData.summaryItems || [],
          preparedBy: user ? user.fullName : 'Administrator'
        });
        Components.showToast('Report exported to PDF.', 'success');
      });
    }

    const excelBtn = container.querySelector('#export-excel-btn');
    if (excelBtn) {
      excelBtn.addEventListener('click', () => {
        if (!Permissions.hasPermission(user, 'reports', 'export') || !Permissions.canAccessReport(user, selectedCategory) || !Permissions.canAccessSubReport(user, selectedCategory, selectedSubReport)) return;
        this.syncFiltersFromDOM(container);
        this.render(container);
        if (!activeReportData) return;
        const filename = `MADARASATUL_AL_IMAAM_${selectedCategory}_${selectedSubReport}_${new Date().toISOString().split('T')[0]}.xlsx`;
        Components.exportToExcel(
          filename,
          selectedCategory,
          activeReportData.headers,
          activeReportData.exportRows || activeReportData.rows,
          activeReportData.totals || null,
          {
            institutionName: settings.institutionName || 'MADARASATUL AL-IMAAM',
            systemName: 'AL-IMAAMA',
            reportTitle: activeReportData.title,
            academicPeriod: activeReportData.academicPeriod || '',
            filterDescription: activeReportData.filterDescription || '',
            generatedDate: new Date().toLocaleDateString()
          }
        );
        Components.showToast('Report exported to Excel (.xlsx).', 'success');
      });
    }

    const csvBtn = container.querySelector('#export-csv-btn');
    if (csvBtn) {
      csvBtn.addEventListener('click', () => {
        if (!Permissions.hasPermission(user, 'reports', 'export') || !Permissions.canAccessReport(user, selectedCategory) || !Permissions.canAccessSubReport(user, selectedCategory, selectedSubReport)) return;
        this.syncFiltersFromDOM(container);
        this.render(container);
        if (!activeReportData) return;
        const filename = `MADARASATUL_AL_IMAAM_${selectedCategory}_${selectedSubReport}_${new Date().toISOString().split('T')[0]}.csv`;
        Components.exportToCSV(
          filename,
          activeReportData.headers,
          activeReportData.exportRows || activeReportData.rows,
          activeReportData.totals || null,
          {
            institutionName: settings.institutionName || 'MADARASATUL AL-IMAAM',
            systemName: 'AL-IMAAMA',
            reportTitle: activeReportData.title,
            academicPeriod: activeReportData.academicPeriod || '',
            filterDescription: activeReportData.filterDescription || '',
            generatedDate: new Date().toLocaleDateString()
          }
        );
        Components.showToast('Report exported to CSV.', 'success');
      });
    }
  }
};
