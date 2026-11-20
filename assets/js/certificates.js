/**
 * AL-IMAAMA - Student Certificates & Academic Transcripts Module (Admin Only)
 * Generates, previews, prints, and exports official MADARASATUL AL-IMAAM certificates
 * and formal academic transcripts strictly from verified database records.
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Auth } from './auth.js';
import { Data } from './data.js';
import { Permissions } from './permissions.js';
import { Components } from './components.js';

export const CERTIFICATE_TYPES = [
  {
    id: 'academic-completion',
    title: 'Academic Year Completion Certificate',
    shortLabel: 'Completion',
    description: 'Requires verified Final Examination marks or a recorded promotion for the selected academic year.'
  },
  {
    id: 'academic-achievement',
    title: 'Examination Achievement Certificate',
    shortLabel: 'Achievement',
    description: 'Requires verified Final Examination marks for the selected academic year; includes verified score & position.'
  },
  {
    id: 'enrollment-progress',
    title: 'Academic Progress & Enrollment Certificate',
    shortLabel: 'Progress & Enrollment',
    description: 'Requires at least one recorded Midterm or Final examination in the selected academic year.'
  },
  {
    id: 'attendance-standing',
    title: 'Attendance & Regularity Certificate',
    shortLabel: 'Attendance Standing',
    description: 'Requires recorded attendance entries for the student in school records.'
  }
];

function escapeHtml(val) {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeFilenamePart(str) {
  return String(str || 'document')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'document';
}

export function getAvailableAcademicYears() {
  const settings = Data.getSettings();
  const classes = Data.getClasses();
  const exams = Data.getExaminations();
  const promotions = Data.getPromotionHistory();

  const yearSet = new Set();
  if (settings && settings.academicYear) yearSet.add(settings.academicYear);
  classes.forEach(c => {
    if (c.academicYear) yearSet.add(c.academicYear);
  });
  exams.forEach(e => {
    if (e.academicYear) yearSet.add(e.academicYear);
  });
  promotions.forEach(p => {
    if (p.academicYear) yearSet.add(p.academicYear);
  });

  return Array.from(yearSet).sort((a, b) => String(b).localeCompare(String(a)));
}

/**
 * Resolves candidate students associated with a class (currently enrolled OR having
 * verified historical examination/promotion records in that class & year).
 */
export function buildClassBulkStudents(classId, academicYear) {
  const allStudents = Data.getStudents();
  const classes = Data.getClasses();
  const targetCls = classes.find(c => c.id === classId) || null;

  const candidateIds = new Set();
  allStudents.forEach(s => {
    if (s.classId === classId) {
      candidateIds.add(s.id);
    }
  });

  // Also include students who sat exams or were promoted from this class in the selected year
  const exams = Data.getExaminations({
    classId,
    academicYear: academicYear && academicYear !== 'ALL' ? academicYear : undefined
  });
  exams.forEach(ex => {
    if (ex.marks) {
      Object.keys(ex.marks).forEach(stId => candidateIds.add(stId));
    }
  });

  const promotions = Data.getPromotionHistory();
  promotions.forEach(p => {
    if (
      p.previousClassId === classId &&
      (!academicYear || academicYear === 'ALL' || p.academicYear === academicYear)
    ) {
      candidateIds.add(p.studentId);
    }
  });

  const resolved = [];
  candidateIds.forEach(stId => {
    const st = allStudents.find(s => s.id === stId);
    if (st) {
      resolved.push({
        ...st,
        currentClassName: (classes.find(c => c.id === st.classId) || {}).name || 'Unassigned',
        targetClassName: targetCls ? targetCls.name : classId
      });
    }
  });

  resolved.sort((a, b) => a.id.localeCompare(b.id));
  return resolved;
}

/**
 * Evaluates certificate eligibility strictly from verified school records.
 * Never invents marks, awards, grades, or graduation status.
 */
