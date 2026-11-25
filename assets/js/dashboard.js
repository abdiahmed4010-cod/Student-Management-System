/**
 * AL-IMAAMA - Role-Based Dashboard Engine
 * Dynamically computes metrics from persistent storage:
 * - Admin Dashboard: Financial KPIs, attendance ratios, enrollment distribution, and quick action launchpads.
 * - Teacher Dashboard: Strict isolation to assigned classes, subjects, students, roll call, and marks.
 */

import { Data } from './data.js';
import { Auth } from './auth.js';
import { Permissions } from './permissions.js';
import { Components } from './components.js';
import { I18n } from './i18n.js';
import { StudentsView } from './students.js';
import { TeachersView } from './teachers.js';
import { PaymentsView } from './payments.js';
import { AttendanceView } from './attendance.js';
import { ExaminationsView } from './examinations.js';
import { API } from './api.js';

let teacherStudentSearchQuery = '';

export const DashboardView = {
  render(container) {
    const user = Auth.getCurrentUser();
    container.innerHTML = '<div class="p-8 text-sm text-slate-500">Loading dashboard metrics…</div>';
    API.dashboard.metrics().then(metrics => {
      if (window.location.hash && !window.location.hash.startsWith('#dashboard')) return;
      if (Permissions.isAdmin(user)) this.renderAdminDashboard(container, user, metrics);
      else this.renderTeacherDashboard(container, user, metrics);
    }).catch(() => {
      container.innerHTML = '<div role="alert" class="p-8 text-sm text-rose-700">Dashboard metrics could not be loaded. Check your connection and try again.</div>';
    });
  },

  renderAdminDashboard(container, user, metrics) {
    const settings = Data.getSettings();
    const currency = settings.currencySymbol || '$';
    const classes = Data.getClasses();
    const exams = Data.getExaminations();

    const recentExams = [...exams].reverse().slice(0, 4);

    container.innerHTML = `
      <div class="space-y-6">
        <!-- Welcome & Date Header -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold tracking-tight text-slate-900">${I18n.t('dashboard.adminTitle', 'Administrator Console')}</h1>
            <p class="text-sm text-slate-500 mt-1">
              ${I18n.t('dashboard.welcome', 'Welcome back')}, <strong class="text-slate-800 font-semibold">${user.fullName}</strong>. ${I18n.t('dashboard.adminSub', 'Institutional operations for')} <strong class="text-blue-600">${settings.institutionName}</strong>.
            </p>
          </div>
          
          <!-- Quick Action Buttons (6 Actions) -->
          <div class="flex flex-wrap items-center gap-2">
            ${Permissions.hasPermission(user, 'students', 'add') ? `
              <button id="qa-add-student" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-xs transition-colors">
                ${Components.icon('plus', 'w-3.5 h-3.5 text-blue-600')} ${I18n.t('students.addStudent', 'Add Student')}
              </button>
            ` : ''}
            <button id="qa-add-teacher" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-xs transition-colors">
              ${Components.icon('users', 'w-3.5 h-3.5 text-blue-600')} ${I18n.t('teachers.addTeacher', 'Add Teacher')}
            </button>
            ${Permissions.hasPermission(user, 'attendance', 'add') ? `
              <button id="qa-take-attendance" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-xs transition-colors">
                ${Components.icon('clipboard-check', 'w-3.5 h-3.5 text-emerald-600')} ${I18n.t('attendance.rollCall', 'Take Attendance')}
              </button>
            ` : ''}
            ${Permissions.hasPermission(user, 'examinations', 'add') ? `
              <button id="qa-enter-marks" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-xs transition-colors">
                ${Components.icon('file-spreadsheet', 'w-3.5 h-3.5 text-blue-600')} ${I18n.t('examinations.saveMarks', 'Enter Marks')}
              </button>
            ` : ''}
            ${Permissions.hasPermission(user, 'payments', 'add') ? `
              <button id="qa-record-payment" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors">
                ${Components.icon('wallet', 'w-3.5 h-3.5')} ${I18n.t('payments.recordPayment', 'Record Payment')}
              </button>
            ` : ''}
            ${Permissions.hasPermission(user, 'reports', 'view') ? `
              <button id="qa-generate-report" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg shadow-xs transition-colors">
                ${Components.icon('bar-chart-3', 'w-3.5 h-3.5 text-blue-600')} ${I18n.t('dashboard.generateReport', 'Generate Report')}
              </button>
            ` : ''}
          </div>
        </div>

        <!-- 6 Main Summary KPI Cards -->
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:border-blue-200 transition-colors">
            <div class="flex items-center justify-between text-slate-400">
              <span class="text-[10px] font-bold uppercase tracking-wider">${I18n.t('dashboard.totalStudents', 'Total Students')}</span>
              ${Components.icon('graduation-cap', 'w-4 h-4 text-blue-600')}
            </div>
            <h3 class="text-2xl font-bold text-slate-900 mt-2 tabular-nums">${metrics.totalStudents}</h3>
            <span class="text-[11px] text-slate-500 mt-1 block">${metrics.totalClasses} ${I18n.t('nav.classes', 'classes')}</span>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:border-amber-400/70 transition-colors">
            <div class="flex items-center justify-between text-slate-400">
              <span class="text-[10px] font-bold uppercase tracking-wider">${I18n.t('dashboard.totalTeachers', 'Teaching Staff')}</span>
              ${Components.icon('users', 'w-4 h-4 text-blue-900')}
            </div>
            <h3 class="text-2xl font-bold text-slate-900 mt-2 tabular-nums">${metrics.totalTeachers}</h3>
            <span class="text-[11px] text-slate-500 mt-1 block">${I18n.t('teachers.assignedSubjects', 'Teachers')}</span>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:border-amber-400/70 transition-colors">
            <div class="flex items-center justify-between text-slate-400">
              <span class="text-[10px] font-bold uppercase tracking-wider">${I18n.t('dashboard.totalClasses', 'Classrooms')}</span>
              ${Components.icon('school', 'w-4 h-4 text-amber-600')}
            </div>
            <h3 class="text-2xl font-bold text-slate-900 mt-2 tabular-nums">${metrics.totalClasses}</h3>
            <span class="text-[11px] text-slate-500 mt-1 block">${classes.map(c => c.name).slice(0, 2).join(', ')}...</span>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:border-blue-200 transition-colors">
            <div class="flex items-center justify-between text-slate-400">
              <span class="text-[10px] font-bold uppercase tracking-wider">${I18n.t('dashboard.attendanceToday', 'Attendance Today')}</span>
              ${Components.icon('clipboard-check', 'w-4 h-4 text-emerald-600')}
            </div>
            <h3 class="text-2xl font-bold text-emerald-600 mt-2 tabular-nums">${metrics.attendancePercentage}%</h3>
            <span class="text-[11px] text-slate-500 mt-1 block">${metrics.attendanceToday.present} ${I18n.t('attendance.present', 'present')}</span>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:border-blue-200 transition-colors">
            <div class="flex items-center justify-between text-slate-400">
              <span class="text-[10px] font-bold uppercase tracking-wider">${I18n.t('dashboard.feesCollected', 'Fees Collected')}</span>
              ${Components.icon('wallet', 'w-4 h-4 text-emerald-600')}
            </div>
            <h3 class="text-2xl font-bold text-emerald-700 mt-2 tabular-nums">${currency}${metrics.monthlyFeesCollected.toFixed(2)}</h3>
            <span class="text-[11px] text-slate-500 mt-1 block">${I18n.t('payments.collected', 'Reconciled')}</span>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:border-blue-200 transition-colors">
            <div class="flex items-center justify-between text-slate-400">
              <span class="text-[10px] font-bold uppercase tracking-wider">${I18n.t('dashboard.outstandingFees', 'Outstanding Fees')}</span>
              ${Components.icon('alert-circle', 'w-4 h-4 text-rose-600')}
            </div>
            <h3 class="text-2xl font-bold text-rose-600 mt-2 tabular-nums">${currency}${metrics.outstandingFees.toFixed(2)}</h3>
            <span class="text-[11px] text-rose-600 font-semibold mt-1 block">${I18n.t('payments.outstanding', 'Pending')}</span>
          </div>
        </div>

        <!-- Analytical Charts & Visual Section -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <!-- Monthly Fee Collection -->
          <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 class="text-sm font-bold text-slate-900">${I18n.t('dashboard.monthlyFeeCollection', 'Monthly Fee Collection')}</h3>
                <span class="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                  ${metrics.totalFeeObligation > 0 ? Math.round((metrics.monthlyFeesCollected / metrics.totalFeeObligation) * 100) : 0}%
                </span>
              </div>
              
              <div class="mt-4 space-y-3 text-xs">
                <div>
                  <div class="flex items-center justify-between text-slate-600 mb-1">
                    <span>${I18n.t('payments.collected', 'Collected')}</span>
                    <span class="font-bold text-emerald-600 tabular-nums">${currency}${metrics.monthlyFeesCollected.toFixed(2)}</span>
                  </div>
                  <div class="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div class="h-full bg-emerald-500 rounded-full" style="width: ${metrics.totalFeeObligation > 0 ? Math.round((metrics.monthlyFeesCollected / metrics.totalFeeObligation) * 100) : 0}%"></div>
                  </div>
                </div>

                <div>
                  <div class="flex items-center justify-between text-slate-600 mb-1">
                    <span>${I18n.t('payments.outstanding', 'Outstanding')}</span>
                    <span class="font-bold text-rose-600 tabular-nums">${currency}${metrics.outstandingFees.toFixed(2)}</span>
                  </div>
                  <div class="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div class="h-full bg-rose-500 rounded-full" style="width: ${metrics.totalFeeObligation > 0 ? Math.round((metrics.outstandingFees / metrics.totalFeeObligation) * 100) : 0}%"></div>
                  </div>
                </div>
              </div>
            </div>

            <div class="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>${I18n.t('payments.totalDue', 'Total Obligation')}:</span>
              <strong class="text-slate-900 font-bold tabular-nums">${currency}${metrics.totalFeeObligation.toFixed(2)}</strong>
            </div>
          </div>

          <!-- Attendance Overview -->
          <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 class="text-sm font-bold text-slate-900">${I18n.t('dashboard.attendanceOverview', 'Attendance Overview')}</h3>
                <span class="text-xs text-slate-500">${I18n.t('common.today', 'Today')}</span>
              </div>

              <div class="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                <div class="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                  <span class="text-[10px] font-bold text-emerald-700 uppercase">${I18n.t('attendance.present', 'Present')}</span>
                  <span class="text-xl font-bold text-emerald-800 block mt-1 tabular-nums">${metrics.attendanceToday.present}</span>
                </div>
                <div class="p-3 bg-rose-50 rounded-lg border border-rose-100">
                  <span class="text-[10px] font-bold text-rose-700 uppercase">${I18n.t('attendance.absent', 'Absent')}</span>
                  <span class="text-xl font-bold text-rose-800 block mt-1 tabular-nums">${metrics.attendanceToday.absent}</span>
                </div>
                <div class="p-3 bg-amber-50 rounded-lg border border-amber-100">
                  <span class="text-[10px] font-bold text-amber-700 uppercase">${I18n.t('attendance.excused', 'Excused')}</span>
                  <span class="text-xl font-bold text-amber-800 block mt-1 tabular-nums">${metrics.attendanceToday.excused}</span>
                </div>
              </div>
            </div>

            <div class="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>${I18n.t('common.total', 'Total Recorded')}:</span>
              <strong class="text-slate-900 font-bold tabular-nums">${metrics.attendanceToday.total}</strong>
            </div>
          </div>

          <!-- Student Distribution by Class -->
          <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 class="text-sm font-bold text-slate-900">${I18n.t('dashboard.classDistribution', 'Class Student Distribution')}</h3>
                <span class="text-xs text-slate-500">${classes.length} ${I18n.t('nav.classes', 'Classes')}</span>
              </div>

              <div class="mt-3 space-y-2 text-xs">
                ${metrics.classDistribution.map(cd => {
                  const pct = metrics.totalStudents > 0 ? Math.round((cd.studentCount / metrics.totalStudents) * 100) : 0;
                  return `
                    <div>
                      <div class="flex items-center justify-between text-slate-600 mb-0.5">
                        <span class="font-medium">${cd.className}</span>
                        <span class="tabular-nums font-semibold text-slate-900">${cd.studentCount} (${pct}%)</span>
                      </div>
                      <div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div class="h-full bg-blue-600 rounded-full" style="width: ${pct}%"></div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>

            <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>${I18n.t('classes.capacity', 'Student Capacity')}</span>
              <a href="#classes" class="text-blue-600 font-semibold hover:underline">${I18n.t('nav.classes', 'Manage Classes')}</a>
            </div>
          </div>
        </div>

        <!-- 3 Data Tables Section -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <!-- Recent Registrations -->
          <div class="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col justify-between">
            <div>
              <div class="p-4 border-b border-slate-100 flex items-center justify-between">
                <h3 class="text-sm font-bold text-slate-900">${I18n.t('dashboard.recentRegistrations', 'Recent Registrations')}</h3>
                <a href="#students" class="text-xs font-semibold text-blue-600 hover:underline">${I18n.t('dashboard.viewAll', 'View All')}</a>
              </div>
              <div class="divide-y divide-slate-100 text-xs">
                ${metrics.recentStudents.map(s => {
                  const cls = classes.find(c => c.id === s.classId);
                  return `
                    <div class="p-3 flex items-center justify-between hover:bg-slate-50">
                      <div>
                        <p class="font-semibold text-slate-900">${s.fullName}</p>
                        <span class="text-slate-400 font-mono text-[11px]">${s.admissionNumber || s.id} · ${cls ? cls.name : ''}</span>
                      </div>
                      <span class="text-slate-400 tabular-nums text-[11px]">${s.registrationDate}</span>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          </div>

          <!-- Recent Transactions -->
          <div class="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col justify-between">
            <div>
              <div class="p-4 border-b border-slate-100 flex items-center justify-between">
                <h3 class="text-sm font-bold text-slate-900">${I18n.t('dashboard.recentPayments', 'Recent Payments')}</h3>
                <a href="#payments" class="text-xs font-semibold text-blue-600 hover:underline">${I18n.t('nav.payments', 'Fee Ledger')}</a>
              </div>
              <div class="divide-y divide-slate-100 text-xs">
                ${metrics.recentTransactions.map(p => {
                  const student = Data.getStudentById(p.studentId);
                  return `
                    <div class="p-3 flex items-center justify-between hover:bg-slate-50">
                      <div>
                        <p class="font-semibold text-slate-900">${student ? student.fullName : p.studentId}</p>
                        <span class="text-slate-400 text-[11px]">${p.feeCategory} · <span class="font-mono text-slate-600 font-medium">${p.paymentMethod}</span></span>
                      </div>
                      <div class="text-right">
                        <span class="font-bold text-emerald-600 tabular-nums block">${currency}${p.amountPaid.toFixed(2)}</span>
                        <span class="text-[10px] text-slate-400">${p.paymentDate}</span>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          </div>

          <!-- Recent Examination Activity -->
          <div class="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col justify-between">
            <div>
              <div class="p-4 border-b border-slate-100 flex items-center justify-between">
                <h3 class="text-sm font-bold text-slate-900">${I18n.t('dashboard.recentExams', 'Recent Exam Sessions')}</h3>
                <a href="#examinations" class="text-xs font-semibold text-blue-600 hover:underline">${I18n.t('nav.examinations', 'Grade Sheet')}</a>
              </div>
              <div class="divide-y divide-slate-100 text-xs">
                ${recentExams.length > 0 ? recentExams.map(ex => {
                  const cls = classes.find(c => c.id === ex.classId);
                  const gradedCount = ex.marks ? Object.keys(ex.marks).length : 0;
                  return `
                    <div class="p-3 flex items-center justify-between hover:bg-slate-50">
                      <div>
                        <p class="font-semibold text-slate-900">${ex.examType} (${cls ? cls.name : ''})</p>
                        <span class="text-slate-400 text-[11px]">${ex.term} · ${ex.academicYear}</span>
                      </div>
                      <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700">
                        ${gradedCount} graded
                      </span>
                    </div>
                  `;
                }).join('') : `
                  <div class="p-6 text-center text-slate-400">No exam activity recorded yet.</div>
                `}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindAdminEvents(container);
  },

  renderTeacherDashboard(container, user, metrics) {
    const classes = Data.getClasses();
    const subjects = Data.getSubjects();
    const students = Data.getStudents();
    const teacher = user.teacherDetails || Data.getTeacherByEmail(user.email);

    // Strictly resolve assigned classes & subjects
    const assignedClassIds = teacher ? (teacher.assignedClassIds || []) : [];
    const assignedSubjectIds = teacher ? (teacher.assignedSubjectIds || []) : [];

    const myClasses = classes.filter(c => assignedClassIds.includes(c.id));
    const mySubjects = subjects.filter(s => assignedSubjectIds.includes(s.id));
    const myStudents = students.filter(s => assignedClassIds.includes(s.classId));

    const todayStr = new Date().toISOString().split('T')[0];
    const todayAtt = Data.getAttendance({ date: todayStr });

    // Filter today attendance to this teacher's assigned classes
    const myAttendanceToday = todayAtt.filter(a => assignedClassIds.includes(a.classId));

    // Get recent examination marks entered for assigned classes and subjects
    const allExams = Data.getExaminations({}, user);
    const myRecentMarks = [];
    allExams.forEach(ex => {
      if (assignedClassIds.includes(ex.classId) && ex.marks) {
        const cls = classes.find(c => c.id === ex.classId);
        Object.keys(ex.marks).forEach(stId => {
          const st = students.find(s => s.id === stId);
          if (st) {
            const markObj = ex.marks[stId];
            mySubjects.forEach(sub => {
              if (sub.classId === ex.classId && markObj[sub.id] !== undefined && markObj[sub.id] !== null) {
                myRecentMarks.push({
                  className: cls ? cls.name : 'Class',
                  subjectName: sub.name,
                  maxMarks: sub.maxMarks,
                  examType: ex.examType,
                  term: ex.term,
                  studentName: st.fullName,
                  score: markObj[sub.id]
                });
              }
            });
          }
        });
      }
    });

    // Filter students by local search within assigned classes
    let filteredRoster = myStudents;
    if (teacherStudentSearchQuery) {
      const q = teacherStudentSearchQuery.toLowerCase();
      filteredRoster = myStudents.filter(s => s.fullName.toLowerCase().includes(q) || String(s.admissionNumber || s.id).toLowerCase().includes(q));
    }

    container.innerHTML = `
      <div class="space-y-6">
        <!-- Teacher Header -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold tracking-tight text-slate-900">${I18n.t('dashboard.teacherTitle', 'Teacher Workspace')}</h1>
            <p class="text-sm text-slate-500 mt-1">
              ${I18n.t('dashboard.welcome', 'Welcome back')}, <strong class="text-slate-800 font-semibold">${user.fullName}</strong>. ${I18n.t('dashboard.teacherSub', 'Review your teaching roster, roll call duties, and marks entry tasks.')}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <a href="#attendance" class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors">
              ${Components.icon('clipboard-check', 'w-4 h-4')} ${I18n.t('dashboard.takeRollCall', 'Take Roll Call')}
            </a>
            <a href="#examinations" class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
              ${Components.icon('file-spreadsheet', 'w-4 h-4')} ${I18n.t('examinations.saveMarks', 'Enter Marks')}
            </a>
          </div>
        </div>

        <!-- 4 Teacher Scope Summary Cards -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:border-blue-300 transition-colors">
            <div class="flex items-center justify-between text-slate-400">
              <span class="text-[10px] font-bold uppercase tracking-wider">${I18n.t('dashboard.myClasses', 'My Classes')}</span>
              ${Components.icon('school', 'w-4 h-4 text-blue-600')}
            </div>
            <h3 class="text-2xl font-bold text-slate-900 mt-2 tabular-nums">${metrics.totalClasses}</h3>
            <span class="text-xs text-slate-500 mt-0.5 block truncate">${myClasses.map(c => c.name).join(', ') || I18n.t('common.none', 'None')}</span>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:border-amber-400/70 transition-colors">
            <div class="flex items-center justify-between text-slate-400">
              <span class="text-[10px] font-bold uppercase tracking-wider">${I18n.t('dashboard.mySubjects', 'Teaching Subjects')}</span>
              ${Components.icon('book-open', 'w-4 h-4 text-amber-600')}
            </div>
            <h3 class="text-2xl font-bold text-slate-900 mt-2 tabular-nums">${mySubjects.length}</h3>
            <span class="text-xs text-slate-500 mt-0.5 block truncate">${mySubjects.map(s => s.name).slice(0, 2).join(', ') || I18n.t('common.none', 'None')}</span>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:border-blue-300 transition-colors">
            <div class="flex items-center justify-between text-slate-400">
              <span class="text-[10px] font-bold uppercase tracking-wider">${I18n.t('dashboard.myStudents', 'Enrolled Students')}</span>
              ${Components.icon('graduation-cap', 'w-4 h-4 text-emerald-600')}
            </div>
            <h3 class="text-2xl font-bold text-emerald-600 mt-2 tabular-nums">${metrics.totalStudents}</h3>
            <span class="text-xs text-slate-500 mt-0.5 block">${I18n.t('dashboard.studentsEnrolledInYourClasses', 'in your assigned classes')}</span>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:border-blue-300 transition-colors">
            <div class="flex items-center justify-between text-slate-400">
              <span class="text-[10px] font-bold uppercase tracking-wider">${I18n.t('dashboard.attendanceRecordedToday', 'Attendance Today')}</span>
              ${Components.icon('clipboard-check', 'w-4 h-4 text-emerald-600')}
            </div>
            <h3 class="text-2xl font-bold text-slate-900 mt-2 tabular-nums">${metrics.attendanceToday.total}</h3>
            <span class="text-xs text-slate-500 mt-0.5 block">${metrics.attendanceToday.present} ${I18n.t('attendance.present', 'Present')}</span>
          </div>
        </div>

        <!-- Section: My Classes (Part 3.1) -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-lg font-bold text-slate-900">${I18n.t('nav.myClasses', 'My Assigned Classes')}</h2>
              <p class="text-xs text-slate-500">Your classroom allocations, active student rosters, and quick duty launchers.</p>
            </div>
            <span class="px-2.5 py-1 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-md">
              ${myClasses.length} ${I18n.t('nav.classes', 'Classes Assigned')}
            </span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            ${myClasses.map(cls => {
              const classStudents = students.filter(s => s.classId === cls.id);
              const classSubs = mySubjects.filter(s => s.classId === cls.id);
              const recordsToday = todayAtt.filter(a => a.classId === cls.id);
              const isRecorded = recordsToday.length > 0;
              const presentCount = recordsToday.filter(a => a.status === 'Present').length;
              const absentCount = recordsToday.filter(a => a.status === 'Absent').length;

              return `
                <div class="bg-white rounded-xl border border-slate-200 shadow-xs hover:shadow-sm hover:border-blue-300 transition-all p-5 flex flex-col justify-between space-y-4">
                  <div>
                    <!-- Class Header & Room -->
                    <div class="flex items-start justify-between">
                      <div>
                        <h3 class="text-base font-bold text-slate-900">${cls.name}</h3>
                        <span class="text-xs text-slate-500">Room ${cls.room || '101'} · Section ${cls.section}</span>
                      </div>
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700">
                        ${classStudents.length} Students
                      </span>
                    </div>

                    <!-- Assigned Subjects -->
                    <div class="mt-3 pt-3 border-t border-slate-100">
                      <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">Your Assigned Subjects:</span>
                      <div class="flex flex-wrap gap-1.5">
                        ${classSubs.length > 0 ? classSubs.map(s => `
                          <span class="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-200/70">
                            ${s.name} (${s.maxMarks} pts)
                          </span>
                        `).join('') : `
                          <span class="text-xs text-slate-400 italic">No subjects configured</span>
                        `}
                      </div>
                    </div>

                    <!-- Today's Attendance Status -->
                    <div class="mt-3 pt-3 border-t border-slate-100">
                      <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">Today's Attendance Status:</span>
                      ${isRecorded ? `
                        <div class="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
                          ${Components.icon('check-circle', 'w-3.5 h-3.5 text-emerald-600 shrink-0')}
                          <span class="font-semibold">Recorded:</span>
                          <span class="tabular-nums font-bold text-emerald-900">${presentCount} Present</span> · 
                          <span class="tabular-nums font-medium text-rose-700">${absentCount} Absent</span>
                        </div>
                      ` : `
                        <div class="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                          ${Components.icon('alert-circle', 'w-3.5 h-3.5 text-amber-600 shrink-0')}
                          <span class="font-semibold">Pending Daily Roll Call</span>
                        </div>
                      `}
                    </div>
                  </div>

                  <!-- Two Required Functional Action Buttons -->
                  <div class="pt-3 border-t border-slate-100 grid grid-cols-2 gap-2">
                    <button 
                      class="teacher-take-att-btn flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors"
                      data-class-id="${cls.id}"
                    >
                      ${Components.icon('clipboard-check', 'w-3.5 h-3.5')}
                      <span>Take Attendance</span>
                    </button>

                    <button 
                      class="teacher-enter-marks-btn flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-900 bg-slate-50 hover:bg-blue-50 border border-slate-200 rounded-lg transition-colors"
                      data-class-id="${cls.id}"
                    >
                      ${Components.icon('file-spreadsheet', 'w-3.5 h-3.5')}
                      <span>Enter Marks</span>
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

          <!-- Assigned Subjects List -->
          <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <div class="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 class="text-sm font-bold text-slate-900">${I18n.t('dashboard.mySubjects', 'My Assigned Subjects')}</h3>
              <span class="text-xs text-blue-700 font-semibold">${mySubjects.length} ${I18n.t('nav.subjects', 'Subjects')}</span>
            </div>

            <div class="space-y-2 text-xs">
              ${mySubjects.map(sub => {
                const cls = classes.find(c => c.id === sub.classId);
                return `
                  <div class="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
                    <div>
                      <p class="font-semibold text-slate-900">${sub.name}</p>
                      <span class="text-slate-400 font-mono text-[11px]">Class: ${cls ? cls.name : ''} · Max: ${sub.maxMarks} pts</span>
                    </div>
                    <a href="#examinations" class="text-blue-600 font-semibold hover:underline">
                      ${I18n.t('examinations.saveMarks', 'Grade')} →
                    </a>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

        <!-- Section: Today's Roll Call Schedule & Recent Attendance -->
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div class="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 class="text-sm font-bold text-slate-900">${I18n.t('dashboard.rollCallSchedule', "Today's Class Roll Call Schedule")}</h3>
              <p class="text-xs text-slate-500">${I18n.t('common.date', 'Date')}: <strong>${todayStr}</strong></p>
            </div>
            <a href="#attendance" class="text-xs font-semibold text-blue-600 hover:underline">
              ${I18n.t('attendance.log', 'Full Log')} →
            </a>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${myClasses.map(cls => {
              const records = todayAtt.filter(a => a.classId === cls.id);
              const isTaken = records.length > 0;
              const present = records.filter(a => a.status === 'Present').length;
              const studentsInCls = students.filter(s => s.classId === cls.id).length;

              return `
                <div class="p-4 rounded-lg border ${isTaken ? 'bg-emerald-50/40 border-emerald-200' : 'bg-slate-50 border-slate-200'} flex items-center justify-between">
                  <div>
                    <h4 class="font-bold text-slate-900 text-sm">${cls.name} <span class="text-xs font-normal text-slate-500">· Section ${cls.section}</span></h4>
                    <p class="text-xs text-slate-500 mt-0.5">${studentsInCls} ${I18n.t('nav.students', 'students')}</p>
                    ${isTaken ? `
                      <span class="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 mt-1">
                        ${Components.icon('check', 'w-3.5 h-3.5')} ${I18n.t('dashboard.completed', 'Completed')}: ${present} / ${records.length} ${I18n.t('attendance.present', 'Present')}
                      </span>
                    ` : `
                      <span class="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 mt-1">
                        ${Components.icon('alert-circle', 'w-3.5 h-3.5')} ${I18n.t('dashboard.pending', 'Pending Daily Roll Call')}
                      </span>
                    `}
                  </div>
                  <a href="#attendance" class="px-3 py-1.5 text-xs font-semibold rounded-lg ${isTaken ? 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-xs'} transition-colors">
                    ${isTaken ? I18n.t('dashboard.review', 'Review') : I18n.t('dashboard.takeRollCall', 'Take Roll Call')}
                  </a>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Section: Recent Examination Marks Entered -->
        ${myRecentMarks.length > 0 ? `
          <div class="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div class="p-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between text-xs">
              <span class="font-bold text-slate-900">Recent Examination Marks Recorded</span>
              <a href="#examinations" class="text-blue-600 font-semibold hover:underline">Open Spreadsheet</a>
            </div>
            <div class="overflow-x-auto custom-scrollbar">
              <table class="w-full text-left text-xs text-slate-600">
                <thead class="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th class="py-2.5 px-4">Student Name</th>
                    <th class="py-2.5 px-4">Class</th>
                    <th class="py-2.5 px-4">Subject</th>
                    <th class="py-2.5 px-4">Exam Type</th>
                    <th class="py-2.5 px-4 text-right">Score</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  ${myRecentMarks.slice(0, 5).map(m => `
                    <tr>
                      <td class="py-2.5 px-4 font-semibold text-slate-900">${m.studentName}</td>
                      <td class="py-2.5 px-4">${m.className}</td>
                      <td class="py-2.5 px-4">${m.subjectName}</td>
                      <td class="py-2.5 px-4">${m.examType} (${m.term})</td>
                      <td class="py-2.5 px-4 text-right tabular-nums font-bold text-blue-600">${m.score} / ${m.maxMarks}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        ` : ''}

        <!-- Section: Enrolled Student Roster with live In-Teacher Search -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div class="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div>
              <span class="font-bold text-slate-900">${I18n.t('dashboard.myRoster', 'Your Student Roster')}</span>
              <span class="text-slate-500 block sm:inline sm:ml-2">(${myStudents.length} ${I18n.t('dashboard.studentsEnrolledInYourClasses', 'enrolled in your assigned classes')})</span>
            </div>
            <div class="relative w-full sm:w-64">
              <input 
                type="text" 
                id="teacher-student-search-input" 
                placeholder="${I18n.t('students.searchPlaceholder', 'Search your students...')}" 
                value="${teacherStudentSearchQuery}"
                class="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 text-slate-800"
              />
            </div>
          </div>

          <div class="overflow-x-auto custom-scrollbar">
            <table class="w-full text-left text-xs text-slate-600">
              <thead class="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th class="py-3 px-4">${I18n.t('students.studentId', 'Student ID')}</th>
                  <th class="py-3 px-4">${I18n.t('students.fullName', 'Student Name')}</th>
                  <th class="py-3 px-4">${I18n.t('students.classLabel', 'Class')}</th>
                  <th class="py-3 px-4">${I18n.t('students.gender', 'Gender')}</th>
                  <th class="py-3 px-4">${I18n.t('students.parentPhone', 'Parent Contact')}</th>
                  <th class="py-3 px-4 text-right">${I18n.t('common.details', 'Details')}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${filteredRoster.length > 0 ? filteredRoster.map(s => {
                  const cls = classes.find(c => c.id === s.classId);
                  return `
                    <tr class="hover:bg-slate-50 transition-colors">
                      <td class="py-2.5 px-4 font-mono font-medium text-blue-600">${s.admissionNumber || s.id}</td>
                      <td class="py-2.5 px-4 font-semibold text-slate-900">${s.fullName}</td>
                      <td class="py-2.5 px-4">${cls ? cls.name : ''}</td>
                      <td class="py-2.5 px-4">${s.gender}</td>
                      <td class="py-2.5 px-4 font-mono text-slate-500">${s.parentPhone}</td>
                      <td class="py-2.5 px-4 text-right">
                        <button class="teacher-view-student-profile-btn text-blue-600 font-semibold hover:underline" data-id="${s.id}">
                          ${I18n.t('common.view', 'View')}
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('') : `
                  <tr><td colspan="6" class="p-8 text-center text-slate-400">No students match your query.</td></tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    this.bindTeacherEvents(container, myClasses);
  },

  bindAdminEvents(container) {
    const addStudentBtn = container.querySelector('#qa-add-student');
    if (addStudentBtn) {
      addStudentBtn.addEventListener('click', () => {
        StudentsView.openStudentModal(null, container);
      });
    }

    const addTeacherBtn = container.querySelector('#qa-add-teacher');
    if (addTeacherBtn) {
      addTeacherBtn.addEventListener('click', () => {
        TeachersView.openTeacherModal(null, container);
      });
    }

    const takeAttBtn = container.querySelector('#qa-take-attendance');
    if (takeAttBtn) {
      takeAttBtn.addEventListener('click', () => {
        window.location.hash = '#attendance';
      });
    }

    const enterMarksBtn = container.querySelector('#qa-enter-marks');
    if (enterMarksBtn) {
      enterMarksBtn.addEventListener('click', () => {
        window.location.hash = '#examinations';
      });
    }

    const recordPayBtn = container.querySelector('#qa-record-payment');
    if (recordPayBtn) {
      recordPayBtn.addEventListener('click', () => {
        PaymentsView.openRecordPaymentModal(null, container);
      });
    }

    const genReportBtn = container.querySelector('#qa-generate-report');
    if (genReportBtn) {
      genReportBtn.addEventListener('click', () => {
        window.location.hash = '#reports';
      });
    }
  },

  bindTeacherEvents(container, myClasses) {
    // In-teacher student search
    const searchInput = container.querySelector('#teacher-student-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        teacherStudentSearchQuery = e.target.value;
        const user = Auth.getCurrentUser();
        this.render(container);
      });
    }

    // View class student list in modal
    container.querySelectorAll('.teacher-view-class-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const clsId = btn.dataset.id;
        const cls = myClasses.find(c => c.id === clsId);
        if (!cls) return;

        const students = Data.getStudentsByClass(clsId);
        const subjects = Data.getSubjectsByClass(clsId);

        const content = `
          <div class="space-y-4">
            <div class="flex items-center justify-between text-xs text-slate-500 pb-2 border-b border-slate-200">
              <span>${I18n.t('classes.title', 'Class')}: <strong class="text-slate-900">${cls.name}</strong> (Section ${cls.section})</span>
              <span class="font-semibold text-slate-800">${students.length} ${I18n.t('nav.students', 'students')}</span>
            </div>
            <div class="max-h-72 overflow-y-auto custom-scrollbar border border-slate-200 rounded-lg">
              <table class="w-full text-left text-xs">
                <thead class="bg-slate-50 text-slate-700 border-b border-slate-200 font-medium">
                  <tr>
                    <th class="py-2.5 px-3">${I18n.t('students.studentId', 'Student ID')}</th>
                    <th class="py-2.5 px-3">${I18n.t('students.fullName', 'Student Name')}</th>
                    <th class="py-2.5 px-3">${I18n.t('students.gender', 'Gender')}</th>
                    <th class="py-2.5 px-3">${I18n.t('students.parentPhone', 'Parent Phone')}</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  ${students.length > 0 ? students.map(s => `
                    <tr class="hover:bg-slate-50">
                      <td class="py-2 px-3 font-mono font-medium text-blue-600">${s.admissionNumber || s.id}</td>
                      <td class="py-2 px-3 font-semibold text-slate-800">${s.fullName}</td>
                      <td class="py-2 px-3">${s.gender}</td>
                      <td class="py-2 px-3 font-mono text-slate-500">${s.parentPhone}</td>
                    </tr>
                  `).join('') : `
                    <tr><td colspan="4" class="p-4 text-center text-slate-400">No students found.</td></tr>
                  `}
                </tbody>
              </table>
            </div>
          </div>
        `;

        Components.openModal(content, `${cls.name} — Student Roster`, { maxWidth: 'max-w-xl' });
      });
    });

    // Take Attendance directly for this class
    container.querySelectorAll('.teacher-take-att-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const classId = btn.dataset.classId;
        AttendanceView.selectClass(classId);
        window.location.hash = '#attendance';
      });
    });

    // Enter Marks directly for this class
    container.querySelectorAll('.teacher-enter-marks-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const classId = btn.dataset.classId;
        if (!ExaminationsView.selectClass(classId)) return;
        window.location.hash = '#examinations';
      });
    });

    // View student profile
    container.querySelectorAll('.teacher-view-student-profile-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        StudentsView.openStudentProfile(btn.dataset.id);
      });
    });
  }
};
