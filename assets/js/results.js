/**
 * AL-IMAAMA - Results & Ranking Module
 * Derives academic standing, consistent position rankings with tie-handling, and detailed student scorecards.
 */

import { Data } from './data.js';
import { Auth } from './auth.js';
import { Permissions } from './permissions.js';
import { Components } from './components.js';
import { I18n } from './i18n.js';

let selectedClassId = '';
let selectedYear = '2026-2027';
let selectedTerm = 'Term 1';

export const ResultsView = {
  render(container) {
    const user = Auth.getCurrentUser();
    const isAdmin = Permissions.isAdmin(user);
    const classes = Data.getClasses();

    // Teacher class isolation
    let availableClasses = classes;
    if (!isAdmin && user && user.teacherDetails) {
      const assignedIds = user.teacherDetails.assignedClassIds || [];
      availableClasses = classes.filter(c => assignedIds.includes(c.id));
    }

    if (!selectedClassId && availableClasses.length > 0) {
      selectedClassId = availableClasses[0].id;
    } else if (selectedClassId && !availableClasses.some(c => c.id === selectedClassId)) {
      selectedClassId = availableClasses.length > 0 ? availableClasses[0].id : '';
    }

    const currentClass = classes.find(c => c.id === selectedClassId);
    const rankingData = selectedClassId 
      ? Data.calculateRankings(selectedClassId, selectedYear, selectedTerm)
      : { results: [], midtermExists: false, finalExists: false };

    const results = rankingData.results || [];
    const settings = Data.getSettings();

    // Summary calculations
    const rankedStudents = results.filter(r => r.hasScores);
    const topPerformer = rankedStudents.length > 0 ? rankedStudents[0] : null;
    const highestScore = topPerformer ? topPerformer.combinedTotal : 0;
    const avgScore = rankedStudents.length > 0 
      ? Math.round((rankedStudents.reduce((acc, r) => acc + r.combinedTotal, 0) / rankedStudents.length) * 10) / 10 
      : 0;

    let calcLabel = 'Simple Sum (Midterm + Final)';
    if (settings.resultCalcMethod === 'average') calcLabel = 'Equal Average (50% Midterm / 50% Final)';
    if (settings.resultCalcMethod === 'weighted') calcLabel = `Weighted (${settings.weightedMidterm}% Midterm / ${settings.weightedFinal}% Final)`;

    container.innerHTML = `
      <div class="space-y-6">
        <!-- Module Header -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold tracking-tight text-slate-900">${I18n.t('results.title')}</h1>
            <p class="text-sm text-slate-500 mt-1">${I18n.t('results.sub')}</p>
          </div>
          <button id="export-rankings-btn" class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors self-start sm:self-auto">
            ${Components.icon('download', 'w-4 h-4')} ${I18n.t('results.exportMerit')}
          </button>
        </div>

        <!-- Filter Bar -->
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div class="flex flex-wrap items-center gap-3">
            <div>
              <label class="block text-[11px] font-semibold text-slate-500 mb-1">${I18n.t('attendance.selectClass')}</label>
              <select id="rank-class-select" class="py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-semibold text-slate-800">
                ${availableClasses.map(c => `
                  <option value="${c.id}" ${selectedClassId === c.id ? 'selected' : ''}>
                    ${c.name}
                  </option>
                `).join('')}
              </select>
            </div>

            <div>
              <label class="block text-[11px] font-semibold text-slate-500 mb-1">Academic Year:</label>
              <input 
                type="text" 
                id="rank-year-input" 
                value="${selectedYear}" 
                class="py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-medium text-slate-800 w-28"
              />
            </div>

            <div>
              <label class="block text-[11px] font-semibold text-slate-500 mb-1">Term:</label>
              <select id="rank-term-select" class="py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-medium text-slate-800">
                <option value="Term 1" ${selectedTerm === 'Term 1' ? 'selected' : ''}>Term 1</option>
                <option value="Term 2" ${selectedTerm === 'Term 2' ? 'selected' : ''}>Term 2</option>
                <option value="Term 3" ${selectedTerm === 'Term 3' ? 'selected' : ''}>Term 3</option>
              </select>
            </div>
          </div>

          <!-- Formula Info Tag -->
          <div class="text-right text-xs">
            <span class="text-slate-400 block text-[11px]">Combined Total Rule:</span>
            <span class="font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded border border-blue-100 inline-block mt-0.5">${calcLabel}</span>
          </div>
        </div>

        <!-- Summary KPIs -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span class="text-slate-400 block text-[11px] font-bold uppercase">${I18n.t('results.topStudent')}</span>
            <h3 class="text-base font-bold text-slate-900 mt-1 truncate">${topPerformer ? topPerformer.studentName : '—'}</h3>
            <p class="text-xs text-blue-600 mt-0.5">${topPerformer ? `Score: ${topPerformer.combinedTotal} pts` : '—'}</p>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span class="text-slate-400 block text-[11px] font-bold uppercase">${I18n.t('results.classAvg')}</span>
            <h3 class="text-xl font-bold text-slate-900 mt-1 tabular-nums">${avgScore} pts</h3>
            <p class="text-xs text-slate-500 mt-0.5">Across ${rankedStudents.length} graded students</p>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span class="text-slate-400 block text-[11px] font-bold uppercase">${I18n.t('results.highestScore')}</span>
            <h3 class="text-xl font-bold text-emerald-600 mt-1 tabular-nums">${highestScore} pts</h3>
            <p class="text-xs text-slate-500 mt-0.5">Peak benchmark</p>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span class="text-slate-400 block text-[11px] font-bold uppercase">Exam Status</span>
            <div class="mt-1 flex items-center gap-2 text-xs">
              <span class="inline-flex items-center gap-1 ${rankingData.midtermExists ? 'text-emerald-700 font-semibold' : 'text-slate-400'}">
                ${Components.icon(rankingData.midtermExists ? 'check' : 'x', 'w-3.5 h-3.5')} ${I18n.t('examinations.midterm')}
              </span>
              <span class="text-slate-300">·</span>
              <span class="inline-flex items-center gap-1 ${rankingData.finalExists ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}">
                ${Components.icon(rankingData.finalExists ? 'check' : 'alert-circle', 'w-3.5 h-3.5')} ${I18n.t('examinations.final')}
              </span>
            </div>
            <p class="text-[11px] text-slate-400 mt-0.5">${rankingData.finalExists ? 'Final Exam Completed' : 'Final Exam Pending'}</p>
          </div>
        </div>

        <!-- Ranking Table -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div class="p-3 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <span>Roster for <strong>${currentClass ? currentClass.name : ''}</strong> · ${results.length} total students</span>
            <span>Positions strictly calculated with consistent tie-breaking</span>
          </div>

          <div class="overflow-x-auto custom-scrollbar">
            <table class="w-full text-left text-xs text-slate-700">
              <thead class="bg-blue-900 text-white font-semibold border-b border-blue-950">
                <tr>
                  <th class="py-3 px-4 w-20 text-center whitespace-nowrap">${I18n.t('results.position')}</th>
                  <th class="py-3 px-4 whitespace-nowrap">${I18n.t('students.studentId')}</th>
                  <th class="py-3 px-4 whitespace-nowrap">${I18n.t('students.fullName')}</th>
                  <th class="py-3 px-4 whitespace-nowrap">${I18n.t('students.classLabel', 'Class')}</th>
                  <th class="py-3 px-4 text-right whitespace-nowrap">${I18n.t('results.midtermTotal')}</th>
                  <th class="py-3 px-4 text-right whitespace-nowrap">${I18n.t('results.finalTotal')}</th>
                  <th class="py-3 px-4 text-right whitespace-nowrap">${I18n.t('results.combinedTotal')}</th>
                  <th class="py-3 px-4 text-right whitespace-nowrap">${I18n.t('common.actions')}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${results.length > 0 ? results.map(row => {
                  const isTop3 = row.position <= 3 && row.hasScores;
                  const posBadgeClass = row.position === 1 
                    ? 'bg-amber-100 text-amber-800 border-amber-300 font-bold' 
                    : row.position === 2
                    ? 'bg-slate-200 text-slate-800 border-slate-300 font-bold'
                    : row.position === 3
                    ? 'bg-amber-50 text-amber-900 border-amber-200 font-bold'
                    : 'bg-slate-100 text-slate-700 border-slate-200';

                  return `
                    <tr class="hover:bg-slate-50/80 transition-colors ${isTop3 ? 'bg-amber-50/20' : ''}">
                      <td class="py-3 px-4 text-center whitespace-nowrap">
                        ${row.hasScores && row.position ? `
                          <span class="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs border ${posBadgeClass} tabular-nums">
                            ${row.position}
                          </span>
                        ` : '<span class="text-slate-400">—</span>'}
                      </td>
                      <td class="py-3 px-4 font-mono font-medium text-blue-700 whitespace-nowrap">${row.studentId}</td>
                      <td class="py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">${row.studentName}</td>
                      <td class="py-3 px-4 text-slate-700 whitespace-nowrap">${currentClass ? currentClass.name : '—'}</td>
                      <td class="py-3 px-4 text-right tabular-nums text-slate-700 whitespace-nowrap">
                        ${row.midtermTotal !== null ? row.midtermTotal : '<span class="text-slate-400">—</span>'}
                      </td>
                      <td class="py-3 px-4 text-right tabular-nums text-slate-700 whitespace-nowrap">
                        ${row.finalTotal !== null ? row.finalTotal : '<span class="text-slate-400">—</span>'}
                      </td>
                      <td class="py-3 px-4 text-right tabular-nums font-bold text-blue-900 text-sm whitespace-nowrap">
                        ${row.hasScores ? row.combinedTotal : '<span class="text-slate-400 font-normal">—</span>'}
                      </td>
                      <td class="py-3 px-4 text-right whitespace-nowrap">
                        <button class="view-scorecard-btn text-blue-600 hover:text-blue-800 hover:underline font-semibold" data-id="${row.studentId}">
                          ${I18n.t('results.scorecard')}
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('') : `
                  <tr>
                    <td colspan="8" class="p-8 text-center text-slate-400">
                      No student records found in this class.
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    this.bindEvents(container, results);
  },

  bindEvents(container, results) {
    const classSelect = container.querySelector('#rank-class-select');
    if (classSelect) {
      classSelect.addEventListener('change', (e) => {
        selectedClassId = e.target.value;
        this.render(container);
      });
    }

    const yearInput = container.querySelector('#rank-year-input');
    if (yearInput) {
      yearInput.addEventListener('change', (e) => {
        selectedYear = e.target.value;
        this.render(container);
      });
    }

    const termSelect = container.querySelector('#rank-term-select');
    if (termSelect) {
      termSelect.addEventListener('change', (e) => {
        selectedTerm = e.target.value;
        this.render(container);
      });
    }

    const exportBtn = container.querySelector('#export-rankings-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportMeritList(results));
    }

    container.querySelectorAll('.view-scorecard-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.openStudentScorecardModal(btn.dataset.id);
      });
    });
  },

  openStudentScorecardModal(studentId) {
    const student = Data.getStudentById(studentId);
    if (!student) return;

    const user = Auth.getCurrentUser();
    const canPrint = Permissions.hasPermission(user, 'examinations', 'print');
    const settings = Data.getSettings();
    const cls = Data.getClassById(student.classId);
    const subjects = Data.getSubjectsByClass(student.classId);
    const exams = Data.getExaminations({ classId: student.classId, academicYear: selectedYear, term: selectedTerm });
    const midterm = exams.find(e => e.examType === 'Midterm');
    const finalExam = exams.find(e => e.examType === 'Final');

    const midMarks = midterm && midterm.marks ? midterm.marks[student.id] : null;
    const finMarks = finalExam && finalExam.marks ? finalExam.marks[student.id] : null;

    const content = `
      <div class="space-y-5 printable-area bg-white p-1">
        <!-- Official School Letterhead -->
        <div class="flex items-start justify-between border-b-2 border-blue-900 pb-3">
          <div class="flex items-center gap-3">
            ${Components.getLogoHtml('w-14 h-14')}
            <div>
              <span class="text-[10px] font-bold uppercase tracking-wider text-amber-600 block">AL-IMAAMA</span>
              <h3 class="text-sm font-black text-blue-900 tracking-tight">${settings.institutionName || 'MADARASATUL AL-IMAAM'}</h3>
              <p class="text-[11px] text-slate-500">${settings.address || 'Hargeisa, Somaliland'} · ${settings.contactPhone || '063-4129440'}</p>
            </div>
          </div>
          <div class="text-right">
            <span class="px-2 py-0.5 text-[10px] font-bold bg-blue-900 text-amber-300 border border-amber-400/50 rounded">
              OFFICIAL SCORECARD
            </span>
            <p class="text-[11px] text-slate-500 mt-1">${selectedYear} · ${selectedTerm}</p>
          </div>
        </div>

        <div class="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200">
          <div>
            <h3 class="text-sm font-bold text-slate-900">${student.fullName}</h3>
            <p class="text-xs text-slate-500 font-mono">ID: ${student.id} · ${cls ? cls.name : ''}</p>
          </div>
          <span class="px-2.5 py-1 text-xs font-semibold bg-white text-slate-700 border border-slate-200 rounded-md">
            ${I18n.t('results.individualScorecard', 'Individual Scorecard')}
          </span>
        </div>

        <div class="border border-slate-200 rounded-lg overflow-hidden text-xs">
          <table class="w-full text-left">
            <thead class="bg-slate-100 text-slate-800 font-semibold border-b border-slate-200">
              <tr>
                <th class="py-2.5 px-3">Curriculum Subject</th>
                <th class="py-2.5 px-3 text-right">Max Marks</th>
                <th class="py-2.5 px-3 text-right">Midterm Score</th>
                <th class="py-2.5 px-3 text-right">Final Score</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${subjects.map(sub => {
                const mScore = midMarks && midMarks[sub.id] !== undefined && midMarks[sub.id] !== null ? midMarks[sub.id] : '—';
                const fScore = finMarks && finMarks[sub.id] !== undefined && finMarks[sub.id] !== null ? finMarks[sub.id] : '—';
                return `
                  <tr>
                    <td class="py-2 px-3 font-medium text-slate-800">${sub.name}</td>
                    <td class="py-2 px-3 text-right tabular-nums text-slate-500">${sub.maxMarks}</td>
                    <td class="py-2 px-3 text-right tabular-nums font-semibold text-slate-900">${mScore}</td>
                    <td class="py-2 px-3 text-right tabular-nums font-semibold text-slate-900">${fScore}</td>
                  </tr>
                `;
              }).join('')}
              <tr class="bg-blue-50/30">
                <td class="py-2 px-3 font-medium text-blue-900">Optional Activity</td>
                <td class="py-2 px-3 text-right tabular-nums text-slate-500">20</td>
                <td class="py-2 px-3 text-right tabular-nums font-semibold text-blue-900">${midMarks && midMarks.activity !== null && midMarks.activity !== undefined ? midMarks.activity : '—'}</td>
                <td class="py-2 px-3 text-right tabular-nums font-semibold text-blue-900">${finMarks && finMarks.activity !== null && finMarks.activity !== undefined ? finMarks.activity : '—'}</td>
              </tr>
            </tbody>
            <tfoot class="bg-slate-100 font-bold border-t border-slate-200">
              <tr>
                <td class="py-2.5 px-3 text-slate-800">Total Marks:</td>
                <td class="py-2.5 px-3 text-right text-slate-500">—</td>
                <td class="py-2.5 px-3 text-right tabular-nums text-blue-600 font-bold">${midMarks ? midMarks.total : '—'}</td>
                <td class="py-2.5 px-3 text-right tabular-nums text-blue-600 font-bold">${finMarks ? finMarks.total : '—'}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        ${canPrint ? `
          <div class="flex items-center justify-end gap-2 pt-2 no-print">
            <button id="scorecard-pdf-btn" type="button" class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors">
              ${Components.icon('file-text', 'w-4 h-4')} Save as PDF
            </button>
            <button id="scorecard-print-btn" type="button" class="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
              ${Components.icon('printer', 'w-4 h-4')} Print Scorecard
            </button>
          </div>
        ` : ''}
      </div>
    `;

    const modal = Components.openModal(content, `Academic Scorecard: ${student.fullName}`, { maxWidth: 'max-w-lg' });
    const pdfBtn = modal.querySelector('#scorecard-pdf-btn');
    const printBtn = modal.querySelector('#scorecard-print-btn');
    if (pdfBtn) pdfBtn.addEventListener('click', () => Components.triggerPrint({ orientation: 'portrait' }));
    if (printBtn) printBtn.addEventListener('click', () => Components.triggerPrint({ orientation: 'portrait' }));
  },

  exportMeritList(results) {
    const cls = Data.getClassById(selectedClassId);
    const className = cls ? cls.name : '—';
    const headers = ['Position', 'Student ID', 'Student Name', 'Class', 'Midterm Total', 'Final Total', 'Combined Total'];
    const rows = results.map(r => [
      r.hasScores && r.position ? r.position : '—',
      r.studentId,
      r.studentName,
      className,
      r.midtermTotal !== null ? r.midtermTotal : '—',
      r.finalTotal !== null ? r.finalTotal : '—',
      r.hasScores ? r.combinedTotal : '—'
    ]);

    Components.exportToExcel(
      `AL_IMAAMA_Class_Ranking_${selectedYear}_${selectedTerm}.xlsx`,
      'Class Ranking',
      headers,
      rows,
      null,
      {
        institutionName: 'MADARASATUL AL-IMAAM',
        systemName: 'AL-IMAAMA',
        reportTitle: `Class Ranking — ${className}`,
        academicPeriod: `${selectedYear} (${selectedTerm})`,
        generatedDate: new Date().toLocaleDateString()
      }
    );
    Components.showToast('Class ranking exported to Excel (.xlsx).', 'success');
  }
};