export function evaluateCertificateEligibility(student, certificateType, academicYear, targetClassId = null, user = null) {
  if (!student) {
    return { eligible: false, reason: 'Student record not found.', details: null };
  }

  const classes = Data.getClasses();
  const currentCls = classes.find(c => c.id === student.classId);
  const currentClassName = currentCls ? currentCls.name : 'Unassigned';

  const yearExams = Data.getStudentHistoricalExams(
    {
      studentId: student.id,
      academicYear: academicYear && academicYear !== 'ALL' ? academicYear : undefined
    },
    user
  );

  // Filter exams by targetClassId if evaluating in bulk-class context and exam exists for that class
  const scopedExams = targetClassId
    ? (yearExams.some(e => e.historicalClassId === targetClassId)
        ? yearExams.filter(e => e.historicalClassId === targetClassId)
        : yearExams)
    : yearExams;

  const finalExams = scopedExams.filter(e => e.examType === 'Final');
  const midtermExams = scopedExams.filter(e => e.examType === 'Midterm');
  const promotions = Data.getPromotionHistory(student.id).filter(
    p => !academicYear || academicYear === 'ALL' || p.academicYear === academicYear
  );

  const relevantPromotion = targetClassId
    ? promotions.find(p => p.previousClassId === targetClassId) || promotions[0] || null
    : promotions[0] || null;

  const displayClassName =
    (scopedExams[0] && scopedExams[0].historicalClassName) ||
    (targetClassId && (classes.find(c => c.id === targetClassId) || {}).name) ||
    currentClassName;

  if (certificateType === 'academic-completion') {
    const hasFinal = finalExams.length > 0;
    const hasPromo = !!relevantPromotion;
    if (!hasFinal && !hasPromo) {
      return {
        eligible: false,
        reason: `No Final Examination marks or promotion record found for ${academicYear}.`,
        details: null
      };
    }

    const latestFinal = finalExams[finalExams.length - 1] || null;
    const promoToClass = relevantPromotion
      ? (classes.find(c => c.id === relevantPromotion.newClassId) || {}).name || relevantPromotion.newClassId
      : null;

    const statement = hasPromo
      ? `This certifies that ${student.fullName} (Student ID: ${student.id}) successfully completed ${displayClassName} during Academic Year ${academicYear} and is recorded as promoted to ${promoToClass}.`
      : `This certifies that ${student.fullName} (Student ID: ${student.id}) successfully completed the registered Final Examination assessments for ${displayClassName} during Academic Year ${academicYear}.`;

    const verifiedFacts = [
      { label: 'Class / Level', value: displayClassName },
      { label: 'Academic Year', value: academicYear }
    ];
    if (latestFinal) {
      verifiedFacts.push({
        label: 'Final Exam Record',
        value: `${latestFinal.term} (${latestFinal.totalMarks} / ${latestFinal.maxPossibleTotal})`
      });
    }
    if (promoToClass) {
      verifiedFacts.push({ label: 'Promoted To', value: promoToClass });
    }

    return {
      eligible: true,
      reason: hasPromo ? 'Verified Final Exam & Promotion record' : 'Verified Final Examination record',
      details: {
        certificateTitle: 'ACADEMIC YEAR COMPLETION CERTIFICATE',
        displayClassName,
        academicYear,
        statement,
        verifiedFacts
      }
    };
  }

  if (certificateType === 'academic-achievement') {
    if (finalExams.length === 0) {
      return {
        eligible: false,
        reason: `Final Examination marks are required for an Achievement Certificate (${academicYear}).`,
        details: null
      };
    }

    const latestFinal = finalExams[finalExams.length - 1];
    const rankingRes = Data.calculateRankings(
      latestFinal.historicalClassId,
      latestFinal.academicYear,
      latestFinal.term,
      user
    );
    const rankedStudent = (rankingRes.results || []).find(r => r.studentId === student.id) || null;

    const scoreSummary = rankedStudent && rankedStudent.hasScores
      ? `with a verified combined score of ${rankedStudent.combinedTotal}${rankedStudent.position ? ` (Class Position #${rankedStudent.position})` : ''}`
      : `with a recorded Final Examination total of ${latestFinal.totalMarks} / ${latestFinal.maxPossibleTotal}`;

    const statement = `This is to certify that ${student.fullName} (Student ID: ${student.id}) of ${displayClassName} completed the ${latestFinal.term} examinations for Academic Year ${latestFinal.academicYear} ${scoreSummary}.`;

    const verifiedFacts = [
      { label: 'Class / Level', value: displayClassName },
      { label: 'Academic Term', value: `${latestFinal.academicYear} · ${latestFinal.term}` },
      { label: 'Final Exam Total', value: `${latestFinal.totalMarks} / ${latestFinal.maxPossibleTotal}` }
    ];
    if (rankedStudent && rankedStudent.hasScores && rankedStudent.position) {
      verifiedFacts.push({
        label: 'Verified Class Position',
        value: `#${rankedStudent.position} (Combined: ${rankedStudent.combinedTotal})`
      });
    }

    return {
      eligible: true,
      reason: 'Verified Final Examination & Ranking records',
      details: {
        certificateTitle: 'EXAMINATION ACHIEVEMENT CERTIFICATE',
        displayClassName,
        academicYear: latestFinal.academicYear,
        statement,
        verifiedFacts
      }
    };
  }

  if (certificateType === 'enrollment-progress') {
    if (scopedExams.length === 0) {
      return {
        eligible: false,
        reason: `No Midterm or Final examination records found for ${academicYear}.`,
        details: null
      };
    }

    const sessionLabels = scopedExams.map(e => `${e.term} ${e.examType}`);
    const uniqueSessions = Array.from(new Set(sessionLabels));

    const statement = `This certifies that ${student.fullName} (Student ID: ${student.id}) is an active registered student in ${displayClassName} at MADARASATUL AL-IMAAM during Academic Year ${academicYear}, with verified examination participation in ${uniqueSessions.join(', ')}.`;

    const verifiedFacts = [
      { label: 'Class / Level', value: displayClassName },
      { label: 'Academic Year', value: academicYear },
      { label: 'Recorded Assessments', value: `${scopedExams.length} Session(s)` },
      { label: 'Sessions Completed', value: uniqueSessions.join(', ') }
    ];

    return {
      eligible: true,
      reason: `${scopedExams.length} verified exam session(s) recorded (${midtermExams.length} Midterm, ${finalExams.length} Final)`,
      details: {
        certificateTitle: 'ACADEMIC PROGRESS & ENROLLMENT CERTIFICATE',
        displayClassName,
        academicYear,
        statement,
        verifiedFacts
      }
    };
  }

  if (certificateType === 'attendance-standing') {
    const attRecords = Data.getAttendance({ studentId: student.id });
    if (attRecords.length === 0) {
      return {
        eligible: false,
        reason: 'No attendance records found for this student.',
        details: null
      };
    }

    const present = attRecords.filter(r => r.status === 'Present').length;
    const excused = attRecords.filter(r => r.status === 'Excused').length;
    const absent = attRecords.filter(r => r.status === 'Absent').length;
    const total = attRecords.length;

    const statement = `This certifies that ${student.fullName} (Student ID: ${student.id}) of ${displayClassName} has verified attendance records at MADARASATUL AL-IMAAM for Academic Year ${academicYear}, recording ${present} Present, ${excused} Excused, and ${absent} Absent out of ${total} recorded school day(s).`;

    const verifiedFacts = [
      { label: 'Class / Level', value: displayClassName },
      { label: 'Academic Year', value: academicYear },
      { label: 'Present / Total Days', value: `${present} / ${total} Recorded` },
      { label: 'Excused / Absent', value: `${excused} Excused · ${absent} Absent` }
    ];

    return {
      eligible: true,
      reason: `${present}/${total} recorded days Present`,
      details: {
        certificateTitle: 'ATTENDANCE & REGULARITY CERTIFICATE',
        displayClassName,
        academicYear,
        statement,
        verifiedFacts
      }
    };
  }

  return { eligible: false, reason: 'Unsupported certificate type.', details: null };
}

/**
 * Builds structured, strictly verified Academic Transcript data for a student.
 * Preserves historical class names on each exam row while displaying current class in header.
 */
export function buildTranscriptData(studentId, academicYearFilter = 'ALL', user = null) {
  const student = Data.getStudentById(studentId);
  if (!student) return null;

  const classes = Data.getClasses();
  const currentCls = classes.find(c => c.id === student.classId);
  const currentClassName = currentCls ? currentCls.name : 'Unassigned';

  const yearArg = academicYearFilter && academicYearFilter !== 'ALL' ? academicYearFilter : undefined;
  const rawExams = Data.getStudentHistoricalExams(
    {
      studentId: student.id,
      academicYear: yearArg
    },
    user
  );

  // Order chronologically: Academic Year asc, Term asc (Term 1, Term 2, Term 3), Midterm before Final
  const examTypeOrder = { Midterm: 1, Final: 2 };
  const sortedExams = [...rawExams].sort((a, b) => {
    const yCmp = String(a.academicYear || '').localeCompare(String(b.academicYear || ''));
    if (yCmp !== 0) return yCmp;
    const tCmp = String(a.term || '').localeCompare(String(b.term || ''));
    if (tCmp !== 0) return tCmp;
    return (examTypeOrder[a.examType] || 9) - (examTypeOrder[b.examType] || 9);
  });

  // Group into sessions preserving historicalClassName and subject rows
  const sessions = sortedExams.map(ex => {
    const subjectRows = (ex.subjectRows || []).map(sr => ({
      subjectId: sr.subjectId,
      subjectName: sr.subjectName,
      subjectCode: sr.subjectCode || '',
      marksObtained: sr.score !== null && sr.score !== undefined && !isNaN(sr.score) ? sr.score : null,
      maxMarks: sr.maxMarks || 100
    }));

    return {
      examId: ex.examId,
      academicYear: ex.academicYear,
      term: ex.term,
      historicalClassId: ex.historicalClassId,
      historicalClassName: ex.historicalClassName,
      examType: ex.examType,
      recordedDate: ex.recordedDate || '',
      subjectRows,
      activityScore: ex.activityScore !== null && ex.activityScore !== undefined ? ex.activityScore : null,
      totalMarks: ex.totalMarks,
      maxPossibleTotal: ex.maxPossibleTotal
    };
  });

  // Determine Academic Year header label
  const distinctYears = Array.from(new Set(sessions.map(s => s.academicYear).filter(Boolean)));
  const academicYearLabel = yearArg
    ? yearArg
    : distinctYears.length > 0
      ? distinctYears.join(', ')
      : 'All Available Academic Years';

  return {
    student,
    studentName: student.fullName,
    studentId: student.id,
    gender: student.gender,
    currentClassName,
    academicYearFilter: academicYearFilter || 'ALL',
    academicYearLabel,
    eligible: sessions.length > 0,
    reason: sessions.length > 0
      ? `${sessions.length} verified examination session(s) on record`
      : `No examination records found${yearArg ? ` for ${yearArg}` : ''}.`,
    sessions
  };
}

export const CertificatesView = {
  state: {
    section: 'certificates', // 'certificates' | 'transcripts'
    mode: 'bulk', // 'bulk' | 'individual'
    academicYear: '',
    transcriptYearFilter: 'ALL',
    classId: '',
    certificateType: 'academic-completion',
    selectedIds: new Set(),
    previewMode: 'selected-batch', // 'selected-batch' | 'single-from-bulk'
    previewSingleId: '',
    individualSearch: '',
    individualStudentId: '',
    issueDate: ''
  },

  render(container) {
    const user = Auth.getCurrentUser();
    if (!Permissions.canAccessCertificates(user)) {
      container.innerHTML = `
        <div class="bg-white border border-rose-200 rounded-xl p-8 text-center max-w-lg mx-auto mt-10">
          <div class="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3">
            ${Components.icon('lock', 'w-6 h-6')}
          </div>
          <h2 class="text-base font-bold text-slate-900">Access Restricted</h2>
          <p class="text-xs text-slate-500 mt-1">Only School Administrators can access Student Certificates & Academic Transcripts.</p>
        </div>
      `;
      return;
    }

    const years = getAvailableAcademicYears();
    const classes = Data.getClasses();
    const students = Data.getStudents();
    const settings = Data.getSettings();

    if (!this.state.academicYear) {
      this.state.academicYear = settings.academicYear || years[0] || '2026-2027';
    }
    if (!this.state.classId && classes.length > 0) {
      this.state.classId = classes[0].id;
    }
    if (!this.state.issueDate) {
      this.state.issueDate = new Date().toISOString().split('T')[0];
    }
    if (!this.state.individualStudentId && students.length > 0) {
      this.state.individualStudentId = students[0].id;
    }

    this._renderLayout(container, user);
  },

  _getEvaluatedBulkList(user) {
    const { section, classId, academicYear, transcriptYearFilter, certificateType } = this.state;
    const candidates = buildClassBulkStudents(classId, section === 'certificates' ? academicYear : transcriptYearFilter);

    return candidates.map(student => {
      if (section === 'certificates') {
        const evalRes = evaluateCertificateEligibility(student, certificateType, academicYear, classId, user);
        return {
          student,
          eligible: evalRes.eligible,
          reason: evalRes.reason,
          certificateDetails: evalRes.details
        };
      }
      const transcript = buildTranscriptData(student.id, transcriptYearFilter, user);
      return {
        student,
        eligible: !!(transcript && transcript.eligible),
        reason: transcript ? transcript.reason : 'No transcript records available.',
        transcriptData: transcript
      };
    });
  },

  _syncBulkSelectionDefaults(evaluatedList) {
    const eligibleIds = evaluatedList.filter(item => item.eligible).map(item => item.student.id);
    const validSet = new Set(eligibleIds);
    // Keep any valid user choices; if selection wasn't initialized for current filter context, select all eligible
    const pruned = new Set([...this.state.selectedIds].filter(id => validSet.has(id)));
    if (this._selectionResetRequired) {
      this.state.selectedIds = new Set(eligibleIds);
      this._selectionResetRequired = false;
    } else {
      this.state.selectedIds = pruned;
    }
  },

  _renderLayout(container, user) {
    const settings = Data.getSettings();
    const classes = Data.getClasses();
    const years = getAvailableAcademicYears();
    const isCert = this.state.section === 'certificates';
    const isBulk = this.state.mode === 'bulk';

    let evaluatedList = [];
    let eligibleList = [];
    let selectedItems = [];
    let previewItems = [];

    if (isBulk) {
      evaluatedList = this._getEvaluatedBulkList(user);
      this._syncBulkSelectionDefaults(evaluatedList);
      eligibleList = evaluatedList.filter(i => i.eligible);
      selectedItems = eligibleList.filter(i => this.state.selectedIds.has(i.student.id));

      if (this.state.previewMode === 'single-from-bulk' && this.state.previewSingleId) {
        const singleHit = eligibleList.find(i => i.student.id === this.state.previewSingleId);
        previewItems = singleHit ? [singleHit] : selectedItems;
      } else {
        previewItems = selectedItems;
      }
    } else {
      // Individual mode
      const allStudents = Data.getStudents();
      const q = (this.state.individualSearch || '').trim().toLowerCase();
      const matchingStudents = q
        ? allStudents.filter(
            s => s.id.toLowerCase().includes(q) || s.fullName.toLowerCase().includes(q)
          )
        : allStudents;

      if (matchingStudents.length > 0 && !matchingStudents.some(s => s.id === this.state.individualStudentId)) {
        this.state.individualStudentId = matchingStudents[0].id;
      }

      const activeStudent = allStudents.find(s => s.id === this.state.individualStudentId) || null;
      if (activeStudent) {
        if (isCert) {
          const evalRes = evaluateCertificateEligibility(
            activeStudent,
            this.state.certificateType,
            this.state.academicYear,
            null,
            user
          );
          if (evalRes.eligible) {
            previewItems = [
              {
                student: activeStudent,
                eligible: true,
                reason: evalRes.reason,
                certificateDetails: evalRes.details
              }
            ];
          }
          this._individualEval = evalRes;
        } else {
          const transcript = buildTranscriptData(activeStudent.id, this.state.transcriptYearFilter, user);
          if (transcript && transcript.eligible) {
            previewItems = [
              {
                student: activeStudent,
                eligible: true,
                reason: transcript.reason,
                transcriptData: transcript
              }
            ];
          }
          this._individualEval = transcript;
        }
      } else {
        this._individualEval = null;
      }
      this._matchingStudents = matchingStudents;
    }

    const activeClassObj = classes.find(c => c.id === this.state.classId);

    container.innerHTML = `
      <div class="space-y-6">
        <!-- Module Header -->
        <div class="no-print flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded bg-blue-900 text-amber-300 text-[10px] font-bold uppercase tracking-wider">Admin Only</span>
              <span class="text-xs text-slate-400 font-semibold">${escapeHtml(settings.institutionName || 'MADARASATUL AL-IMAAM')}</span>
            </div>
            <h1 class="text-xl font-extrabold text-blue-900 tracking-tight mt-1">Certificates &amp; Academic Transcripts</h1>
            <p class="text-xs text-slate-500 mt-0.5">Generate, verify, print, and export official student certificates and formal examination transcripts.</p>
          </div>

          <!-- Top Section Switcher -->
          <div class="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200 self-start">
            <button
              type="button"
              id="tab-section-certificates"
              class="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                isCert ? 'bg-blue-900 text-white shadow-xs' : 'text-slate-600 hover:text-blue-900'
              }"
            >
              ${Components.icon('award', 'w-4 h-4')}
              <span>Student Certificates</span>
            </button>
            <button
              type="button"
              id="tab-section-transcripts"
              class="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                !isCert ? 'bg-blue-900 text-white shadow-xs' : 'text-slate-600 hover:text-blue-900'
              }"
            >
              ${Components.icon('scroll-text', 'w-4 h-4')}
              <span>Academic Transcripts</span>
            </button>
          </div>
        </div>

        <!-- Method Switcher + Configuration Panel -->
        <div class="no-print bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <!-- Method Tabs -->
          <div class="px-4 sm:px-5 py-3 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <button
                type="button"
                id="tab-mode-bulk"
                class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                  isBulk
                    ? 'bg-blue-50 text-blue-900 border-blue-300 shadow-2xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }"
              >
                ${Components.icon('users', 'w-3.5 h-3.5')}
                <span>Option 1: Print by Class (Bulk)</span>
              </button>
              <button
                type="button"
                id="tab-mode-individual"
                class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                  !isBulk
                    ? 'bg-blue-50 text-blue-900 border-blue-300 shadow-2xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }"
              >
                ${Components.icon('user', 'w-3.5 h-3.5')}
                <span>Option 2: Individual Student</span>
              </button>
            </div>

            <div class="flex items-center gap-2 text-xs">
              <label class="font-semibold text-slate-500">Issue Date:</label>
              <input
                type="date"
                id="cert-issue-date"
                value="${escapeHtml(this.state.issueDate)}"
                class="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
            </div>
          </div>

          <!-- Controls Grid -->
          <div class="p-4 sm:p-5 space-y-4">
            ${isBulk ? this._renderBulkControlsHtml(years, classes, isCert) : this._renderIndividualControlsHtml(years, isCert)}
          </div>
        </div>

        ${isBulk ? this._renderBulkEligibilityPanelHtml(evaluatedList, eligibleList, selectedItems, activeClassObj) : this._renderIndividualStatusBannerHtml()}

        <!-- Preview & Action Bar -->
        <div class="space-y-4">
          <div class="no-print bg-white border border-slate-200 rounded-xl px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-lg bg-blue-50 text-blue-800 flex items-center justify-center shrink-0">
                ${Components.icon(isCert ? 'award' : 'scroll-text', 'w-4 h-4')}
              </div>
              <div>
                <h2 class="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  ${isCert ? 'Official Certificate Preview' : 'Official Academic Transcript Preview'}
                </h2>
                <p class="text-[11px] text-slate-500">
                  ${
                    previewItems.length > 0
                      ? `${previewItems.length} document(s) ready · A4 Portrait · 1 student per document`
                      : 'No eligible document selected for preview.'
                  }
                </p>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              ${isBulk && this.state.previewMode === 'single-from-bulk' && selectedItems.length > 0 ? `
                <button
                  type="button"
                  id="btn-show-full-batch"
                  class="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-800 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  ${Components.icon('eye', 'w-3.5 h-3.5')}
                  <span>Preview All Selected (${selectedItems.length})</span>
                </button>
              ` : ''}
              <button
                type="button"
                id="btn-print-documents"
                ${previewItems.length === 0 ? 'disabled' : ''}
                class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
              >
                ${Components.icon('printer', 'w-3.5 h-3.5')}
                <span>${isBulk ? `Print (${previewItems.length})` : 'Print Document'}</span>
              </button>
              <button
                type="button"
                id="btn-download-pdf"
                ${previewItems.length === 0 ? 'disabled' : ''}
                class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg shadow-xs disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
              >
                ${Components.icon('download', 'w-3.5 h-3.5')}
                <span>${isBulk ? `Download Combined PDF (${previewItems.length})` : 'Download PDF'}</span>
              </button>
            </div>
          </div>

          <!-- Printable Documents Stage -->
          <div class="printable-area doc-print-root space-y-6">
            ${
              previewItems.length > 0
                ? previewItems
                    .map((item, idx) => {
                      const docHtml = isCert
                        ? this._renderCertificateSheetHtml(item, settings, idx, previewItems.length)
                        : this._renderTranscriptSheetHtml(item, settings, user, idx, previewItems.length);
                      const breakHtml = idx < previewItems.length - 1 ? '<div class="doc-page-break"></div>' : '';
                      return docHtml + breakHtml;
                    })
                    .join('')
                : `
                  <div class="no-print bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center">
                    <div class="w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                      ${Components.icon('file-text', 'w-6 h-6')}
                    </div>
                    <h3 class="text-sm font-bold text-slate-800">No Eligible Document to Preview</h3>
                    <p class="text-xs text-slate-500 max-w-md mx-auto mt-1">
                      ${
                        isBulk
                          ? 'Select at least one eligible student from the class list above, or adjust the Academic Year / Class / Type filters.'
                          : 'The selected student does not yet meet the verified record requirements for this selection.'
                      }
                    </p>
                  </div>
                `
            }
          </div>
        </div>
      </div>
    `;

    this._bindEvents(container, user, evaluatedList, previewItems);
  },

  _renderBulkControlsHtml(years, classes, isCert) {
    return `
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
        <div>
          <label class="block font-semibold text-slate-700 mb-1.5">Academic Year</label>
          <select id="bulk-year-select" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-medium text-slate-800 focus:ring-2 focus:ring-blue-600 focus:outline-none">
            ${!isCert ? `<option value="ALL" ${this.state.transcriptYearFilter === 'ALL' ? 'selected' : ''}>All Available Academic Years</option>` : ''}
            ${years.map(y => {
              const selected = isCert ? this.state.academicYear === y : this.state.transcriptYearFilter === y;
              return `<option value="${escapeHtml(y)}" ${selected ? 'selected' : ''}>${escapeHtml(y)}</option>`;
            }).join('')}
          </select>
        </div>

        <div>
          <label class="block font-semibold text-slate-700 mb-1.5">Class</label>
          <select id="bulk-class-select" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-medium text-slate-800 focus:ring-2 focus:ring-blue-600 focus:outline-none">
            ${classes.map(c => `
              <option value="${escapeHtml(c.id)}" ${this.state.classId === c.id ? 'selected' : ''}>${escapeHtml(c.name)} (${escapeHtml(c.section || 'A')})</option>
            `).join('')}
          </select>
        </div>

        ${isCert ? `
          <div>
            <label class="block font-semibold text-slate-700 mb-1.5">Certificate Type</label>
            <select id="bulk-cert-type-select" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-medium text-slate-800 focus:ring-2 focus:ring-blue-600 focus:outline-none">
              ${CERTIFICATE_TYPES.map(ct => `
                <option value="${escapeHtml(ct.id)}" ${this.state.certificateType === ct.id ? 'selected' : ''}>${escapeHtml(ct.title)}</option>
              `).join('')}
            </select>
          </div>
        ` : `
          <div class="flex items-end">
            <div class="w-full px-3 py-2 bg-blue-50/70 border border-blue-100 rounded-lg text-[11px] text-blue-900">
              <span class="font-bold block">Transcript Verification Rule</span>
              <span>Students with recorded Midterm or Final exam marks are included automatically; students without records are excluded.</span>
            </div>
          </div>
        `}
      </div>
      ${isCert ? `
        <div class="px-3.5 py-2.5 bg-blue-50/70 border border-blue-100 rounded-lg text-[11px] text-blue-900 flex items-center gap-2">
          <span class="text-blue-700 shrink-0">${Components.icon('info', 'w-4 h-4')}</span>
          <span><strong>Eligibility Rule:</strong> ${escapeHtml((CERTIFICATE_TYPES.find(t => t.id === this.state.certificateType) || {}).description || '')}</span>
        </div>
      ` : ''}
    `;
  },

  _renderIndividualControlsHtml(years, isCert) {
    const matching = this._matchingStudents || Data.getStudents();
    const classes = Data.getClasses();

    return `
      <div class="grid grid-cols-1 md:grid-cols-12 gap-4 text-xs">
        <div class="md:col-span-4">
          <label class="block font-semibold text-slate-700 mb-1.5">Search Student (ID or Name)</label>
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">${Components.icon('search', 'w-3.5 h-3.5')}</span>
            <input
              type="text"
              id="ind-student-search"
              value="${escapeHtml(this.state.individualSearch)}"
              placeholder="e.g. STD-1001 or Ayan..."
              class="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg font-medium text-slate-800 focus:ring-2 focus:ring-blue-600 focus:outline-none"
            />
          </div>
        </div>

        <div class="${isCert ? 'md:col-span-3' : 'md:col-span-5'}">
          <label class="block font-semibold text-slate-700 mb-1.5">Select Student (${matching.length} matched)</label>
          <select id="ind-student-select" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-medium text-slate-800 focus:ring-2 focus:ring-blue-600 focus:outline-none">
            ${matching.length === 0
              ? '<option value="">No matching student found</option>'
              : matching.map(s => {
                  const clsName = (classes.find(c => c.id === s.classId) || {}).name || 'Unassigned';
                  return `<option value="${escapeHtml(s.id)}" ${this.state.individualStudentId === s.id ? 'selected' : ''}>${escapeHtml(s.id)} — ${escapeHtml(s.fullName)} (${escapeHtml(clsName)})</option>`;
                }).join('')}
          </select>
        </div>

        <div class="md:col-span-2">
          <label class="block font-semibold text-slate-700 mb-1.5">Academic Year</label>
          <select id="ind-year-select" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-medium text-slate-800 focus:ring-2 focus:ring-blue-600 focus:outline-none">
            ${!isCert ? `<option value="ALL" ${this.state.transcriptYearFilter === 'ALL' ? 'selected' : ''}>All Academic Years</option>` : ''}
            ${years.map(y => {
              const selected = isCert ? this.state.academicYear === y : this.state.transcriptYearFilter === y;
              return `<option value="${escapeHtml(y)}" ${selected ? 'selected' : ''}>${escapeHtml(y)}</option>`;
            }).join('')}
          </select>
        </div>

        ${isCert ? `
          <div class="md:col-span-3">
            <label class="block font-semibold text-slate-700 mb-1.5">Certificate Type</label>
            <select id="ind-cert-type-select" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-medium text-slate-800 focus:ring-2 focus:ring-blue-600 focus:outline-none">
              ${CERTIFICATE_TYPES.map(ct => `
                <option value="${escapeHtml(ct.id)}" ${this.state.certificateType === ct.id ? 'selected' : ''}>${escapeHtml(ct.title)}</option>
              `).join('')}
            </select>
          </div>
        ` : ''}
      </div>
    `;
  },

  _renderBulkEligibilityPanelHtml(evaluatedList, eligibleList, selectedItems, activeClassObj) {
    const totalCount = evaluatedList.length;
    const eligibleCount = eligibleList.length;
    const ineligibleCount = totalCount - eligibleCount;

    return `
      <div class="no-print bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div class="px-4 sm:px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 class="text-xs font-bold text-slate-900 uppercase tracking-wider">
              ${escapeHtml(activeClassObj ? activeClassObj.name : 'Selected Class')} — Eligibility Roster
            </h3>
            <p class="text-[11px] text-slate-600 mt-0.5">
              <strong class="text-emerald-700">${eligibleCount} of ${totalCount} student(s) eligible</strong>
              · <strong class="text-blue-900">${selectedItems.length} selected for batch</strong>
              ${ineligibleCount > 0 ? `· <span class="text-amber-700 font-medium">${ineligibleCount} excluded (ineligible)</span>` : ''}
            </p>
          </div>

          <div class="flex items-center gap-2">
            <button
              type="button"
              id="btn-select-all-eligible"
              ${eligibleCount === 0 ? 'disabled' : ''}
              class="px-3 py-1.5 text-xs font-semibold text-blue-900 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-45"
            >
              Select All Eligible (${eligibleCount})
            </button>
            <button
              type="button"
              id="btn-deselect-all"
              ${selectedItems.length === 0 ? 'disabled' : ''}
              class="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-45"
            >
              Clear Selection
            </button>
          </div>
        </div>

        ${
          evaluatedList.length === 0
            ? `<div class="p-6 text-center text-xs text-slate-500">No students are enrolled or recorded in this class for the selected period.</div>`
            : `
              <div class="max-h-72 overflow-y-auto divide-y divide-slate-100">
                ${evaluatedList
                  .map(item => {
                    const st = item.student;
                    const isSelected = item.eligible && this.state.selectedIds.has(st.id);
                    return `
                      <div class="px-4 sm:px-5 py-2.5 flex items-center justify-between gap-3 ${item.eligible ? 'bg-white hover:bg-slate-50/70' : 'bg-slate-50/80 opacity-80'}">
                        <div class="flex items-center gap-3 min-w-0">
                          <input
                            type="checkbox"
                            class="bulk-student-checkbox w-4 h-4 rounded border-slate-300 text-blue-900 focus:ring-blue-600 ${item.eligible ? 'cursor-pointer' : 'cursor-not-allowed'}"
                            data-student-id="${escapeHtml(st.id)}"
                            ${isSelected ? 'checked' : ''}
                            ${item.eligible ? '' : 'disabled'}
                          />
                          <div class="min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                              <span class="font-mono text-[11px] font-bold text-blue-900">${escapeHtml(st.id)}</span>
                              <span class="text-xs font-bold text-slate-900 truncate">${escapeHtml(st.fullName)}</span>
                              ${
                                item.eligible
                                  ? `<span class="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">Eligible</span>`
                                  : `<span class="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold">Ineligible · Excluded</span>`
                              }
                            </div>
                            <p class="text-[11px] text-slate-500 truncate mt-0.5">${escapeHtml(item.reason)}</p>
                          </div>
                        </div>

                        ${
                          item.eligible
                            ? `
                              <button
                                type="button"
                                class="btn-preview-single shrink-0 px-2.5 py-1 text-[11px] font-semibold text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors"
                                data-student-id="${escapeHtml(st.id)}"
                              >
                                Preview
                              </button>
                            `
                            : ''
                        }
                      </div>
                    `;
                  })
                  .join('')}
              </div>
            `
        }
      </div>
    `;
  },

  _renderIndividualStatusBannerHtml() {
    const ev = this._individualEval;
    if (!ev) return '';
    if (ev.eligible) {
      return `
        <div class="no-print px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2.5">
          <span class="text-emerald-600 shrink-0">${Components.icon('check-circle', 'w-4 h-4')}</span>
          <span><strong>Verified Eligible:</strong> ${escapeHtml(ev.reason)}</span>
        </div>
      `;
    }
    return `
      <div class="no-print px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2.5">
        <span class="text-amber-600 shrink-0">${Components.icon('alert-circle', 'w-4 h-4')}</span>
        <span><strong>Not Eligible:</strong> ${escapeHtml(ev.reason)}</span>
      </div>
    `;
  },

  _renderCertificateSheetHtml(item, settings, idx, totalDocs) {
    const st = item.student;
    const details = item.certificateDetails;
    const instName = settings.institutionName || 'MADARASATUL AL-IMAAM';
    const address = settings.address || 'Hargeisa, Somaliland';
    const phone = settings.contactPhone || '063-4129440';
    const issueDate = this.state.issueDate || new Date().toISOString().split('T')[0];

    return `
      <section
        class="doc-sheet cert-sheet bg-white mx-auto max-w-[794px] border-2 border-blue-900 rounded-lg shadow-sm overflow-hidden print:rounded-none print:shadow-none"
        data-student-id="${escapeHtml(st.id)}"
        data-doc-index="${idx}"
      >
        <div class="p-3 sm:p-4 bg-white">
          <!-- Ornamental Double Gold Frame -->
          <div class="border-[3px] border-amber-500 p-1.5">
            <div class="border border-blue-900/40 px-6 sm:px-10 py-7 sm:py-9 relative bg-white">
              <!-- Subtle Top Header Band -->
              <div class="flex flex-col items-center text-center border-b-2 border-blue-900 pb-5">
                ${Components.getLogoHtml('w-20 h-20 shadow-sm')}
                <p class="mt-3 text-[10px] font-bold uppercase tracking-[0.22em] text-amber-600">AL-IMAAMA · OFFICIAL SCHOOL SYSTEM</p>
                <h2 class="mt-1 text-2xl sm:text-[26px] font-extrabold tracking-tight text-blue-900 uppercase">${escapeHtml(instName)}</h2>
                <p class="text-xs text-slate-600 font-medium mt-0.5">${escapeHtml(address)} · Tel: ${escapeHtml(phone)}</p>
              </div>

              <!-- Document Title Banner -->
              <div class="mt-6 text-center">
                <div class="inline-block px-6 py-2 bg-blue-900 text-amber-300 border border-amber-400 rounded-md">
                  <span class="text-xs sm:text-sm font-extrabold uppercase tracking-[0.18em] block">STUDENT CERTIFICATE</span>
                </div>
                <p class="mt-2.5 text-xs font-bold uppercase tracking-widest text-blue-800">${escapeHtml(details.certificateTitle)}</p>
              </div>

              <!-- Attestation Body -->
              <div class="mt-7 text-center space-y-4">
                <p class="text-xs uppercase tracking-[0.18em] text-slate-500 font-semibold">This is proudly awarded to</p>
                <div class="py-2 border-b-2 border-amber-400 max-w-lg mx-auto">
                  <h3 class="text-2xl sm:text-3xl font-extrabold text-blue-950 tracking-tight">${escapeHtml(st.fullName)}</h3>
                </div>

                <!-- Key Student Metadata Row -->
                <div class="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-700 pt-1">
                  <span><strong class="text-blue-900">Student ID:</strong> <span class="font-mono font-bold">${escapeHtml(st.id)}</span></span>
                  <span class="text-slate-300">|</span>
                  <span><strong class="text-blue-900">Class / Grade:</strong> ${escapeHtml(details.displayClassName)}</span>
                  <span class="text-slate-300">|</span>
                  <span><strong class="text-blue-900">Academic Year:</strong> ${escapeHtml(details.academicYear)}</span>
                </div>

                <!-- Verified Statement -->
                <p class="max-w-xl mx-auto text-xs sm:text-[13px] leading-relaxed text-slate-700 pt-2">
                  ${escapeHtml(details.statement)}
                </p>
              </div>

              <!-- Verified Records Summary Grid -->
              <div class="mt-7 grid grid-cols-2 sm:grid-cols-${Math.min(4, Math.max(2, details.verifiedFacts.length))} gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3.5">
                ${details.verifiedFacts
                  .map(
                    fact => `
                    <div class="text-center px-2">
                      <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">${escapeHtml(fact.label)}</span>
                      <span class="block text-xs font-bold text-blue-950 mt-0.5">${escapeHtml(fact.value)}</span>
                    </div>
                  `
                  )
                  .join('')}
              </div>

              <!-- Footer Signatures, Stamp & Date of Issue -->
              <div class="mt-10 pt-6 border-t border-slate-200 grid grid-cols-3 gap-4 items-end text-center text-xs">
                <div>
                  <p class="font-bold text-slate-900 tabular-nums pb-1.5 border-b border-slate-400">${escapeHtml(issueDate)}</p>
                  <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-1.5">Date of Issue</span>
                </div>

                <div class="flex flex-col items-center">
                  <div class="w-24 h-14 border-2 border-dashed border-amber-500/70 rounded-full flex items-center justify-center text-[9px] font-bold uppercase tracking-wider text-amber-700 leading-tight px-2">
                    Official School Stamp
                  </div>
                </div>

                <div>
                  <div class="h-6 border-b border-slate-400"></div>
                  <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-1.5">Principal / Authorized Signature</span>
                </div>
              </div>

              ${totalDocs > 1 ? `
                <div class="no-print mt-4 text-right text-[10px] font-mono text-slate-400">
                  Document ${idx + 1} of ${totalDocs}
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      </section>
    `;
  },

  _renderTranscriptSheetHtml(item, settings, user, idx, totalDocs) {
    const t = item.transcriptData;
    const instName = settings.institutionName || 'MADARASATUL AL-IMAAM';
    const address = settings.address || 'Hargeisa, Somaliland';
    const phone = settings.contactPhone || '063-4129440';
    const issueDate = this.state.issueDate || new Date().toISOString().split('T')[0];
    const preparedBy = user ? user.fullName : 'Administrator';

    const tableRowsHtml = [];
    t.sessions.forEach(session => {
      if (session.subjectRows.length === 0) {
        tableRowsHtml.push(`
          <tr>
            <td class="py-2 px-2.5 font-medium text-slate-800">${escapeHtml(session.academicYear)}</td>
            <td class="py-2 px-2.5 text-slate-700">${escapeHtml(session.term)}</td>
            <td class="py-2 px-2.5 font-semibold text-blue-900">${escapeHtml(session.historicalClassName)}</td>
            <td class="py-2 px-2.5 text-slate-800">${escapeHtml(session.examType)}</td>
            <td class="py-2 px-2.5 text-slate-500 italic">No subjects recorded</td>
            <td class="py-2 px-2.5 text-right tabular-nums text-slate-500">—</td>
            <td class="py-2 px-2.5 text-right tabular-nums text-slate-500">—</td>
          </tr>
        `);
      } else {
        session.subjectRows.forEach(sr => {
          const marksStr = sr.marksObtained !== null ? String(sr.marksObtained) : '—';
          tableRowsHtml.push(`
            <tr>
              <td class="py-1.5 px-2.5 font-medium text-slate-800">${escapeHtml(session.academicYear)}</td>
              <td class="py-1.5 px-2.5 text-slate-700">${escapeHtml(session.term)}</td>
              <td class="py-1.5 px-2.5 font-semibold text-blue-900">${escapeHtml(session.historicalClassName)}</td>
              <td class="py-1.5 px-2.5 text-slate-800">${escapeHtml(session.examType)}</td>
              <td class="py-1.5 px-2.5 font-medium text-slate-900">${escapeHtml(sr.subjectName)}${sr.subjectCode ? ` <span class="text-[10px] font-mono text-slate-400">(${escapeHtml(sr.subjectCode)})</span>` : ''}</td>
              <td class="py-1.5 px-2.5 text-right tabular-nums font-semibold ${sr.marksObtained === null ? 'text-slate-400' : 'text-slate-900'}">${marksStr}</td>
              <td class="py-1.5 px-2.5 text-right tabular-nums text-slate-600">${sr.maxMarks}</td>
            </tr>
          `);
        });
      }

      // Verified Exam Session Total Row
      const activityNote = session.activityScore !== null ? ` (incl. Activity: ${session.activityScore})` : '';
      tableRowsHtml.push(`
        <tr class="bg-blue-50/70 font-bold text-blue-950 border-t border-b border-blue-200">
          <td colspan="5" class="py-1.5 px-2.5 text-[11px] uppercase tracking-wider">
            Session Total — ${escapeHtml(session.academicYear)} · ${escapeHtml(session.term)} · ${escapeHtml(session.historicalClassName)} (${escapeHtml(session.examType)})${escapeHtml(activityNote)}
          </td>
          <td class="py-1.5 px-2.5 text-right tabular-nums">${session.totalMarks}</td>
          <td class="py-1.5 px-2.5 text-right tabular-nums">${session.maxPossibleTotal}</td>
        </tr>
      `);
    });

    return `
      <section
        class="doc-sheet transcript-sheet bg-white mx-auto max-w-[794px] border border-slate-300 border-t-4 border-t-blue-900 rounded-lg shadow-sm p-6 sm:p-8 print:border print:border-slate-300 print:rounded-none print:shadow-none"
        data-student-id="${escapeHtml(t.studentId)}"
        data-doc-index="${idx}"
      >
        <!-- Official Transcript Header -->
        <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-4 border-b-2 border-blue-900">
          <div class="flex items-center gap-3.5">
            ${Components.getLogoHtml('w-16 h-16')}
            <div>
              <span class="text-[10px] font-bold uppercase tracking-widest text-amber-600 block">AL-IMAAMA · OFFICIAL SCHOOL SYSTEM</span>
              <h2 class="text-lg font-extrabold text-blue-900 tracking-tight uppercase">${escapeHtml(instName)}</h2>
              <p class="text-xs text-slate-600">${escapeHtml(address)} · Tel: ${escapeHtml(phone)}</p>
            </div>
          </div>

          <div class="sm:text-right">
            <span class="inline-block px-3 py-1 bg-blue-900 text-amber-300 border border-amber-400/50 rounded-md text-[11px] font-extrabold uppercase tracking-wider">
              OFFICIAL ACADEMIC TRANSCRIPT
            </span>
            <p class="text-[11px] text-slate-600 mt-1.5 tabular-nums"><strong>Date of Issue:</strong> ${escapeHtml(issueDate)}</p>
            ${totalDocs > 1 ? `<p class="no-print text-[10px] font-mono text-slate-400 mt-0.5">Transcript ${idx + 1} of ${totalDocs}</p>` : ''}
          </div>
        </div>

        <!-- Student Information Box -->
        <div class="mt-5 grid grid-cols-2 sm:grid-cols-5 gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3.5 text-xs">
          <div class="col-span-2 sm:col-span-2">
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Student Name</span>
            <span class="block font-bold text-slate-900 mt-0.5">${escapeHtml(t.studentName)}</span>
          </div>
          <div>
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Student ID</span>
            <span class="block font-mono font-bold text-blue-900 mt-0.5">${escapeHtml(t.studentId)}</span>
          </div>
          <div>
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Gender</span>
            <span class="block font-semibold text-slate-800 mt-0.5">${escapeHtml(t.gender)}</span>
          </div>
          <div>
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Current Class</span>
            <span class="block font-semibold text-slate-900 mt-0.5">${escapeHtml(t.currentClassName)}</span>
          </div>
          <div class="col-span-2 sm:col-span-5 pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <span><strong class="text-slate-500 uppercase tracking-wider text-[10px]">Academic Year Covered:</strong> <strong class="text-blue-900">${escapeHtml(t.academicYearLabel)}</strong></span>
            <span class="text-slate-500">Note: Historical Class recorded at examination time is preserved per row; "—" indicates unrecorded marks.</span>
          </div>
        </div>

        <!-- 7-Column Academic Results Table -->
        <div class="mt-5 overflow-x-auto border border-slate-200 rounded-lg">
          <table class="w-full text-xs border-collapse">
            <thead>
              <tr class="bg-blue-900 text-white text-[11px] uppercase tracking-wider">
                <th class="py-2.5 px-2.5 text-left font-bold">Academic Year</th>
                <th class="py-2.5 px-2.5 text-left font-bold">Term</th>
                <th class="py-2.5 px-2.5 text-left font-bold">Class</th>
                <th class="py-2.5 px-2.5 text-left font-bold">Examination Type</th>
                <th class="py-2.5 px-2.5 text-left font-bold">Subject</th>
                <th class="py-2.5 px-2.5 text-right font-bold">Marks Obtained</th>
                <th class="py-2.5 px-2.5 text-right font-bold">Maximum Marks</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200">
              ${tableRowsHtml.join('')}
            </tbody>
          </table>
        </div>

        <!-- Official Transcript Footer -->
        <div class="mt-8 pt-5 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-4 items-end text-xs">
          <div>
            <p class="font-semibold text-slate-900 pb-1 border-b border-slate-300">${escapeHtml(preparedBy)}</p>
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-1">Prepared By</span>
          </div>
          <div>
            <p class="font-semibold text-slate-900 tabular-nums pb-1 border-b border-slate-300">${escapeHtml(issueDate)}</p>
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-1">Date of Issue</span>
          </div>
          <div class="flex justify-center">
            <div class="w-24 h-12 border-2 border-dashed border-amber-500/70 rounded-full flex items-center justify-center text-[9px] font-bold uppercase tracking-wider text-amber-700 text-center leading-tight px-2">
              Official School Stamp
            </div>
          </div>
          <div>
            <div class="h-5 border-b border-slate-300"></div>
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-1 text-center">Principal / Authorized Signature</span>
          </div>
        </div>
      </section>
    `;
  },

  _bindEvents(container, user, evaluatedList, previewItems) {
    const rerender = () => this._renderLayout(container, user);

    // Top section tabs
    const tabCert = document.getElementById('tab-section-certificates');
    const tabTrans = document.getElementById('tab-section-transcripts');
    if (tabCert) {
      tabCert.addEventListener('click', () => {
        if (this.state.section === 'certificates') return;
        this.state.section = 'certificates';
        this.state.previewMode = 'selected-batch';
        this._selectionResetRequired = true;
        rerender();
      });
    }
    if (tabTrans) {
      tabTrans.addEventListener('click', () => {
        if (this.state.section === 'transcripts') return;
        this.state.section = 'transcripts';
        this.state.previewMode = 'selected-batch';
        this._selectionResetRequired = true;
        rerender();
      });
    }

    // Method tabs
    const tabBulk = document.getElementById('tab-mode-bulk');
    const tabInd = document.getElementById('tab-mode-individual');
    if (tabBulk) {
      tabBulk.addEventListener('click', () => {
        if (this.state.mode === 'bulk') return;
        this.state.mode = 'bulk';
        this.state.previewMode = 'selected-batch';
        this._selectionResetRequired = true;
        rerender();
      });
    }
    if (tabInd) {
      tabInd.addEventListener('click', () => {
        if (this.state.mode === 'individual') return;
        this.state.mode = 'individual';
        rerender();
      });
    }

    // Issue Date
    const issueDateInput = document.getElementById('cert-issue-date');
    if (issueDateInput) {
      issueDateInput.addEventListener('change', (e) => {
        this.state.issueDate = e.target.value || new Date().toISOString().split('T')[0];
        rerender();
      });
    }

    // Bulk controls
    const bulkYear = document.getElementById('bulk-year-select');
    if (bulkYear) {
      bulkYear.addEventListener('change', (e) => {
        if (this.state.section === 'certificates') {
          this.state.academicYear = e.target.value;
        } else {
          this.state.transcriptYearFilter = e.target.value;
        }
        this.state.previewMode = 'selected-batch';
        this._selectionResetRequired = true;
        rerender();
      });
    }

    const bulkClass = document.getElementById('bulk-class-select');
    if (bulkClass) {
      bulkClass.addEventListener('change', (e) => {
        this.state.classId = e.target.value;
        this.state.previewMode = 'selected-batch';
        this._selectionResetRequired = true;
        rerender();
      });
    }

    const bulkCertType = document.getElementById('bulk-cert-type-select');
    if (bulkCertType) {
      bulkCertType.addEventListener('change', (e) => {
        this.state.certificateType = e.target.value;
        this.state.previewMode = 'selected-batch';
        this._selectionResetRequired = true;
        rerender();
      });
    }

    // Bulk roster selection
    const btnSelectAll = document.getElementById('btn-select-all-eligible');
    if (btnSelectAll) {
      btnSelectAll.addEventListener('click', () => {
        this.state.selectedIds = new Set(evaluatedList.filter(i => i.eligible).map(i => i.student.id));
        this.state.previewMode = 'selected-batch';
        rerender();
      });
    }

    const btnDeselectAll = document.getElementById('btn-deselect-all');
    if (btnDeselectAll) {
      btnDeselectAll.addEventListener('click', () => {
        this.state.selectedIds = new Set();
        this.state.previewMode = 'selected-batch';
        rerender();
      });
    }

    document.querySelectorAll('.bulk-student-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const stId = e.target.dataset.studentId;
        if (e.target.checked) {
          this.state.selectedIds.add(stId);
        } else {
          this.state.selectedIds.delete(stId);
        }
        this.state.previewMode = 'selected-batch';
        rerender();
      });
    });

    document.querySelectorAll('.btn-preview-single').forEach(btn => {
      btn.addEventListener('click', () => {
        const stId = btn.dataset.studentId;
        this.state.selectedIds.add(stId);
        this.state.previewMode = 'single-from-bulk';
        this.state.previewSingleId = stId;
        rerender();
      });
    });

    const btnShowFullBatch = document.getElementById('btn-show-full-batch');
    if (btnShowFullBatch) {
      btnShowFullBatch.addEventListener('click', () => {
        this.state.previewMode = 'selected-batch';
        this.state.previewSingleId = '';
        rerender();
      });
    }

    // Individual controls
    const indSearch = document.getElementById('ind-student-search');
    if (indSearch) {
      indSearch.addEventListener('input', (e) => {
        const caret = e.target.selectionStart;
        this.state.individualSearch = e.target.value;
        rerender();
        const freshInput = document.getElementById('ind-student-search');
        if (freshInput) {
          freshInput.focus();
          if (typeof caret === 'number') freshInput.setSelectionRange(caret, caret);
        }
      });
    }

    const indStudentSelect = document.getElementById('ind-student-select');
    if (indStudentSelect) {
      indStudentSelect.addEventListener('change', (e) => {
        this.state.individualStudentId = e.target.value;
        rerender();
      });
    }

    const indYearSelect = document.getElementById('ind-year-select');
    if (indYearSelect) {
      indYearSelect.addEventListener('change', (e) => {
        if (this.state.section === 'certificates') {
          this.state.academicYear = e.target.value;
        } else {
          this.state.transcriptYearFilter = e.target.value;
        }
        rerender();
      });
    }

    const indCertType = document.getElementById('ind-cert-type-select');
    if (indCertType) {
      indCertType.addEventListener('change', (e) => {
        this.state.certificateType = e.target.value;
        rerender();
      });
    }

    // Print action
    const printBtn = document.getElementById('btn-print-documents');
    if (printBtn) {
      printBtn.addEventListener('click', async () => {
        if (previewItems.length === 0) return;
        await Components.triggerPrint({ orientation: 'portrait', targetSelector: '.printable-area' });
      });
    }

    // Download PDF action (Single or Combined Batch Multi-Page)
    const pdfBtn = document.getElementById('btn-download-pdf');
    if (pdfBtn) {
      pdfBtn.addEventListener('click', async () => {
        if (previewItems.length === 0) return;
        const origHtml = pdfBtn.innerHTML;
        pdfBtn.disabled = true;
        pdfBtn.innerHTML = `${Components.icon('refresh-cw', 'w-3.5 h-3.5 animate-spin')} Generating PDF...`;
        try {
          if (this.state.section === 'certificates') {
            await this.exportCertificatesPDF(previewItems);
          } else {
            await this.exportTranscriptsPDF(previewItems, user);
          }
          Components.showToast(
            previewItems.length > 1
              ? `Combined PDF exported (${previewItems.length} student documents).`
              : 'PDF document downloaded successfully.',
            'success'
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'PDF export error.';
          Components.showToast(`Failed to generate PDF: ${msg}`, 'error');
        } finally {
          pdfBtn.disabled = false;
          pdfBtn.innerHTML = origHtml;
        }
      });
    }
  },

  async exportCertificatesPDF(items) {
    if (!items || items.length === 0) return null;
    const settings = Data.getSettings();
    const instName = settings.institutionName || 'MADARASATUL AL-IMAAM';
    const address = settings.address || 'Hargeisa, Somaliland';
    const phone = settings.contactPhone || '063-4129440';
    const issueDate = this.state.issueDate || new Date().toISOString().split('T')[0];

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const logoDataUrl = await Components._loadLogoDataUrl();

    items.forEach((item, idx) => {
      if (idx > 0) doc.addPage('a4', 'portrait');
      const st = item.student;
      const details = item.certificateDetails;

      // Double Royal Navy & Gold Certificate Border
      doc.setDrawColor(10, 38, 102);
      doc.setLineWidth(1.2);
      doc.rect(10, 10, pageWidth - 20, pageHeight - 20);
      doc.setDrawColor(212, 160, 23);
      doc.setLineWidth(0.7);
      doc.rect(13, 13, pageWidth - 26, pageHeight - 26);

      // Logo centered
      let y = 22;
      if (logoDataUrl) {
        doc.addImage(logoDataUrl, 'PNG', pageWidth / 2 - 14, y, 28, 28);
        y += 33;
      } else {
        y += 8;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(179, 131, 14);
      doc.text('AL-IMAAMA  ·  OFFICIAL SCHOOL SYSTEM', pageWidth / 2, y, { align: 'center' });
      y += 7;

      doc.setFontSize(18);
      doc.setTextColor(10, 38, 102);
      doc.text(instName, pageWidth / 2, y, { align: 'center' });
      y += 5.5;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`${address}  ·  Tel: ${phone}`, pageWidth / 2, y, { align: 'center' });
      y += 6;

      // Divider
      doc.setDrawColor(10, 38, 102);
      doc.setLineWidth(0.7);
      doc.line(25, y, pageWidth - 25, y);
      y += 10;

      // Certificate Banner
      doc.setFillColor(10, 38, 102);
      doc.roundedRect(pageWidth / 2 - 48, y - 6, 96, 10, 1.5, 1.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(253, 224, 71);
      doc.text('STUDENT CERTIFICATE', pageWidth / 2, y + 0.5, { align: 'center' });
      y += 10;

      doc.setFontSize(10);
      doc.setTextColor(20, 70, 160);
      doc.text(details.certificateTitle, pageWidth / 2, y, { align: 'center' });
      y += 12;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(100, 116, 139);
      doc.text('THIS IS PROUDLY AWARDED TO', pageWidth / 2, y, { align: 'center' });
      y += 10;

      // Student Full Name
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(11, 31, 75);
      doc.text(st.fullName, pageWidth / 2, y, { align: 'center' });
      y += 3;
      doc.setDrawColor(212, 160, 23);
      doc.setLineWidth(0.6);
      doc.line(42, y, pageWidth - 42, y);
      y += 9;

      // Metadata line
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(10, 38, 102);
      doc.text(
        `Student ID: ${st.id}    |    Class: ${details.displayClassName}    |    Academic Year: ${details.academicYear}`,
        pageWidth / 2,
        y,
        { align: 'center' }
      );
      y += 12;

      // Verified statement
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      doc.setTextColor(30, 41, 59);
      const wrappedStatement = doc.splitTextToSize(details.statement, pageWidth - 52);
      doc.text(wrappedStatement, pageWidth / 2, y, { align: 'center', lineHeightFactor: 1.5 });
      y += wrappedStatement.length * 6.5 + 10;

      // Verified facts box
      const boxX = 24;
      const boxW = pageWidth - 48;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.roundedRect(boxX, y, boxW, 20, 2, 2, 'FD');

      const colCount = Math.max(1, details.verifiedFacts.length);
      const colW = boxW / colCount;
      details.verifiedFacts.forEach((fact, fIdx) => {
        const cx = boxX + colW * fIdx + colW / 2;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text(String(fact.label).toUpperCase(), cx, y + 6.5, { align: 'center' });

        doc.setFontSize(9.5);
        doc.setTextColor(10, 38, 102);
        const valText = doc.splitTextToSize(String(fact.value), colW - 4);
        doc.text(valText[0] || '', cx, y + 13.5, { align: 'center' });
      });

      // Signature & Stamp Footer
      const footerY = pageHeight - 42;
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.4);

      // Date of Issue
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(issueDate, 45, footerY - 2, { align: 'center' });
      doc.line(24, footerY, 66, footerY);
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text('DATE OF ISSUE', 45, footerY + 5, { align: 'center' });

      // Official School Stamp circle
      doc.setDrawColor(212, 160, 23);
      doc.setLineWidth(0.5);
      doc.circle(pageWidth / 2, footerY - 5, 13);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(179, 131, 14);
      doc.text('OFFICIAL', pageWidth / 2, footerY - 6.5, { align: 'center' });
      doc.text('SCHOOL STAMP', pageWidth / 2, footerY - 3, { align: 'center' });

      // Principal Signature
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.4);
      doc.line(pageWidth - 74, footerY, pageWidth - 24, footerY);
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text('PRINCIPAL / AUTHORIZED SIGNATURE', pageWidth - 49, footerY + 5, { align: 'center' });
    });

    const filename =
      items.length === 1
        ? `AL-IMAAMA-Certificate-${sanitizeFilenamePart(items[0].student.id)}-${sanitizeFilenamePart(this.state.academicYear)}.pdf`
        : `AL-IMAAMA-Bulk-Certificates-${sanitizeFilenamePart(this.state.classId)}-${sanitizeFilenamePart(this.state.academicYear)}.pdf`;

    doc.save(filename);
    return { doc, filename, count: items.length };
  },

  async exportTranscriptsPDF(items, user = null) {
    if (!items || items.length === 0) return null;
    const settings = Data.getSettings();
    const instName = settings.institutionName || 'MADARASATUL AL-IMAAM';
    const address = settings.address || 'Hargeisa, Somaliland';
    const phone = settings.contactPhone || '063-4129440';
    const issueDate = this.state.issueDate || new Date().toISOString().split('T')[0];
    const preparedBy = user ? user.fullName : 'Administrator';

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 12;
    const logoDataUrl = await Components._loadLogoDataUrl();

    items.forEach((item, idx) => {
      if (idx > 0) doc.addPage('a4', 'portrait');
      const t = item.transcriptData;

      // Top Navy Bar
      doc.setFillColor(10, 38, 102);
      doc.rect(0, 0, pageWidth, 4, 'F');

      const textX = logoDataUrl ? margin + 21 : margin;
      if (logoDataUrl) {
        doc.addImage(logoDataUrl, 'PNG', margin, 8, 17, 17);
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(179, 131, 14);
      doc.text('AL-IMAAMA  ·  OFFICIAL ACADEMIC TRANSCRIPT', textX, 11.5);

      doc.setFontSize(14);
      doc.setTextColor(10, 38, 102);
      doc.text(instName, textX, 17.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`${address}  ·  Tel: ${phone}`, textX, 22);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(10, 38, 102);
      doc.text(`Date of Issue: ${issueDate}`, pageWidth - margin, 13, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.text(`Prepared By: ${preparedBy}`, pageWidth - margin, 17.5, { align: 'right' });

      // Divider
      doc.setDrawColor(10, 38, 102);
      doc.setLineWidth(0.7);
      doc.line(margin, 27, pageWidth - margin, 27);
      doc.setDrawColor(212, 160, 23);
      doc.setLineWidth(0.35);
      doc.line(margin, 28.2, pageWidth - margin, 28.2);

      // Student Info Box
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.roundedRect(margin, 32, pageWidth - margin * 2, 19, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(10, 38, 102);
      doc.text(`Student Name: ${t.studentName}`, margin + 3, 38);
      doc.text(`Student ID: ${t.studentId}`, margin + 96, 38);
      doc.text(`Gender: ${t.gender}`, margin + 145, 38);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 41, 59);
      doc.text(`Current Class: ${t.currentClassName}`, margin + 3, 44.5);
      doc.text(`Academic Year Covered: ${t.academicYearLabel}`, margin + 62, 44.5);

      // 7-Column Results Table Rows
      const bodyRows = [];
      t.sessions.forEach(session => {
        if (session.subjectRows.length === 0) {
          bodyRows.push([
            session.academicYear,
            session.term,
            session.historicalClassName,
            session.examType,
            'No subjects recorded',
            '—',
            '—'
          ]);
        } else {
          session.subjectRows.forEach(sr => {
            const subLabel = sr.subjectCode ? `${sr.subjectName} (${sr.subjectCode})` : sr.subjectName;
            bodyRows.push([
              session.academicYear,
              session.term,
              session.historicalClassName,
              session.examType,
              subLabel,
              sr.marksObtained !== null ? String(sr.marksObtained) : '—',
              String(sr.maxMarks)
            ]);
          });
        }

        const actStr = session.activityScore !== null ? ` (incl. Activity: ${session.activityScore})` : '';
        bodyRows.push([
          {
            content: `Session Total — ${session.academicYear} · ${session.term} · ${session.historicalClassName} (${session.examType})${actStr}`,
            colSpan: 5,
            styles: { fillColor: [238, 244, 255], textColor: [10, 38, 102], fontStyle: 'bold' }
          },
          {
            content: String(session.totalMarks),
            styles: { fillColor: [238, 244, 255], textColor: [10, 38, 102], fontStyle: 'bold', halign: 'right' }
          },
          {
            content: String(session.maxPossibleTotal),
            styles: { fillColor: [238, 244, 255], textColor: [10, 38, 102], fontStyle: 'bold', halign: 'right' }
          }
        ]);
      });

      autoTable(doc, {
        startY: 55,
        head: [['Academic Year', 'Term', 'Class', 'Examination Type', 'Subject', 'Marks Obtained', 'Maximum Marks']],
        body: bodyRows,
        showHead: 'everyPage',
        rowPageBreak: 'avoid',
        margin: { left: margin, right: margin, bottom: 26 },
        theme: 'grid',
        styles: {
          font: 'helvetica',
          fontSize: 8,
          cellPadding: 2,
          textColor: [15, 23, 42],
          lineColor: [203, 213, 225],
          lineWidth: 0.2,
          overflow: 'linebreak'
        },
        headStyles: {
          fillColor: [10, 38, 102],
          textColor: [255, 255, 255],
          fontStyle: 'bold'
        },
        columnStyles: {
          0: { halign: 'left', cellWidth: 23 },
          1: { halign: 'left', cellWidth: 16 },
          2: { halign: 'left', cellWidth: 20 },
          3: { halign: 'left', cellWidth: 26 },
          4: { halign: 'left' },
          5: { halign: 'right', cellWidth: 23 },
          6: { halign: 'right', cellWidth: 23 }
        }
      });

      const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY : 120;
      const sigY = Math.min(pageHeight - 22, Math.max(finalY + 18, pageHeight - 28));

      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.35);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);

      doc.text(preparedBy, margin + 22, sigY - 2, { align: 'center' });
      doc.line(margin, sigY, margin + 45, sigY);
      doc.text('Prepared By', margin + 22, sigY + 4, { align: 'center' });

      doc.text(issueDate, margin + 74, sigY - 2, { align: 'center' });
      doc.line(margin + 54, sigY, margin + 94, sigY);
      doc.text('Date of Issue', margin + 74, sigY + 4, { align: 'center' });

      doc.setDrawColor(212, 160, 23);
      doc.circle(margin + 116, sigY - 3, 9);
      doc.setFontSize(5.5);
      doc.setTextColor(179, 131, 14);
      doc.text('OFFICIAL STAMP', margin + 116, sigY - 2.5, { align: 'center' });

      doc.setDrawColor(148, 163, 184);
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.line(pageWidth - margin - 52, sigY, pageWidth - margin, sigY);
      doc.text('Principal / Authorized Signature', pageWidth - margin - 26, sigY + 4, { align: 'center' });
    });

    const scopeLabel = sanitizeFilenamePart(this.state.transcriptYearFilter || 'ALL');
    const filename =
      items.length === 1
        ? `AL-IMAAMA-Transcript-${sanitizeFilenamePart(items[0].student.id)}-${scopeLabel}.pdf`
        : `AL-IMAAMA-Bulk-Transcripts-${sanitizeFilenamePart(this.state.classId)}-${scopeLabel}.pdf`;

    doc.save(filename);
    return { doc, filename, count: items.length };
  }
};
