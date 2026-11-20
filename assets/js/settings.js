/**
 * AL-IMAAMA - Settings Module
 * Manages language preferences, official MADARASATUL AL-IMAAM identity & logo,
 * academic calendars & curriculum overview, fee rates, currency format,
 * granular User Permissions Management matrix, and factory reset.
 */

import { Data } from './data.js';
import { Auth } from './auth.js';
import { Storage } from './storage.js';
import { Permissions, PERMISSION_MODULES, PERMISSION_ACTIONS } from './permissions.js';
import { Components } from './components.js';
import { I18n } from './i18n.js';

export const SettingsView = {
  render(container) {
    const currentUser = Auth.getCurrentUser();
    if (!Permissions.isAdmin(currentUser)) {
      container.innerHTML = `<div class="p-8 text-center text-sm text-rose-600 font-semibold">Access Restricted: Only Administrators can configure system settings.</div>`;
      return;
    }

    const settings = Data.getSettings();
    const currentLang = I18n.getLanguage();
    const classes = Data.getClasses();
    const subjects = Data.getSubjects();
    const users = Data.getUsers();

    container.innerHTML = `
      <div class="space-y-6 max-w-5xl">
        <!-- Module Header -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold tracking-tight text-slate-900">${I18n.t('settings.title', 'System Preferences & Settings')}</h1>
            <p class="text-sm text-slate-500 mt-1">${I18n.t('settings.sub', 'Configure institutional identity, academic calendars, fee rates, and user permissions.')}</p>
          </div>
        </div>

        <!-- Section 0: Multi-Language Selector -->
        <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div class="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 class="text-sm font-bold text-slate-900 flex items-center gap-2">
                ${Components.icon('globe', 'w-4 h-4 text-blue-600')} ${I18n.t('settings.langSettingsTitle', 'Interface Language Settings')}
              </h3>
              <p class="text-xs text-slate-500 mt-0.5">${I18n.t('settings.langSettingsSub', 'Choose your preferred language. Arabic will automatically activate Right-to-Left (RTL) mode.')}</p>
            </div>
            <span class="px-2.5 py-1 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-md uppercase">
              ${currentLang}
            </span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label class="cursor-pointer border-2 rounded-xl p-4 transition-all flex items-center justify-between ${
              currentLang === 'en' ? 'border-blue-600 bg-blue-50/50 shadow-xs' : 'border-slate-200 hover:border-slate-300 bg-white'
            }">
              <div class="flex items-center gap-3">
                <input type="radio" name="systemLanguage" value="en" ${currentLang === 'en' ? 'checked' : ''} class="lang-radio text-blue-600 focus:ring-blue-500" />
                <div>
                  <div class="font-bold text-slate-900 text-sm">English</div>
                  <div class="text-[11px] text-slate-500">English (EN) · LTR</div>
                </div>
              </div>
              <span class="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">EN</span>
            </label>

            <label class="cursor-pointer border-2 rounded-xl p-4 transition-all flex items-center justify-between ${
              currentLang === 'so' ? 'border-blue-600 bg-blue-50/50 shadow-xs' : 'border-slate-200 hover:border-slate-300 bg-white'
            }">
              <div class="flex items-center gap-3">
                <input type="radio" name="systemLanguage" value="so" ${currentLang === 'so' ? 'checked' : ''} class="lang-radio text-blue-600 focus:ring-blue-500" />
                <div>
                  <div class="font-bold text-slate-900 text-sm">Af-Soomaali</div>
                  <div class="text-[11px] text-slate-500">Somali (SO) · LTR</div>
                </div>
              </div>
              <span class="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">SO</span>
            </label>

            <label class="cursor-pointer border-2 rounded-xl p-4 transition-all flex items-center justify-between ${
              currentLang === 'ar' ? 'border-blue-600 bg-blue-50/50 shadow-xs' : 'border-slate-200 hover:border-slate-300 bg-white'
            }">
              <div class="flex items-center gap-3">
                <input type="radio" name="systemLanguage" value="ar" ${currentLang === 'ar' ? 'checked' : ''} class="lang-radio text-blue-600 focus:ring-blue-500" />
                <div>
                  <div class="font-bold text-slate-900 text-sm">العربية</div>
                  <div class="text-[11px] text-slate-500">Arabic (AR) · RTL</div>
                </div>
              </div>
              <span class="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">AR</span>
            </label>
          </div>
        </div>

        <!-- Master Settings Form -->
        <form id="settings-form" class="space-y-6">
          <!-- Section 1: Institution Profile & Official Logo -->
          <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <h3 class="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
              ${Components.icon('school', 'w-4 h-4 text-blue-600')} ${I18n.t('settings.institutionProfile', 'Institution Profile & Contact')}
            </h3>

            <!-- Official Institution Logo Preview -->
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div class="flex items-center gap-4">
                ${Components.getLogoHtml('w-16 h-16')}
                <div>
                  <span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-900 text-amber-300 border border-amber-400/50 mb-1">
                    Official Institution Emblem
                  </span>
                  <h4 class="text-sm font-bold text-slate-900">MADARASATUL AL-IMAAM</h4>
                  <p class="text-xs text-slate-500 mt-0.5">
                    Displayed cleanly across Login, Sidebars, Scorecards, Payment Receipts, and Official Printed Reports.
                  </p>
                </div>
              </div>
              <span class="text-[11px] font-mono text-slate-500 shrink-0">AL-IMAAMA · Active Logo</span>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label class="block font-semibold text-slate-700 mb-1">Institution Name <span class="text-rose-500">*</span></label>
                <input
                  type="text"
                  name="institutionName"
                  required
                  value="${settings.institutionName}"
                  class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-medium text-slate-900"
                />
              </div>

              <div>
                <label class="block font-semibold text-slate-700 mb-1">Campus Physical Address</label>
                <input
                  type="text"
                  name="address"
                  value="${settings.address}"
                  class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-medium text-slate-900"
                />
              </div>

              <div>
                <label class="block font-semibold text-slate-700 mb-1">Bursar / Contact Phone</label>
                <input
                  type="tel"
                  name="contactPhone"
                  value="${settings.contactPhone}"
                  class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-mono text-slate-900"
                />
              </div>

              <div>
                <label class="block font-semibold text-slate-700 mb-1">Official Contact Email</label>
                <input
                  type="email"
                  name="contactEmail"
                  value="${settings.contactEmail}"
                  class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-mono text-slate-900"
                />
              </div>
            </div>
          </div>

          <!-- Section 2: Academic Calendar, Exam Types & Curriculum Overview -->
          <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <h3 class="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
              ${Components.icon('calendar', 'w-4 h-4 text-blue-600')} ${I18n.t('settings.academicCalendar', 'Academic Calendar & Ranking Formula')}
            </h3>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label class="block font-semibold text-slate-700 mb-1">Active Academic Year</label>
                <input
                  type="text"
                  name="academicYear"
                  value="${settings.academicYear}"
                  class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-medium text-slate-900"
                />
              </div>

              <div>
                <label class="block font-semibold text-slate-700 mb-1">Active Term</label>
                <select name="currentTerm" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-medium text-slate-900">
                  <option value="Term 1" ${settings.currentTerm === 'Term 1' ? 'selected' : ''}>Term 1</option>
                  <option value="Term 2" ${settings.currentTerm === 'Term 2' ? 'selected' : ''}>Term 2</option>
                  <option value="Term 3" ${settings.currentTerm === 'Term 3' ? 'selected' : ''}>Term 3</option>
                </select>
              </div>

              <div>
                <label class="block font-semibold text-slate-700 mb-1">Result Calculation Method</label>
                <select name="resultCalcMethod" id="calc-method-select" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-semibold text-blue-700">
                  <option value="sum" ${settings.resultCalcMethod === 'sum' ? 'selected' : ''}>Simple Sum (Midterm + Final)</option>
                  <option value="average" ${settings.resultCalcMethod === 'average' ? 'selected' : ''}>Equal 50/50 Average</option>
                  <option value="weighted" ${settings.resultCalcMethod === 'weighted' ? 'selected' : ''}>Weighted Formula</option>
                </select>
              </div>
            </div>

            <!-- Weighted Sliders if Weighted selected -->
            <div id="weighted-options" class="p-3 bg-blue-50/50 border border-blue-100 rounded-lg text-xs ${settings.resultCalcMethod === 'weighted' ? '' : 'hidden'}">
              <span class="font-semibold text-slate-800 block mb-2">Configure Result Weights:</span>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="text-slate-600 block mb-1">Midterm Weight (%):</label>
                  <input type="number" name="weightedMidterm" min="0" max="100" value="${settings.weightedMidterm || 40}" class="w-full px-3 py-1.5 border border-slate-200 rounded bg-white font-mono"/>
                </div>
                <div>
                  <label class="text-slate-600 block mb-1">Final Exam Weight (%):</label>
                  <input type="number" name="weightedFinal" min="0" max="100" value="${settings.weightedFinal || 60}" class="w-full px-3 py-1.5 border border-slate-200 rounded bg-white font-mono"/>
                </div>
              </div>
            </div>

            <!-- Academic Curriculum Configuration Overview -->
            <div class="pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div class="flex items-center justify-between">
                  <span class="font-bold text-slate-800">Class Configuration</span>
                  <a href="#classes" class="text-[11px] font-semibold text-blue-600 hover:underline">Manage →</a>
                </div>
                <p class="text-slate-600"><strong class="text-slate-900 tabular-nums">${classes.length}</strong> active classrooms configured</p>
                <div class="flex flex-wrap gap-1">
                  ${classes.slice(0, 6).map(c => `<span class="px-2 py-0.5 bg-white border border-slate-200 rounded text-[11px] text-slate-700 font-medium">${c.name}</span>`).join('')}
                  ${classes.length > 6 ? `<span class="text-[11px] text-slate-400">+${classes.length - 6} more</span>` : ''}
                </div>
              </div>

              <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div class="flex items-center justify-between">
                  <span class="font-bold text-slate-800">Subject Max Marks</span>
                  <a href="#subjects" class="text-[11px] font-semibold text-blue-600 hover:underline">Configure →</a>
                </div>
                <p class="text-slate-600"><strong class="text-slate-900 tabular-nums">${subjects.length}</strong> curriculum subjects active</p>
                <div class="max-h-20 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                  ${subjects.slice(0, 6).map(sub => {
                    const cls = classes.find(c => c.id === sub.classId);
                    return `
                      <div class="flex items-center justify-between text-[11px] text-slate-600">
                        <span class="truncate">${sub.name} (${cls ? cls.name : '—'})</span>
                        <span class="font-mono font-bold text-slate-800 shrink-0">${sub.maxMarks} pts</span>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>

              <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div class="flex items-center justify-between">
                  <span class="font-bold text-slate-800">Examination Types</span>
                  <a href="#examinations" class="text-[11px] font-semibold text-blue-600 hover:underline">Marks Sheet →</a>
                </div>
                <ul class="space-y-1.5 text-[11px] text-slate-700">
                  <li class="flex items-center justify-between bg-white px-2.5 py-1 rounded border border-slate-200">
                    <span class="font-semibold">Midterm Examination</span>
                    <span class="text-emerald-600 font-bold">Active</span>
                  </li>
                  <li class="flex items-center justify-between bg-white px-2.5 py-1 rounded border border-slate-200">
                    <span class="font-semibold">Final Examination</span>
                    <span class="text-emerald-600 font-bold">Active (Required for Promotion)</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <!-- Section 3: Fee Rates & Currency Configuration -->
          <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <h3 class="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
              ${Components.icon('wallet', 'w-4 h-4 text-blue-600')} ${I18n.t('settings.tuitionCurrency', 'Tuition Fees & Currency Format')}
            </h3>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label class="block font-semibold text-slate-700 mb-1">Monthly Class Fee Rate</label>
                <div class="relative">
                  <input
                    type="number"
                    name="classFeeMonthly"
                    step="1"
                    required
                    value="${settings.classFeeMonthly}"
                    class="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-mono font-bold text-slate-900"
                  />
                  <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 font-bold">
                    ${settings.currencySymbol || '$'}
                  </span>
                </div>
              </div>

              <div>
                <label class="block font-semibold text-slate-700 mb-1">Monthly School Fee Rate</label>
                <div class="relative">
                  <input
                    type="number"
                    name="schoolFeeMonthly"
                    step="1"
                    required
                    value="${settings.schoolFeeMonthly}"
                    class="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-mono font-bold text-slate-900"
                  />
                  <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 font-bold">
                    ${settings.currencySymbol || '$'}
                  </span>
                </div>
              </div>

              <div>
                <label class="block font-semibold text-slate-700 mb-1">Currency Symbol</label>
                <select name="currencySymbol" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-bold text-slate-900 font-mono">
                  <option value="$" ${settings.currencySymbol === '$' ? 'selected' : ''}>USD ($) - Standard</option>
                  <option value="Sh" ${settings.currencySymbol === 'Sh' ? 'selected' : ''}>SOS (Sh) - Somali Shillings</option>
                  <option value="€" ${settings.currencySymbol === '€' ? 'selected' : ''}>EUR (€)</option>
                  <option value="£" ${settings.currencySymbol === '£' ? 'selected' : ''}>GBP (£)</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Section 4: My Profile & Password -->
          <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <h3 class="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
              ${Components.icon('lock', 'w-4 h-4 text-blue-600')} ${I18n.t('settings.accountSecurity', 'Account Security & Change Password')}
            </h3>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label class="block font-semibold text-slate-700 mb-1">Your Full Name</label>
                <input
                  type="text"
                  name="userName"
                  value="${currentUser ? currentUser.fullName : ''}"
                  class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 text-slate-900 font-medium"
                />
              </div>

              <div>
                <label class="block font-semibold text-slate-700 mb-1">New Password (leave blank to keep current)</label>
                <input
                  type="password"
                  name="newPassword"
                  placeholder="Enter new password"
                  class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 text-slate-900"
                />
              </div>
            </div>
          </div>

          <!-- Save Button -->
          <div class="flex items-center justify-end">
            <button type="submit" class="flex items-center gap-1.5 px-6 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors">
              ${Components.icon('check', 'w-4 h-4')} ${I18n.t('settings.saveBtn', 'Save System Preferences')}
            </button>
          </div>
        </form>

        <!-- Section 5: User Permissions & Access Matrix -->
        <div id="settings-permissions-section" class="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div class="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 class="text-sm font-bold text-slate-900 flex items-center gap-2">
                ${Components.icon('sliders', 'w-4 h-4 text-blue-600')} ${I18n.t('settings.permissionsTitle', 'User Permissions & Access Matrix')}
              </h3>
              <p class="text-xs text-slate-500 mt-0.5">
                ${I18n.t('settings.permissionsSub', 'Configure module permissions (View, Add, Edit, Delete, Import, Print, Export) per user. Teacher financial restrictions remain strictly enforced.')}
              </p>
            </div>
            <span class="text-xs font-semibold px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 shrink-0">${users.length} Users</span>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                <tr>
                  <th class="py-3 px-4">User Name</th>
                  <th class="py-3 px-4">Email Address</th>
                  <th class="py-3 px-4 text-center">Role</th>
                  <th class="py-3 px-4 text-center">Status</th>
                  <th class="py-3 px-4">Assigned Permissions Summary</th>
                  <th class="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200">
                ${users.map(u => {
                  const isSuperAdmin = u.id === 'usr-1' && u.role === 'ADMIN';
                  const summary = Permissions.summarizeUserPermissions(u);
                  return `
                    <tr class="hover:bg-slate-50/70 transition-colors">
                      <td class="py-3 px-4 font-bold text-slate-900">
                        ${u.fullName}
                        ${isSuperAdmin ? '<span class="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">Primary</span>' : ''}
                      </td>
                      <td class="py-3 px-4 font-mono text-slate-600">${u.email}</td>
                      <td class="py-3 px-4 text-center">
                        <span class="inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${u.role === 'ADMIN' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-slate-100 text-slate-700 border border-slate-200'}">
                          ${u.role}
                        </span>
                      </td>
                      <td class="py-3 px-4 text-center">
                        <span class="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold ${(u.status || 'Active') === 'Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}">
                          ${u.status || 'Active'}
                        </span>
                      </td>
                      <td class="py-3 px-4 text-slate-600 max-w-xs">${summary}</td>
                      <td class="py-3 px-4 text-right">
                        <button
                          type="button"
                          class="edit-user-perms-btn inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
                          data-user-id="${u.id}"
                        >
                          ${Components.icon('shield-check', 'w-3.5 h-3.5')} Edit Permissions
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Section 6: Complete Project Download (ZIP) -->
        <div class="bg-blue-50/60 p-6 rounded-xl border border-blue-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div class="space-y-1">
            <h3 class="text-sm font-bold text-blue-900 flex items-center gap-2">
              ${Components.icon('download', 'w-4 h-4 text-blue-600')} Complete Project Source Download (ZIP)
            </h3>
            <p class="text-xs text-slate-600 max-w-2xl leading-relaxed">
              Package and download the complete <strong>AL-IMAAMA</strong> source code (HTML, CSS, JavaScript modules, official <strong>MADARASATUL AL-IMAAM</strong> logo, Vite &amp; package manifests, <code class="px-1 py-0.5 bg-white border border-slate-200 rounded text-[11px]">.env.example</code>, and <code class="px-1 py-0.5 bg-white border border-slate-200 rounded text-[11px]">README.md</code> setup guide) as <code class="px-1 py-0.5 bg-white border border-slate-200 rounded text-[11px]">AL-IMAAMA-Complete-Project.zip</code>. Private <code class="px-1 py-0.5 bg-white border border-slate-200 rounded text-[11px]">.env</code> secrets, credentials, <code class="px-1 py-0.5 bg-white border border-slate-200 rounded text-[11px]">node_modules</code>, and cache files are automatically excluded.
            </p>
          </div>
          <button id="download-project-zip-btn" type="button" class="shrink-0 flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 border border-amber-400/50 rounded-lg shadow-sm transition-colors">
            ${Components.icon('download', 'w-4 h-4 text-amber-300')} Download Complete Project (ZIP)
          </button>
        </div>

        <!-- Danger Zone: Reset Demo Data -->
        <div class="bg-rose-50/50 p-6 rounded-xl border border-rose-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 class="text-sm font-bold text-rose-900 flex items-center gap-2">
              ${Components.icon('alert-circle', 'w-4 h-4 text-rose-600')} ${I18n.t('settings.resetDemoData', 'Reset Demo Data')}
            </h3>
            <p class="text-xs text-rose-700 mt-1 max-w-xl">
              ${I18n.t('settings.resetNotice', 'Restore the factory sample dataset. Requires explicit confirmation.')}
            </p>
          </div>
          <button id="reset-demo-btn" type="button" class="shrink-0 flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition-colors">
            ${Components.icon('refresh-cw', 'w-4 h-4')} ${I18n.t('settings.resetDemoData', 'Reset Demo Data')}
          </button>
        </div>
      </div>
    `;

    this.bindEvents(container);
  },

  openPermissionsModal(userId, container) {
    const users = Data.getUsers();
    const targetUser = users.find(u => u.id === userId);
    if (!targetUser) return;

    const isSuperAdmin = targetUser.id === 'usr-1' && targetUser.role === 'ADMIN';
    const isTeacher = targetUser.role === 'TEACHER';
    const currentPerms = Permissions.getUserPermissions(targetUser);

    const isTeacherRestrictedCell = (modId, actId) => {
      if (!isTeacher) return false;
      if (modId === 'payments') return true;
      if (modId === 'students' && ['add', 'edit', 'delete', 'import'].includes(actId)) return true;
      if (modId === 'attendance' && actId === 'delete') return true;
      if (modId === 'examinations' && actId === 'delete') return true;
      return false;
    };

    const content = `
      <form id="user-permissions-form" class="space-y-4 text-xs">
        <div class="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-200">
          <div>
            <h4 class="text-sm font-bold text-slate-900">${targetUser.fullName}</h4>
            <p class="text-slate-500 font-mono">${targetUser.email} · <span class="font-sans font-bold text-blue-700">${targetUser.role}</span></p>
          </div>
          ${!isSuperAdmin ? `
            <button type="button" id="reset-role-defaults-btn" class="px-3 py-1.5 text-[11px] font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100">
              Reset to Role Defaults
            </button>
          ` : ''}
        </div>

        ${isTeacher ? `
          <div class="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2">
            <span class="shrink-0 mt-0.5">${Components.icon('info', 'w-4 h-4 text-amber-600')}</span>
            <span><strong>Teacher Safety Ceiling Active:</strong> Financial modules (Payments/Income/Expenses) and Student Add/Edit/Delete/Import or Record Deletion controls remain locked for Teacher accounts.</span>
          </div>
        ` : ''}

        ${isSuperAdmin ? `
          <div class="p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 flex items-start gap-2">
            <span class="shrink-0 mt-0.5">${Components.icon('shield-check', 'w-4 h-4 text-blue-600')}</span>
            <span><strong>Primary Super Admin Safeguard:</strong> Full system privileges remain permanently active for the primary administrator account.</span>
          </div>
        ` : ''}

        <div class="overflow-x-auto border border-slate-200 rounded-xl">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-100 text-slate-800 font-bold border-b border-slate-200">
              <tr>
                <th class="py-2.5 px-3">Module</th>
                ${PERMISSION_ACTIONS.map(act => `
                  <th class="py-2.5 px-2 text-center">${I18n.t(act.labelKey, act.label)}</th>
                `).join('')}
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200">
              ${PERMISSION_MODULES.map(mod => `
                <tr class="hover:bg-slate-50/70">
                  <td class="py-2.5 px-3 font-semibold text-slate-900 whitespace-nowrap">${I18n.t(mod.labelKey, mod.label)}</td>
                  ${PERMISSION_ACTIONS.map(act => {
                    const checked = !!(currentPerms[mod.id] && currentPerms[mod.id][act.id]);
                    const locked = isSuperAdmin || isTeacherRestrictedCell(mod.id, act.id);
                    return `
                      <td class="py-2.5 px-2 text-center">
                        <input
                          type="checkbox"
                          class="perm-checkbox w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600 ${locked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}"
                          data-module="${mod.id}"
                          data-action="${act.id}"
                          ${checked ? 'checked' : ''}
                          ${locked ? 'disabled' : ''}
                        />
                      </td>
                    `;
                  }).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <button type="button" id="perms-cancel-btn" class="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
          ${!isSuperAdmin ? `
            <button type="submit" class="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm">
              Save Permissions
            </button>
          ` : ''}
        </div>
      </form>
    `;

    Components.openModal(content, `Edit Permissions: ${targetUser.fullName}`, { maxWidth: 'max-w-3xl' });

    const cancelBtn = document.getElementById('perms-cancel-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', () => Components.closeModal());

    const defaultsBtn = document.getElementById('reset-role-defaults-btn');
    if (defaultsBtn) {
      defaultsBtn.addEventListener('click', () => {
        const def = Permissions.getDefaultPermissions(targetUser.role);
        document.querySelectorAll('#user-permissions-form .perm-checkbox').forEach(cb => {
          const m = cb.dataset.module;
          const a = cb.dataset.action;
          if (!cb.disabled) {
            cb.checked = !!(def[m] && def[m][a]);
          }
        });
        Components.showToast(`Reset checkboxes to ${targetUser.role} defaults. Click Save Permissions to apply.`, 'info', 2500);
      });
    }

    const permsForm = document.getElementById('user-permissions-form');
    if (permsForm && !isSuperAdmin) {
      permsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const updatedPerms = {};
        PERMISSION_MODULES.forEach(mod => {
          updatedPerms[mod.id] = {};
          PERMISSION_ACTIONS.forEach(act => {
            const cb = permsForm.querySelector(`.perm-checkbox[data-module="${mod.id}"][data-action="${act.id}"]`);
            updatedPerms[mod.id][act.id] = cb ? cb.checked : false;
          });
        });

        Data.updateUser(targetUser.id, { ...targetUser, permissions: updatedPerms });
        Components.closeModal();
        Components.showToast(`Permissions updated for ${targetUser.fullName}.`, 'success');

        const activeSession = Auth.getCurrentUser();
        if (activeSession && activeSession.id === targetUser.id) {
          const shell = document.getElementById('app-shell-container');
          if (shell) shell.remove();
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        } else {
          this.render(container);
        }
      });
    }
  },

  bindEvents(container) {
    // Language radio buttons switcher
    const langRadios = container.querySelectorAll('.lang-radio');
    langRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.checked) {
          I18n.setLanguage(e.target.value);
        }
      });
    });

    const calcSelect = container.querySelector('#calc-method-select');
    const weightedOptions = container.querySelector('#weighted-options');
    if (calcSelect && weightedOptions) {
      calcSelect.addEventListener('change', (e) => {
        if (e.target.value === 'weighted') {
          weightedOptions.classList.remove('hidden');
        } else {
          weightedOptions.classList.add('hidden');
        }
      });
    }

    const form = container.querySelector('#settings-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(form);

        const updatedSettings = {
          institutionName: formData.get('institutionName'),
          address: formData.get('address'),
          contactPhone: formData.get('contactPhone'),
          contactEmail: formData.get('contactEmail'),
          academicYear: formData.get('academicYear'),
          currentTerm: formData.get('currentTerm'),
          resultCalcMethod: formData.get('resultCalcMethod'),
          weightedMidterm: parseFloat(formData.get('weightedMidterm')) || 40,
          weightedFinal: parseFloat(formData.get('weightedFinal')) || 60,
          classFeeMonthly: parseFloat(formData.get('classFeeMonthly')) || 45,
          schoolFeeMonthly: parseFloat(formData.get('schoolFeeMonthly')) || 35,
          currencySymbol: formData.get('currencySymbol') || '$'
        };

        Data.updateSettings(updatedSettings);

        const currentUser = Auth.getCurrentUser();
        const newPass = formData.get('newPassword');
        const newName = formData.get('userName');
        if (currentUser) {
          const userObj = Data.getUserByEmail(currentUser.email);
          if (userObj) {
            userObj.fullName = newName || userObj.fullName;
            if (newPass && newPass.trim().length > 0) {
              userObj.password = newPass.trim();
            }
            Data.updateUser(userObj.id, userObj);
            currentUser.fullName = userObj.fullName;
            Storage.set(Storage.KEYS.SESSION, currentUser);
          }
        }

        Components.showToast('System preferences saved successfully.', 'success');
        this.render(container);
      });
    }

    container.querySelectorAll('.edit-user-perms-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.openPermissionsModal(btn.dataset.userId, container);
      });
    });

    const downloadZipBtn = container.querySelector('#download-project-zip-btn');
    if (downloadZipBtn) {
      downloadZipBtn.addEventListener('click', async () => {
        if (!Permissions.isAdmin(Auth.getCurrentUser())) return;
        await Components.downloadProjectZip(downloadZipBtn);
      });
    }

    const resetBtn = container.querySelector('#reset-demo-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        Components.confirmDialog({
          title: 'Confirm Reset Demo Data',
          message: 'Are you sure you want to restore the demonstration school dataset? All newly added students, examination marks, and payment entries will be reset to factory sample data.',
          confirmText: 'Yes, Reset Demo Data',
          isDestructive: true,
          onConfirm: () => {
            Storage.resetToSeed();
            Components.showToast('Demo dataset restored to factory defaults.', 'success', 4000);
            window.location.hash = '#dashboard';
            window.location.reload();
          }
        });
      });
    }
  }
};
