/**
 * AL-IMAAMA - Examinations & Marks Entry Spreadsheet
 * High-density Excel-like grid with dynamic subject columns, optional Activity, auto totals, and keyboard navigation.
 */

import { Data } from './data.js';
import { Auth } from './auth.js';
import { Permissions } from './permissions.js';
import { Components } from './components.js';
import { I18n } from './i18n.js';

let currentClassId = '';
let currentExamType = 'Midterm'; // 'Midterm' or 'Final'
let currentAcademicYear = '2026-2027';
let currentTerm = 'Term 1';
let currentSubjectFilter = '';
let spreadsheetSearch = '';
let marksState = {}; // { [studentId]: { [subId]: number, activity: number|null, total: number } }
let hasUnsavedChanges = false;

export const ExaminationsView = {
  selectClass(classId) {
    const user = Auth.getCurrentUser();
    if (user && !Permissions.canAccessClassMarks(user, classId)) {
      Components.showToast('Access denied: This class or its subjects are not assigned to your teaching profile.', 'warning', 3500);
      return false;
    }
    currentClassId = classId;
    currentSubjectFilter = '';
    marksState = {};
    hasUnsavedChanges = false;
    return true;
  },

  selectSubject(subjectId) {
    if (!subjectId) {
      currentSubjectFilter = '';
      marksState = {};
      hasUnsavedChanges = false;
      return true;
    }
    const user = Auth.getCurrentUser();
    if (user && !Permissions.canAccessSubjectMarks(user, currentClassId, subjectId)) {
      Components.showToast('Access denied: This subject is not assigned to your teaching profile.', 'warning', 3500);
      return false;
    }
    currentSubjectFilter = subjectId;
    marksState = {};
    hasUnsavedChanges = false;
    return true;
  },

  render(container) {
    const user = Auth.getCurrentUser();
    if (!Permissions.hasPermission(user, 'examinations', 'view')) {
      container.innerHTML = `
        <div class="p-8 max-w-lg mx-auto text-center space-y-3 bg-white rounded-xl border border-slate-200 shadow-xs">
          <div class="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            ${Components.icon('lock', 'w-6 h-6')}
          </div>
          <h2 class="text-base font-bold text-slate-900">Access Restricted</h2>
          <p class="text-xs text-slate-500">Your account does not currently have permission to view examination marks.</p>
        </div>
      `;
      return;
    }

    const isAdmin = Permissions.isAdmin(user);
    const classes = Data.getClasses();

    // Determine classes available to user (teachers require BOTH assigned class AND >=1 assigned subject in that class)
    let availableClasses = classes;
    if (!isAdmin) {
      availableClasses = classes.filter(c => Permissions.canAccessClassMarks(user, c.id));
    }

    if (!isAdmin && availableClasses.length === 0) {
      container.innerHTML = `
        <div class="p-8 max-w-lg mx-auto text-center space-y-3 bg-white rounded-xl border border-slate-200 shadow-xs">
          <div class="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
            ${Components.icon('book-open', 'w-6 h-6')}
          </div>
          <h2 class="text-base font-bold text-slate-900">No Assigned Subjects for Marks Entry</h2>
          <p class="text-xs text-slate-500">You do not currently have any classes and subjects assigned for examination grading. Please contact the school administrator.</p>
        </div>
      `;
      return;
    }

    if (!currentClassId && availableClasses.length > 0) {
      currentClassId = availableClasses[0].id;
    } else if (availableClasses.length > 0 && !availableClasses.some(c => c.id === currentClassId)) {
      currentClassId = availableClasses[0].id;
    }

    const currentClass = classes.find(c => c.id === currentClassId);
    const allClassSubjects = currentClassId ? Data.getSubjectsByClass(currentClassId) : [];
    let scopedSubjects = allClassSubjects;

    // For teachers, display ONLY subjects officially assigned to them in that class
    if (!isAdmin) {
      const assignedSubs = Permissions.getTeacherAssignedSubjectIds(user);
      scopedSubjects = allClassSubjects.filter(s => assignedSubs.includes(s.id));
    }

    if (currentSubjectFilter && !scopedSubjects.some(s => s.id === currentSubjectFilter)) {
      currentSubjectFilter = '';
    }
    const subjects = currentSubjectFilter ? scopedSubjects.filter(s => s.id === currentSubjectFilter) : scopedSubjects;

    const canSaveMarks =
      (Permissions.hasPermission(user, 'examinations', 'add') || Permissions.hasPermission(user, 'examinations', 'edit')) &&
      (isAdmin || Permissions.canAccessClassMarks(user, currentClassId)) &&
      subjects.length > 0;

    // Only load students belonging to the validated class
    let students = currentClassId && (isAdmin || Permissions.canAccessClassMarks(user, currentClassId))
      ? Data.getStudentsByClass(currentClassId)
      : [];

    // Filter students by local search if provided
    if (spreadsheetSearch) {
      const q = spreadsheetSearch.toLowerCase();
      students = students.filter(s => s.fullName.toLowerCase().includes(q) || s.id.toLowerCase().includes(q));
    }

    // Load or initialize examination record (strictly passes requesting user for backend-style data isolation)
    this.syncMarksState(currentClassId, currentExamType, currentAcademicYear, currentTerm, subjects, students, isAdmin, user);

    container.innerHTML = `
      <div class="space-y-6">
        <!-- Module Header -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div class="flex items-center gap-3">
              <h1 class="text-2xl font-bold tracking-tight text-slate-900">${I18n.t('examinations.title')}</h1>
              ${hasUnsavedChanges ? `
                <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                  <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span> ${I18n.t('examinations.unsavedBadge')}
                </span>
              ` : `
                <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> ${I18n.t('examinations.savedBadge')}
                </span>
              `}
            </div>
            <p class="text-sm text-slate-500 mt-1">${isAdmin ? I18n.t('examinations.sub') : 'Enter and manage examination marks strictly for your assigned subjects and classes.'}</p>
          </div>

          <div class="flex items-center gap-2">
            ${canSaveMarks ? `
              <button id="save-marks-btn" class="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors">
                ${Components.icon('check-circle', 'w-4 h-4')} ${I18n.t('examinations.saveMarks')}
              </button>
            ` : ''}
          </div>
        </div>

        <!-- Filter Bar -->
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div class="flex flex-wrap items-center gap-3">
            <div>
              <label class="block text-[11px] font-semibold text-slate-500 mb-1">${I18n.t('examinations.classLabel')}</label>
              <select id="exam-class-select" class="py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-semibold text-slate-800">
                ${availableClasses.map(c => `
                  <option value="${c.id}" ${currentClassId === c.id ? 'selected' : ''}>
                    ${c.name}
                  </option>
                `).join('')}
              </select>
            </div>

            <div>
              <label class="block text-[11px] font-semibold text-slate-500 mb-1">${I18n.t('nav.subjects', 'Subject')}:</label>
              <select id="exam-subject-select" class="py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-medium text-slate-800">
                <option value="">${isAdmin ? `All Subjects (${scopedSubjects.length})` : `All My Assigned Subjects (${scopedSubjects.length})`}</option>
                ${scopedSubjects.map(sub => `
                  <option value="${sub.id}" ${currentSubjectFilter === sub.id ? 'selected' : ''}>${sub.name}</option>
                `).join('')}
              </select>
            </div>

            <div>
              <label class="block text-[11px] font-semibold text-slate-500 mb-1">${I18n.t('examinations.examType')}</label>
              <select id="exam-type-select" class="py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-semibold text-slate-800">
                <option value="Midterm" ${currentExamType === 'Midterm' ? 'selected' : ''}>${I18n.t('examinations.midterm')}</option>
                <option value="Final" ${currentExamType === 'Final' ? 'selected' : ''}>${I18n.t('examinations.final')}</option>
              </select>
            </div>

            <div>
              <label class="block text-[11px] font-semibold text-slate-500 mb-1">${I18n.t('examinations.academicYear')}</label>
              <input 
                type="text" 
                id="exam-year-input" 
                value="${currentAcademicYear}" 
                class="py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-medium text-slate-800 w-28"
              />
            </div>

            <div>
              <label class="block text-[11px] font-semibold text-slate-500 mb-1">${I18n.t('examinations.term')}</label>
              <select id="exam-term-select" class="py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-medium text-slate-800">
                <option value="Term 1" ${currentTerm === 'Term 1' ? 'selected' : ''}>Term 1</option>
                <option value="Term 2" ${currentTerm === 'Term 2' ? 'selected' : ''}>Term 2</option>
                <option value="Term 3" ${currentTerm === 'Term 3' ? 'selected' : ''}>Term 3</option>
              </select>
            </div>
          </div>

          <!-- In-sheet Search -->
          <div class="relative w-full sm:w-64">
            <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              ${Components.icon('search', 'w-3.5 h-3.5')}
            </span>
            <input 
              type="text" 
              id="sheet-search-input" 
              placeholder="${I18n.t('examinations.searchInSheet')}" 
              value="${spreadsheetSearch}"
              class="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 text-slate-800"
            />
          </div>
        </div>

        <!-- Spreadsheet Container -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div class="p-3 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <span>
              ${I18n.t('classes.title')}: <strong class="text-slate-900">${currentClass ? currentClass.name : ''}</strong> · 
              ${isAdmin ? I18n.t('classes.subjects') : 'Assigned Subjects'}: <strong class="text-slate-900">${subjects.length}</strong> · 
              ${I18n.t('nav.students')}: <strong class="text-slate-900">${students.length}</strong>
            </span>
            <span class="text-[11px] text-slate-400">Tip: Use Arrow keys or Enter/Tab to navigate cells smoothly.</span>
          </div>

          <div class="overflow-x-auto custom-scrollbar">
            <table class="w-full text-left text-xs text-slate-700 border-collapse" id="marks-table">
              <thead class="bg-slate-100/90 text-slate-800 font-semibold border-b border-slate-200">
                <tr>
                  <th class="py-3 px-3 w-12 text-center border-r border-slate-200">#</th>
                  <th class="py-3 px-3 w-28 border-r border-slate-200">${I18n.t('students.studentId')}</th>
                  <th class="py-3 px-4 min-w-[160px] border-r border-slate-200">${I18n.t('students.fullName')}</th>
                  
                  <!-- Dynamic Configured Subject Columns with Max Marks -->
                  ${subjects.map(sub => `
                    <th class="py-3 px-3 text-center min-w-[110px] border-r border-slate-200">
                      <div>${sub.name}</div>
                      <span class="text-[10px] text-slate-400 font-normal">${I18n.t('examinations.maxHeader')}: ${sub.maxMarks}</span>
                    </th>
                  `).join('')}

                  ${isAdmin ? `
                    <!-- Optional Activity Column (Admin Only) -->
                    <th class="py-3 px-3 text-center min-w-[90px] border-r border-slate-200 bg-blue-50/40">
                      <div class="text-blue-900">${I18n.t('examinations.activity')}</div>
                      <span class="text-[10px] text-blue-600/70 font-normal">${I18n.t('examinations.activityOptional')}</span>
                    </th>
                  ` : ''}

                  <!-- Total Column -->
                  <th class="py-3 px-4 text-right min-w-[100px] bg-slate-50 font-bold text-slate-900">
                    <div>${isAdmin ? I18n.t('examinations.total') : 'Assigned Total'}</div>
                    <span class="text-[10px] text-slate-400 font-normal">${I18n.t('examinations.autoSum')}</span>
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200">
                ${students.length > 0 ? students.map((s, rowIdx) => {
                  const studentMarks = marksState[s.id] || { activity: null, total: 0 };

                  return `
                    <tr class="hover:bg-slate-50/60 transition-colors" data-row="${rowIdx}">
                      <td class="py-2.5 px-3 text-center text-slate-400 tabular-nums border-r border-slate-200 bg-slate-50/30">${rowIdx + 1}</td>
                      <td class="py-2.5 px-3 font-mono font-medium text-blue-600 border-r border-slate-200">${s.id}</td>
                      <td class="py-2.5 px-4 font-semibold text-slate-900 border-r border-slate-200 truncate max-w-[200px]" title="${s.fullName}">
                        ${s.fullName}
                      </td>

                      <!-- Configured Subject Mark Inputs -->
                      ${subjects.map((sub, colIdx) => {
                        const score = studentMarks[sub.id] !== undefined && studentMarks[sub.id] !== null ? studentMarks[sub.id] : '';
                        const canEditSubject = canSaveMarks && Permissions.canEditSubjectMarks(user, currentClassId, sub.id);

                        return `
                          <td class="p-1 border-r border-slate-200 text-center relative group">
                            <input 
                              type="number" 
                              min="0" 
                              max="${sub.maxMarks}"
                              step="1"
                              placeholder="—"
                              value="${score}"
                              data-student-id="${s.id}"
                              data-subject-id="${sub.id}"
                              data-max="${sub.maxMarks}"
                              data-row="${rowIdx}"
                              data-col="${colIdx}"
                              ${!canEditSubject ? `disabled title="${I18n.t('examinations.onlyAssignedCanGrade')}"` : ''}
                              class="spreadsheet-cell mark-input w-full h-8 text-center text-xs font-semibold tabular-nums rounded border ${
                                !canEditSubject ? 'bg-slate-100 text-slate-400 cursor-not-allowed border-slate-200' : 'bg-white border-slate-200 text-slate-900 focus:border-blue-600'
                              }"
                            />
                            ${!canEditSubject ? `
                              <div class="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">
                                ${Components.icon('lock', 'w-3 h-3 text-slate-400')}
                              </div>
                            ` : ''}
                          </td>
                        `;
                      }).join('')}

                      ${isAdmin ? `
                        <!-- Optional Activity Input (Admin Only) -->
                        <td class="p-1 border-r border-slate-200 text-center bg-blue-50/20">
                          <input 
                            type="number" 
                            min="0" 
                            max="20"
                            step="1"
                            placeholder="—"
                            value="${studentMarks.activity !== null && studentMarks.activity !== undefined ? studentMarks.activity : ''}"
                            data-student-id="${s.id}"
                            data-is-activity="true"
                            data-max="20"
                            data-row="${rowIdx}"
                            data-col="${subjects.length}"
                            ${!canSaveMarks ? 'disabled' : ''}
                            class="spreadsheet-cell activity-input w-full h-8 text-center text-xs font-semibold tabular-nums rounded border border-blue-200/80 ${canSaveMarks ? 'bg-white text-blue-900' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}"
                          />
                        </td>
                      ` : ''}

                      <!-- Auto Computed Total -->
                      <td class="py-2.5 px-4 text-right tabular-nums font-bold text-slate-900 bg-slate-50/50" id="total-${s.id}">
                        ${studentMarks.total || 0}
                      </td>
                    </tr>
                  `;
                }).join('') : `
                  <tr>
                    <td colspan="${subjects.length + (isAdmin ? 5 : 4)}" class="p-8 text-center text-slate-400">
                      No student records found in this class roster.
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>

          <div class="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <span>Exam marks are bound to: <strong>${currentExamType} Exam (${currentAcademicYear} - ${currentTerm})</strong></span>
            <span>Unsaved progress is safely cached during active editing.</span>
          </div>
        </div>
      </div>
    `;

    this.bindEvents(container, subjects, students, user, isAdmin);
  },

  syncMarksState(classId, examType, academicYear, term, subjects, students, isAdmin = true, user = null) {
    if (!classId) return;

    const currentUser = user || Auth.getCurrentUser();
    const exams = Data.getExaminations({ classId, examType, academicYear, term }, currentUser);
    const existingExam = exams.length > 0 ? exams[0] : null;

    if (!hasUnsavedChanges) {
      marksState = {};
      students.forEach(s => {
        const stored = existingExam && existingExam.marks ? existingExam.marks[s.id] : null;
        if (stored) {
          if (isAdmin && !currentSubjectFilter) {
            marksState[s.id] = { ...stored };
          } else {
            // Strictly scope copied fields to visible assigned subjects; teachers never receive activity
            marksState[s.id] = {
              activity: isAdmin && stored.activity !== undefined ? stored.activity : null,
              total: 0
            };
            subjects.forEach(sub => {
              marksState[s.id][sub.id] = stored[sub.id] !== undefined ? stored[sub.id] : null;
            });
          }
        } else {
          marksState[s.id] = { activity: null, total: 0 };
          subjects.forEach(sub => {
            marksState[s.id][sub.id] = null;
          });
        }
        this.computeRowTotal(s.id, subjects, isAdmin);
      });
    }
  },

  computeRowTotal(studentId, subjects, isAdmin = true) {
    const studentMarks = marksState[studentId];
    if (!studentMarks) return 0;

    let sum = 0;
    subjects.forEach(sub => {
      const val = parseFloat(studentMarks[sub.id]);
      if (!isNaN(val)) sum += val;
    });

    // Activity is only visible/summed for Admins (or when numeric)
    if (isAdmin && studentMarks.activity !== null && studentMarks.activity !== undefined && !isNaN(studentMarks.activity)) {
      sum += parseFloat(studentMarks.activity);
    }

    studentMarks.total = sum;
    return sum;
  },

  bindEvents(container, subjects, students, user = Auth.getCurrentUser(), isAdmin = Permissions.isAdmin(user)) {
    // Class dropdown
    const classSelect = container.querySelector('#exam-class-select');
    if (classSelect) {
      classSelect.addEventListener('change', (e) => {
        if (hasUnsavedChanges) {
          if (!confirm('You have unsaved marks. Discard changes and switch class?')) {
            classSelect.value = currentClassId;
            return;
          }
        }
        if (!this.selectClass(e.target.value)) {
          classSelect.value = currentClassId;
          return;
        }
        this.render(container);
      });
    }

    // Subject filter dropdown
    const subSelect = container.querySelector('#exam-subject-select');
    if (subSelect) {
      subSelect.addEventListener('change', (e) => {
        if (hasUnsavedChanges) {
          if (!confirm('You have unsaved marks. Discard changes and filter subject?')) {
            subSelect.value = currentSubjectFilter;
            return;
          }
        }
        if (!this.selectSubject(e.target.value)) {
          subSelect.value = currentSubjectFilter;
          return;
        }
        this.render(container);
      });
    }

    // Exam Type
    const typeSelect = container.querySelector('#exam-type-select');
    if (typeSelect) {
      typeSelect.addEventListener('change', (e) => {
        if (hasUnsavedChanges) {
          if (!confirm('You have unsaved marks. Discard changes and switch exam type?')) {
            typeSelect.value = currentExamType;
            return;
          }
        }
        currentExamType = e.target.value;
        hasUnsavedChanges = false;
        this.render(container);
      });
    }

    // Academic Year
    const yearInput = container.querySelector('#exam-year-input');
    if (yearInput) {
      yearInput.addEventListener('change', (e) => {
        currentAcademicYear = e.target.value;
        hasUnsavedChanges = false;
        this.render(container);
      });
    }

    // Term
    const termSelect = container.querySelector('#exam-term-select');
    if (termSelect) {
      termSelect.addEventListener('change', (e) => {
        currentTerm = e.target.value;
        hasUnsavedChanges = false;
        this.render(container);
      });
    }

    // Search
    const searchInput = container.querySelector('#sheet-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        spreadsheetSearch = e.target.value;
        this.render(container);
      });
    }

    // Save Marks
    const saveBtn = container.querySelector('#save-marks-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `${Components.icon('refresh-cw', 'w-4 h-4 animate-spin')} Saving...`;

        setTimeout(() => {
          // Scope saved marks payload strictly to visible authorized subjects (never send activity from teachers)
          const scopedPayloadMarks = {};
          Object.keys(marksState).forEach(stId => {
            const row = marksState[stId] || {};
            const entry = {};
            subjects.forEach(sub => {
              if (isAdmin || Permissions.canEditSubjectMarks(user, currentClassId, sub.id)) {
                entry[sub.id] = row[sub.id] !== undefined ? row[sub.id] : null;
              }
            });
            if (isAdmin) {
              entry.activity = row.activity !== undefined ? row.activity : null;
            }
            scopedPayloadMarks[stId] = entry;
          });

          const res = Data.saveExaminationRecord({
            classId: currentClassId,
            examType: currentExamType,
            academicYear: currentAcademicYear,
            term: currentTerm,
            marks: scopedPayloadMarks
          }, user);

          saveBtn.disabled = false;
          saveBtn.innerHTML = `${Components.icon('check-circle', 'w-4 h-4')} ${I18n.t('examinations.saveMarks')}`;

          if (!res || res.success === false || res.authorized === false) {
            Components.showToast((res && res.error) || 'Access denied: Unable to save examination marks.', 'error', 4000);
            return;
          }

          hasUnsavedChanges = false;
          Components.showToast(`Saved ${currentExamType} examination marks for ${students.length} students!`, 'success');
          this.render(container);
        }, 300);
      });
    }

    // Cell inputs and live computation
    const inputs = container.querySelectorAll('.mark-input, .activity-input');
    inputs.forEach(input => {
      input.addEventListener('input', (e) => {
        const studentId = e.target.dataset.studentId;
        const maxVal = parseFloat(e.target.dataset.max) || 100;
        let rawVal = e.target.value.trim();

        if (!marksState[studentId]) marksState[studentId] = { activity: null, total: 0 };

        if (rawVal === '') {
          if (e.target.dataset.isActivity) {
            if (!isAdmin) return;
            marksState[studentId].activity = null;
          } else {
            const subId = e.target.dataset.subjectId;
            if (!Permissions.canEditSubjectMarks(user, currentClassId, subId)) return;
            marksState[studentId][subId] = null;
          }
          e.target.classList.remove('border-rose-500', 'bg-rose-50');
        } else {
          let num = parseFloat(rawVal);
          if (isNaN(num)) num = 0;
          if (num < 0) num = 0;

          // Validate max mark
          if (num > maxVal) {
            e.target.classList.add('border-rose-500', 'bg-rose-50');
            Components.showToast(`Score cannot exceed maximum mark of ${maxVal}.`, 'warning', 2500);
            num = maxVal;
            e.target.value = maxVal;
          } else {
            e.target.classList.remove('border-rose-500', 'bg-rose-50');
          }

          if (e.target.dataset.isActivity) {
            if (!isAdmin) return;
            marksState[studentId].activity = num;
          } else {
            const subId = e.target.dataset.subjectId;
            if (!Permissions.canEditSubjectMarks(user, currentClassId, subId)) return;
            marksState[studentId][subId] = num;
          }
        }

        // Compute total live
        const newTotal = this.computeRowTotal(studentId, subjects, isAdmin);
        const totalCell = container.querySelector(`#total-${studentId}`);
        if (totalCell) totalCell.textContent = newTotal;

        hasUnsavedChanges = true;
      });

      // Keyboard navigation (Arrow keys, Enter, Tab)
      input.addEventListener('keydown', (e) => {
        const r = parseInt(input.dataset.row, 10);
        const c = parseInt(input.dataset.col, 10);

        let targetInput = null;
        if (e.key === 'ArrowDown' || e.key === 'Enter') {
          targetInput = container.querySelector(`input[data-row="${r + 1}"][data-col="${c}"]`);
          if (targetInput) {
            e.preventDefault();
            targetInput.focus();
            targetInput.select();
          }
        } else if (e.key === 'ArrowUp') {
          targetInput = container.querySelector(`input[data-row="${r - 1}"][data-col="${c}"]`);
          if (targetInput) {
            e.preventDefault();
            targetInput.focus();
            targetInput.select();
          }
        } else if (e.key === 'ArrowRight' && input.selectionEnd === input.value.length) {
          targetInput = container.querySelector(`input[data-row="${r}"][data-col="${c + 1}"]`);
          if (targetInput) {
            e.preventDefault();
            targetInput.focus();
            targetInput.select();
          }
        } else if (e.key === 'ArrowLeft' && input.selectionStart === 0) {
          targetInput = container.querySelector(`input[data-row="${r}"][data-col="${c - 1}"]`);
          if (targetInput) {
            e.preventDefault();
            targetInput.focus();
            targetInput.select();
          }
        }
      });
    });
  }
};
