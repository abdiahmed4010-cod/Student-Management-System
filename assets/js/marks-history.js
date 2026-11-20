/**
 * AL-IMAAMA - Marks History Module (Faculty & Teachers)
 * Displays previously saved examination records strictly scoped to teacher's assigned classes & subjects.
 * Includes Class, Subject, Exam Type, Academic Year, Term, Student count, Total marks entered, Date saved,
 * and detailed roster mark viewer.
 */

import { Data } from './data.js';
import { Auth } from './auth.js';
import { Permissions } from './permissions.js';
import { Components } from './components.js';
import { I18n } from './i18n.js';

let filterClassId = '';
let filterExamType = '';
let filterTerm = '';

export const MarksHistoryView = {
  render(container) {
    const user = Auth.getCurrentUser();
    if (!Permissions.hasPermission(user, 'examinations', 'view')) {
      container.innerHTML = `
        <div class="p-8 max-w-lg mx-auto text-center space-y-3 bg-white rounded-xl border border-slate-200 shadow-xs">
          <div class="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            ${Components.icon('lock', 'w-6 h-6')}
          </div>
          <h2 class="text-base font-bold text-slate-900">Access Restricted</h2>
          <p class="text-xs text-slate-500">Your account does not currently have permission to view marks history.</p>
        </div>
      `;
      return;
    }

    const isAdmin = Permissions.isAdmin(user);
    const classes = Data.getClasses();
    const subjects = Data.getSubjects();
    const students = Data.getStudents();
    const allExams = Data.getExaminations({}, user);

    // Teacher class & subject scoping (require BOTH assigned class AND assigned subject)
    let availableClasses = classes;
    let availableSubjects = subjects;
    if (!isAdmin) {
      const assignedSubjectIds = Permissions.getTeacherAssignedSubjectIds(user);
      availableClasses = classes.filter(c => Permissions.canAccessClassMarks(user, c.id));
      availableSubjects = subjects.filter(s =>
        assignedSubjectIds.includes(s.id) && availableClasses.some(c => c.id === s.classId)
      );
    }

    if (filterClassId && !availableClasses.some(c => c.id === filterClassId)) {
      filterClassId = '';
    }
    if (!filterClassId && availableClasses.length > 0) {
      filterClassId = availableClasses[0].id;
    }

    // Build row entries: for each exam record in available classes, break down by available subjects
    const historyRows = [];

    allExams.forEach(exam => {
      if (!availableClasses.some(c => c.id === exam.classId)) return;
      const cls = classes.find(c => c.id === exam.classId);
      const classSubjects = availableSubjects.filter(s => s.classId === exam.classId);
      const classStudents = students.filter(s => s.classId === exam.classId);

      classSubjects.forEach(sub => {
        // Count how many students have marks entered for this subject
        let enteredCount = 0;
        let markSum = 0;
        const studentScores = [];

        if (exam.marks) {
          classStudents.forEach(st => {
            const markObj = exam.marks[st.id];
            if (markObj && markObj[sub.id] !== undefined && markObj[sub.id] !== null && markObj[sub.id] !== '') {
              const val = parseFloat(markObj[sub.id]);
              if (!isNaN(val)) {
                enteredCount++;
                markSum += val;
                studentScores.push({
                  studentId: st.id,
                  studentName: st.fullName,
                  score: val,
                  activity: markObj.activity,
                  total: isAdmin ? markObj.total : val
                });
              }
            }
          });
        }

        const avgScore = enteredCount > 0 ? (markSum / enteredCount).toFixed(1) : '—';

        historyRows.push({
          id: `${exam.id}__${sub.id}`,
          examId: exam.id,
          classId: exam.classId,
          className: cls ? cls.name : 'Unknown',
          subjectId: sub.id,
          subjectName: sub.name,
          maxMarks: sub.maxMarks,
          examType: exam.examType,
          academicYear: exam.academicYear || '2026-2027',
          term: exam.term || 'Term 1',
          studentCount: classStudents.length,
          enteredCount,
          totalMarksEntered: markSum,
          avgScore,
          dateSaved: exam.updatedAt ? new Date(exam.updatedAt).toLocaleDateString() : 'Active Session',
          scores: studentScores
        });
      });
    });

    // Apply active filters
    let filtered = historyRows;
    if (filterClassId) {
      filtered = filtered.filter(r => r.classId === filterClassId);
    }
    if (filterExamType) {
      filtered = filtered.filter(r => r.examType === filterExamType);
    }
    if (filterTerm) {
      filtered = filtered.filter(r => r.term === filterTerm);
    }

    container.innerHTML = `
      <div class="space-y-6">
        <!-- Header -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold tracking-tight text-slate-900">${I18n.t('nav.marksHistory', 'Marks History')}</h1>
            <p class="text-sm text-slate-500 mt-1">Review saved examination records, class averages, and graded submissions for your subjects.</p>
          </div>
          <a href="#examinations" class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors self-start sm:self-auto">
            ${Components.icon('file-spreadsheet', 'w-4 h-4')} ${I18n.t('nav.enterMarks', 'Enter Marks')}
          </a>
        </div>

        <!-- Metric KPI Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span class="text-slate-400 block text-[11px] font-bold uppercase">Teaching Subjects</span>
            <h3 class="text-xl font-bold text-slate-900 mt-1 tabular-nums">${availableSubjects.length}</h3>
            <p class="text-xs text-slate-500 mt-0.5">Assigned for grading</p>
          </div>
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span class="text-slate-400 block text-[11px] font-bold uppercase">Exam Grade Sheets</span>
            <h3 class="text-xl font-bold text-blue-600 mt-1 tabular-nums">${filtered.length}</h3>
            <p class="text-xs text-slate-500 mt-0.5">Recorded historical sessions</p>
          </div>
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span class="text-slate-400 block text-[11px] font-bold uppercase">Total Marks Entered</span>
            <h3 class="text-xl font-bold text-emerald-600 mt-1 tabular-nums">${filtered.reduce((acc, r) => acc + r.enteredCount, 0)}</h3>
            <p class="text-xs text-slate-500 mt-0.5">Individual student marks</p>
          </div>
        </div>

        <!-- Filter Bar -->
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div class="flex flex-wrap items-center gap-3">
            <div>
              <label class="block text-[11px] font-semibold text-slate-500 mb-1">Filter by Class:</label>
              <select id="marks-hist-class-filter" class="py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-semibold text-slate-800">
                <option value="">All My Classes</option>
                ${availableClasses.map(c => `
                  <option value="${c.id}" ${filterClassId === c.id ? 'selected' : ''}>
                    ${c.name}
                  </option>
                `).join('')}
              </select>
            </div>

            <div>
              <label class="block text-[11px] font-semibold text-slate-500 mb-1">Exam Type:</label>
              <select id="marks-hist-type-filter" class="py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-medium text-slate-800">
                <option value="">All Exam Types</option>
                <option value="Midterm" ${filterExamType === 'Midterm' ? 'selected' : ''}>Midterm Examination</option>
                <option value="Final" ${filterExamType === 'Final' ? 'selected' : ''}>Final Examination</option>
              </select>
            </div>

            <div>
              <label class="block text-[11px] font-semibold text-slate-500 mb-1">Term:</label>
              <select id="marks-hist-term-filter" class="py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-medium text-slate-800">
                <option value="">All Terms</option>
                <option value="Term 1" ${filterTerm === 'Term 1' ? 'selected' : ''}>Term 1</option>
                <option value="Term 2" ${filterTerm === 'Term 2' ? 'selected' : ''}>Term 2</option>
                <option value="Term 3" ${filterTerm === 'Term 3' ? 'selected' : ''}>Term 3</option>
              </select>
            </div>

            ${(filterClassId || filterExamType || filterTerm) ? `
              <div class="self-end">
                <button id="clear-marks-filters-btn" class="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                  Clear Filters
                </button>
              </div>
            ` : ''}
          </div>

          <div class="text-right text-xs text-slate-400">
            <span>Showing ${filtered.length} saved mark sheets</span>
          </div>
        </div>

        <!-- Marks History Table -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div class="overflow-x-auto custom-scrollbar">
            <table class="w-full text-left text-xs text-slate-600">
              <thead class="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th class="py-3 px-4">Class</th>
                  <th class="py-3 px-4">Subject</th>
                  <th class="py-3 px-4">Examination</th>
                  <th class="py-3 px-4">Year & Term</th>
                  <th class="py-3 px-4 text-center">Graded Students</th>
                  <th class="py-3 px-4 text-right">Class Average</th>
                  <th class="py-3 px-4">Date Saved</th>
                  <th class="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${filtered.length > 0 ? filtered.map(row => `
                  <tr class="hover:bg-slate-50 transition-colors">
                    <td class="py-3 px-4 font-bold text-slate-900">${row.className}</td>
                    <td class="py-3 px-4">
                      <span class="font-semibold text-blue-700">${row.subjectName}</span>
                      <span class="text-[11px] text-slate-400 block">Max: ${row.maxMarks} pts</span>
                    </td>
                    <td class="py-3 px-4">
                      <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                        row.examType === 'Final' ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }">
                        ${row.examType} Exam
                      </span>
                    </td>
                    <td class="py-3 px-4 font-mono text-slate-600">${row.academicYear} (${row.term})</td>
                    <td class="py-3 px-4 text-center tabular-nums font-semibold text-slate-800">
                      ${row.enteredCount} / ${row.studentCount}
                    </td>
                    <td class="py-3 px-4 text-right tabular-nums font-bold text-slate-900">
                      ${row.avgScore} <span class="text-[11px] font-normal text-slate-400">/ ${row.maxMarks}</span>
                    </td>
                    <td class="py-3 px-4 text-slate-500 tabular-nums">${row.dateSaved}</td>
                    <td class="py-3 px-4 text-right">
                      <button class="view-mark-records-btn px-3 py-1 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors" data-id="${row.id}">
                        View Records
                      </button>
                    </td>
                  </tr>
                `).join('') : `
                  <tr>
                    <td colspan="8" class="p-8 text-center text-slate-400">
                      No saved marks history found for the selected criteria.
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    this.bindEvents(container, filtered);
  },

  bindEvents(container, filtered) {
    const classFilter = container.querySelector('#marks-hist-class-filter');
    if (classFilter) {
      classFilter.addEventListener('change', (e) => {
        filterClassId = e.target.value;
        this.render(container);
      });
    }

    const typeFilter = container.querySelector('#marks-hist-type-filter');
    if (typeFilter) {
      typeFilter.addEventListener('change', (e) => {
        filterExamType = e.target.value;
        this.render(container);
      });
    }

    const termFilter = container.querySelector('#marks-hist-term-filter');
    if (termFilter) {
      termFilter.addEventListener('change', (e) => {
        filterTerm = e.target.value;
        this.render(container);
      });
    }

    const clearBtn = container.querySelector('#clear-marks-filters-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        filterClassId = '';
        filterExamType = '';
        filterTerm = '';
        this.render(container);
      });
    }

    container.querySelectorAll('.view-mark-records-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const targetRow = filtered.find(r => r.id === id);
        if (targetRow) {
          this.openMarksRecordModal(targetRow);
        }
      });
    });
  },

  openMarksRecordModal(row) {
    const user = Auth.getCurrentUser();
    if (!Permissions.canAccessSubjectMarks(user, row.classId, row.subjectId)) {
      Components.showToast('Access denied: This subject mark sheet is not assigned to your teaching profile.', 'warning', 3500);
      return;
    }
    const isAdmin = Permissions.isAdmin(user);
    const settings = Data.getSettings();
    const content = `
      <div class="space-y-4 printable-area">
        <div class="p-4 bg-slate-50 rounded-xl border border-slate-200 border-t-2 border-t-blue-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
          <div class="flex items-center gap-3">
            ${Components.getLogoHtml('w-11 h-11')}
            <div>
              <span class="text-[10px] font-bold uppercase tracking-wider text-amber-600 block">${settings.institutionName || 'MADARASATUL AL-IMAAM'}</span>
              <h4 class="font-bold text-slate-900 text-sm">${row.className} · ${row.subjectName}</h4>
              <p class="text-slate-500 font-medium mt-0.5">${row.examType} Exam (${row.academicYear} - ${row.term})</p>
            </div>
          </div>
          <div class="text-right">
            <span class="font-bold text-blue-700 block text-sm">Avg: ${row.avgScore} / ${row.maxMarks} pts</span>
            <span class="text-slate-400 text-[11px]">${row.scores.length} graded students</span>
          </div>
        </div>

        <div class="max-h-96 overflow-y-auto border border-slate-200 rounded-lg">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 sticky top-0">
              <tr>
                <th class="py-2.5 px-3">Student ID</th>
                <th class="py-2.5 px-3">Student Name</th>
                <th class="py-2.5 px-3 text-right">Score</th>
                ${isAdmin ? '<th class="py-2.5 px-3 text-right">Activity</th>' : ''}
                ${isAdmin ? '<th class="py-2.5 px-3 text-right">Row Total</th>' : ''}
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${row.scores.length > 0 ? row.scores.map(s => `
                <tr class="hover:bg-slate-50">
                  <td class="py-2 px-3 font-mono font-medium text-blue-600">${s.studentId}</td>
                  <td class="py-2 px-3 font-semibold text-slate-900">${s.studentName}</td>
                  <td class="py-2 px-3 text-right tabular-nums font-bold text-blue-700">${s.score} <span class="text-slate-400 font-normal">/ ${row.maxMarks}</span></td>
                  ${isAdmin ? `<td class="py-2 px-3 text-right tabular-nums text-slate-600">${s.activity !== null && s.activity !== undefined ? s.activity : '—'}</td>` : ''}
                  ${isAdmin ? `<td class="py-2 px-3 text-right tabular-nums font-bold text-slate-900">${s.total || s.score}</td>` : ''}
                </tr>
              `).join('') : `
                <tr><td colspan="${isAdmin ? 5 : 3}" class="p-6 text-center text-slate-400">No marks entered for this subject yet.</td></tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;

    Components.openModal(content, `Examination Mark Sheet: ${row.subjectName}`, { maxWidth: 'max-w-md' });
  }
};
