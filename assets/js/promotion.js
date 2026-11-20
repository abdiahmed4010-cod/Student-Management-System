/**
 * AL-IMAAMA - Student Promotion Module (ADMIN-ONLY)
 * Enforces rule: Promotion is available ONLY after the Final Examination has been registered.
 * Preserves all historical attendance, exam marks, and payment records.
 */

import { Data } from './data.js';
import { Auth } from './auth.js';
import { Permissions } from './permissions.js';
import { Components } from './components.js';

let selectedSourceClassId = '';
let selectedDestClassId = '';
let selectedAcademicYear = '2026-2027';
let selectedTerm = 'Term 1';
let selectedStudentIds = [];

export const PromotionView = {
  render(container) {
    const user = Auth.getCurrentUser();
    if (!Permissions.isAdmin(user)) {
      container.innerHTML = `
        <div class="p-8 max-w-lg mx-auto text-center space-y-3">
          <div class="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            ${Components.icon('alert-circle', 'w-6 h-6')}
          </div>
          <h2 class="text-base font-bold text-slate-900">Access Restricted</h2>
          <p class="text-xs text-slate-500">Student promotion operations are strictly restricted to administrators.</p>
        </div>
      `;
      return;
    }

    const classes = Data.getClasses();
    if (!selectedSourceClassId && classes.length > 0) {
      selectedSourceClassId = classes[0].id;
    }

    // Default destination to next class in line
    const sourceIdx = classes.findIndex(c => c.id === selectedSourceClassId);
    if (!selectedDestClassId || selectedDestClassId === selectedSourceClassId) {
      selectedDestClassId = sourceIdx !== -1 && sourceIdx + 1 < classes.length ? classes[sourceIdx + 1].id : '';
    }

    const currentClass = classes.find(c => c.id === selectedSourceClassId);
    const destClass = classes.find(c => c.id === selectedDestClassId);
    const studentsInClass = selectedSourceClassId ? Data.getStudentsByClass(selectedSourceClassId) : [];

    // Check Final Exam registration rule!
    const eligibility = Data.checkPromotionEligibility(selectedSourceClassId, selectedAcademicYear, selectedTerm);
    const isEligible = eligibility.eligible;

    // Default select all students
    if (selectedStudentIds.length === 0 && studentsInClass.length > 0) {
      selectedStudentIds = studentsInClass.map(s => s.id);
    }

    const promotionHistory = Data.getPromotionHistory();

    container.innerHTML = `
      <div class="space-y-6">
        <!-- Module Header -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold tracking-tight text-slate-900">Academic Promotion & Grade Advancement</h1>
            <p class="text-sm text-slate-500 mt-1">Advance students to next academic tier following official Final Examination registration.</p>
          </div>
          <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 self-start sm:self-auto">
            ${Components.icon('shield-check', 'w-4 h-4')} Administrator Authority
          </span>
        </div>

        <!-- Class Selection & Verification Box -->
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">1. Select Current Class <span class="text-rose-500">*</span></label>
              <select id="promo-source-class" class="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-semibold text-slate-900">
                ${classes.map(c => `
                  <option value="${c.id}" ${selectedSourceClassId === c.id ? 'selected' : ''}>
                    ${c.name} (${Data.getStudentsByClass(c.id).length} students)
                  </option>
                `).join('')}
              </select>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">2. Select Destination Class <span class="text-rose-500">*</span></label>
              <select id="promo-dest-class" ${!isEligible ? 'disabled' : ''} class="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-semibold text-slate-900 ${!isEligible ? 'opacity-50 cursor-not-allowed' : ''}">
                <option value="">-- Choose Next Grade Level --</option>
                ${classes.filter(c => c.id !== selectedSourceClassId).map(c => `
                  <option value="${c.id}" ${selectedDestClassId === c.id ? 'selected' : ''}>
                    ${c.name} (${c.academicYear})
                  </option>
                `).join('')}
              </select>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Target Academic Year</label>
              <input 
                type="text" 
                id="promo-year-input" 
                value="${selectedAcademicYear}" 
                class="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 text-slate-800"
              />
            </div>
          </div>

          <!-- Eligibility Rule State Notice -->
          ${!isEligible ? `
            <div class="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-xs text-rose-900">
              <div class="shrink-0 text-rose-600 mt-0.5">${Components.icon('alert-circle', 'w-5 h-5')}</div>
              <div>
                <strong class="font-bold text-sm block">Final Examination has not been registered yet.</strong>
                <p class="mt-0.5 text-rose-700 leading-relaxed">
                  Academic promotion for <strong>${currentClass ? currentClass.name : 'this class'}</strong> is blocked. Under institutional policy, grade progression can only be verified after the Final Examination marks sheet has been completed and saved.
                </p>
              </div>
            </div>
          ` : `
            <div class="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3 text-xs text-emerald-900">
              <div class="shrink-0 text-emerald-600 mt-0.5">${Components.icon('check-circle', 'w-5 h-5')}</div>
              <div>
                <strong class="font-bold text-sm block">Final Examination Verified</strong>
                <p class="mt-0.5 text-emerald-700">
                  The Final Examination is registered for <strong>${currentClass ? currentClass.name : ''}</strong>. You may review the promotion roster below and advance students to <strong>${destClass ? destClass.name : 'the destination class'}</strong>.
                </p>
              </div>
            </div>
          `}
        </div>

        <!-- Student Promotion Review Table -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div class="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div>
              <h3 class="font-bold text-slate-900">Promotion Roster Review</h3>
              <p class="text-slate-500">Select which students will advance. All historical records remain fully preserved.</p>
            </div>
            
            ${isEligible && studentsInClass.length > 0 ? `
              <div class="flex items-center gap-3">
                <button id="toggle-all-promo-btn" class="text-blue-600 hover:underline font-semibold">
                  ${selectedStudentIds.length === studentsInClass.length ? 'Deselect All' : 'Select All'}
                </button>
                <button id="execute-promo-btn" class="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors">
                  ${Components.icon('trending-up', 'w-4 h-4')} Confirm Promotion (${selectedStudentIds.length})
                </button>
              </div>
            ` : ''}
          </div>

          <div class="overflow-x-auto custom-scrollbar">
            <table class="w-full text-left text-xs text-slate-600">
              <thead class="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th class="py-3 px-4 w-12 text-center">
                    <input type="checkbox" id="header-promo-check" ${selectedStudentIds.length === studentsInClass.length && studentsInClass.length > 0 ? 'checked' : ''} ${!isEligible ? 'disabled' : ''} class="rounded text-blue-600"/>
                  </th>
                  <th class="py-3 px-4">Student ID</th>
                  <th class="py-3 px-4">Full Name</th>
                  <th class="py-3 px-4">Current Class</th>
                  <th class="py-3 px-4">Destination Class</th>
                  <th class="py-3 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${studentsInClass.length > 0 ? studentsInClass.map(s => {
                  const isChecked = selectedStudentIds.includes(s.id);
                  return `
                    <tr class="hover:bg-slate-50 transition-colors">
                      <td class="py-3 px-4 text-center">
                        <input 
                          type="checkbox" 
                          class="student-promo-checkbox rounded text-blue-600" 
                          data-id="${s.id}" 
                          ${isChecked ? 'checked' : ''}
                          ${!isEligible ? 'disabled' : ''}
                        />
                      </td>
                      <td class="py-3 px-4 font-mono font-medium text-blue-600">${s.id}</td>
                      <td class="py-3 px-4 font-semibold text-slate-900">${s.fullName}</td>
                      <td class="py-3 px-4 text-slate-500">${currentClass ? currentClass.name : ''}</td>
                      <td class="py-3 px-4 font-semibold text-emerald-600">${destClass ? destClass.name : '—'}</td>
                      <td class="py-3 px-4 text-right">
                        <span class="inline-block px-2 py-0.5 rounded text-[11px] font-medium ${isEligible ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}">
                          ${isEligible ? 'Eligible for Advancement' : 'Final Exam Required'}
                        </span>
                      </td>
                    </tr>
                  `;
                }).join('') : `
                  <tr>
                    <td colspan="6" class="p-8 text-center text-slate-400">
                      No students enrolled in the selected source class.
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Historical Promotion Archive -->
        ${promotionHistory.length > 0 ? `
          <div class="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div class="p-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between text-xs">
              <span class="font-bold text-slate-900">Archived Promotion History</span>
              <span class="text-slate-500">${promotionHistory.length} recorded historical advancements</span>
            </div>
            <div class="overflow-x-auto custom-scrollbar">
              <table class="w-full text-left text-xs text-slate-600">
                <thead class="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th class="py-2.5 px-4">Student ID</th>
                    <th class="py-2.5 px-4">Student Name</th>
                    <th class="py-2.5 px-4">Previous Class</th>
                    <th class="py-2.5 px-4">Advanced To</th>
                    <th class="py-2.5 px-4">Academic Year</th>
                    <th class="py-2.5 px-4">Date</th>
                    <th class="py-2.5 px-4">Authorized By</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  ${promotionHistory.map(p => {
                    const student = Data.getStudentById(p.studentId);
                    const prevC = classes.find(c => c.id === p.previousClassId);
                    const newC = classes.find(c => c.id === p.newClassId);
                    return `
                      <tr>
                        <td class="py-2.5 px-4 font-mono font-medium text-blue-600">${p.studentId}</td>
                        <td class="py-2.5 px-4 font-semibold text-slate-900">${student ? student.fullName : '—'}</td>
                        <td class="py-2.5 px-4 text-slate-500">${prevC ? prevC.name : p.previousClassId}</td>
                        <td class="py-2.5 px-4 font-semibold text-emerald-600">${newC ? newC.name : p.newClassId}</td>
                        <td class="py-2.5 px-4 font-mono">${p.academicYear}</td>
                        <td class="py-2.5 px-4 tabular-nums">${p.promotedDate}</td>
                        <td class="py-2.5 px-4 text-slate-500">${p.promotedBy}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        ` : ''}
      </div>
    `;

    this.bindEvents(container, currentClass, destClass, studentsInClass, isEligible);
  },

  bindEvents(container, currentClass, destClass, studentsInClass, isEligible) {
    const sourceSelect = container.querySelector('#promo-source-class');
    if (sourceSelect) {
      sourceSelect.addEventListener('change', (e) => {
        selectedSourceClassId = e.target.value;
        selectedStudentIds = [];
        this.render(container);
      });
    }

    const destSelect = container.querySelector('#promo-dest-class');
    if (destSelect) {
      destSelect.addEventListener('change', (e) => {
        selectedDestClassId = e.target.value;
        this.render(container);
      });
    }

    const yearInput = container.querySelector('#promo-year-input');
    if (yearInput) {
      yearInput.addEventListener('change', (e) => {
        selectedAcademicYear = e.target.value;
        this.render(container);
      });
    }

    // Checkbox toggling
    const headerCheck = container.querySelector('#header-promo-check');
    if (headerCheck) {
      headerCheck.addEventListener('change', (e) => {
        if (e.target.checked) {
          selectedStudentIds = studentsInClass.map(s => s.id);
        } else {
          selectedStudentIds = [];
        }
        this.render(container);
      });
    }

    const toggleBtn = container.querySelector('#toggle-all-promo-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        if (selectedStudentIds.length === studentsInClass.length) {
          selectedStudentIds = [];
        } else {
          selectedStudentIds = studentsInClass.map(s => s.id);
        }
        this.render(container);
      });
    }

    container.querySelectorAll('.student-promo-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.id;
        if (cb.checked) {
          if (!selectedStudentIds.includes(id)) selectedStudentIds.push(id);
        } else {
          selectedStudentIds = selectedStudentIds.filter(x => x !== id);
        }
      });
    });

    // Execute Promotion
    const promoBtn = container.querySelector('#execute-promo-btn');
    if (promoBtn) {
      promoBtn.addEventListener('click', () => {
        if (!selectedDestClassId) {
          Components.showToast('Please select a destination class.', 'warning');
          return;
        }

        if (selectedStudentIds.length === 0) {
          Components.showToast('Please select at least one student to promote.', 'warning');
          return;
        }

        Components.confirmDialog({
          title: 'Confirm Student Promotion',
          message: `Are you sure you want to promote <strong>${selectedStudentIds.length} students</strong> from <strong>${currentClass.name}</strong> to <strong>${destClass.name}</strong>? All historical academic, attendance, and financial records will be preserved.`,
          confirmText: 'Execute Promotion',
          onConfirm: () => {
            const user = Auth.getCurrentUser();
            const res = Data.promoteStudents(
              selectedStudentIds,
              selectedSourceClassId,
              selectedDestClassId,
              selectedAcademicYear,
              user ? user.fullName : 'Chief Administrator'
            );

            if (res.success) {
              Components.showToast(`Successfully promoted ${res.count} students to ${destClass.name}!`, 'success', 4000);
              selectedStudentIds = [];
              this.render(container);
            }
          }
        });
      });
    }
  }
};
