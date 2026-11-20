/**
 * AL-IMAAMA - Attendance History Module (Faculty & Teachers)
 * Shows attendance roll call records strictly scoped to teacher's assigned classes.
 * Includes Class filter, Date filter, attendance breakdown, and modal roster inspection.
 */

import { Data } from './data.js';
import { Auth } from './auth.js';
import { Permissions } from './permissions.js';
import { Components } from './components.js';
import { I18n } from './i18n.js';

let filterClassId = '';
let filterDate = '';

export const AttendanceHistoryView = {
  render(container) {
    const user = Auth.getCurrentUser();
    const isAdmin = Permissions.isAdmin(user);
    const teacher = user.teacherDetails || Data.getTeacherByEmail(user.email);
    const classes = Data.getClasses();
    const students = Data.getStudents();
    const allAttendance = Data.getAttendance();

    // Teacher class isolation
    let availableClasses = classes;
    if (!isAdmin && teacher) {
      const assignedIds = teacher.assignedClassIds || [];
      availableClasses = classes.filter(c => assignedIds.includes(c.id));
    }

    if (!filterClassId && availableClasses.length > 0) {
      filterClassId = availableClasses[0].id;
    }

    // Filter attendance records to available classes
    const permittedAttendance = allAttendance.filter(a => 
      availableClasses.some(c => c.id === a.classId)
    );

    // Group attendance by classId and date
    const sessionMap = new Map();
    permittedAttendance.forEach(record => {
      const key = `${record.classId}__${record.date}`;
      if (!sessionMap.has(key)) {
        sessionMap.set(key, {
          classId: record.classId,
          date: record.date,
          records: []
        });
      }
      sessionMap.get(key).records.push(record);
    });

    // Convert sessions to list
    let sessions = Array.from(sessionMap.values()).map(sess => {
      const cls = classes.find(c => c.id === sess.classId);
      const totalStudents = students.filter(s => s.classId === sess.classId).length;
      const presentCount = sess.records.filter(r => r.status === 'Present').length;
      const absentCount = sess.records.filter(r => r.status === 'Absent').length;
      const excusedCount = sess.records.filter(r => r.status === 'Excused').length;

      return {
        key: `${sess.classId}__${sess.date}`,
        classId: sess.classId,
        className: cls ? cls.name : 'Unknown Class',
        room: cls ? cls.room : '',
        date: sess.date,
        totalStudents: totalStudents || sess.records.length,
        presentCount,
        absentCount,
        excusedCount,
        records: sess.records
      };
    });

    // Sort by date descending
    sessions.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Apply active filters
    if (filterClassId) {
      sessions = sessions.filter(s => s.classId === filterClassId);
    }
    if (filterDate) {
      sessions = sessions.filter(s => s.date === filterDate);
    }

    // Totals for top cards
    const totalSessions = sessions.length;
    const totalPresentSum = sessions.reduce((acc, s) => acc + s.presentCount, 0);
    const totalAbsentSum = sessions.reduce((acc, s) => acc + s.absentCount, 0);

    container.innerHTML = `
      <div class="space-y-6">
        <!-- Header -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold tracking-tight text-slate-900">${I18n.t('nav.attendanceHistory', 'Attendance History')}</h1>
            <p class="text-sm text-slate-500 mt-1">Review historical daily roll call logs and audit records for your assigned classes.</p>
          </div>
          <a href="#attendance" class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors self-start sm:self-auto">
            ${Components.icon('clipboard-check', 'w-4 h-4')} ${I18n.t('nav.takeAttendance', 'Take Attendance')}
          </a>
        </div>

        <!-- Metric Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span class="text-slate-400 block text-[11px] font-bold uppercase">Recorded Sessions</span>
            <h3 class="text-xl font-bold text-slate-900 mt-1 tabular-nums">${totalSessions}</h3>
            <p class="text-xs text-slate-500 mt-0.5">Across assigned classes</p>
          </div>
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span class="text-slate-400 block text-[11px] font-bold uppercase">Total Present Recorded</span>
            <h3 class="text-xl font-bold text-emerald-600 mt-1 tabular-nums">${totalPresentSum}</h3>
            <p class="text-xs text-slate-500 mt-0.5">Attended classroom sessions</p>
          </div>
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span class="text-slate-400 block text-[11px] font-bold uppercase">Total Absent Recorded</span>
            <h3 class="text-xl font-bold text-rose-600 mt-1 tabular-nums">${totalAbsentSum}</h3>
            <p class="text-xs text-slate-500 mt-0.5">Recorded absences</p>
          </div>
        </div>

        <!-- Filter Bar -->
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div class="flex flex-wrap items-center gap-3">
            <div>
              <label class="block text-[11px] font-semibold text-slate-500 mb-1">Filter by Class:</label>
              <select id="hist-class-filter" class="py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-semibold text-slate-800">
                <option value="">All My Classes</option>
                ${availableClasses.map(c => `
                  <option value="${c.id}" ${filterClassId === c.id ? 'selected' : ''}>
                    ${c.name}
                  </option>
                `).join('')}
              </select>
            </div>

            <div>
              <label class="block text-[11px] font-semibold text-slate-500 mb-1">Filter by Date:</label>
              <input 
                type="date" 
                id="hist-date-filter" 
                value="${filterDate}"
                class="py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 text-slate-800 font-mono"
              />
            </div>

            ${(filterClassId || filterDate) ? `
              <div class="self-end">
                <button id="clear-hist-filters-btn" class="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                  Clear Filters
                </button>
              </div>
            ` : ''}
          </div>

          <div class="text-right text-xs text-slate-400">
            <span>Showing ${sessions.length} historical roll call logs</span>
          </div>
        </div>

        <!-- History Records Table -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div class="overflow-x-auto custom-scrollbar">
            <table class="w-full text-left text-xs text-slate-600">
              <thead class="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th class="py-3 px-4">Class</th>
                  <th class="py-3 px-4">Date</th>
                  <th class="py-3 px-4 text-center">Total Students</th>
                  <th class="py-3 px-4 text-center">Present</th>
                  <th class="py-3 px-4 text-center">Absent</th>
                  <th class="py-3 px-4 text-center">Attendance Rate</th>
                  <th class="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${sessions.length > 0 ? sessions.map(sess => {
                  const rate = sess.totalStudents > 0 ? Math.round((sess.presentCount / sess.totalStudents) * 100) : 0;
                  return `
                    <tr class="hover:bg-slate-50 transition-colors">
                      <td class="py-3 px-4">
                        <span class="font-bold text-slate-900 text-sm">${sess.className}</span>
                        ${sess.room ? `<span class="text-slate-400 text-[11px] block">Room ${sess.room}</span>` : ''}
                      </td>
                      <td class="py-3 px-4 font-mono font-medium text-slate-700">${sess.date}</td>
                      <td class="py-3 px-4 text-center tabular-nums font-semibold text-slate-800">${sess.totalStudents}</td>
                      <td class="py-3 px-4 text-center tabular-nums">
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          ${sess.presentCount}
                        </span>
                      </td>
                      <td class="py-3 px-4 text-center tabular-nums">
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          ${sess.absentCount}
                        </span>
                      </td>
                      <td class="py-3 px-4 text-center">
                        <div class="flex items-center justify-center gap-2">
                          <span class="tabular-nums font-semibold ${rate >= 80 ? 'text-emerald-700' : 'text-amber-700'}">${rate}%</span>
                          <div class="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div class="h-full ${rate >= 80 ? 'bg-emerald-500' : 'bg-amber-500'} rounded-full" style="width: ${rate}%"></div>
                          </div>
                        </div>
                      </td>
                      <td class="py-3 px-4 text-right">
                        <button class="view-session-details-btn px-3 py-1 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors" data-class="${sess.classId}" data-date="${sess.date}">
                          View Details
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('') : `
                  <tr>
                    <td colspan="7" class="p-8 text-center text-slate-400">
                      No attendance history records found for the selected criteria.
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    this.bindEvents(container, sessions, students);
  },

  bindEvents(container, sessions, students) {
    const classFilter = container.querySelector('#hist-class-filter');
    if (classFilter) {
      classFilter.addEventListener('change', (e) => {
        filterClassId = e.target.value;
        this.render(container);
      });
    }

    const dateFilter = container.querySelector('#hist-date-filter');
    if (dateFilter) {
      dateFilter.addEventListener('change', (e) => {
        filterDate = e.target.value;
        this.render(container);
      });
    }

    const clearBtn = container.querySelector('#clear-hist-filters-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        filterClassId = '';
        filterDate = '';
        this.render(container);
      });
    }

    container.querySelectorAll('.view-session-details-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const cId = btn.dataset.class;
        const dt = btn.dataset.date;
        this.openSessionModal(cId, dt, students);
      });
    });
  },

  openSessionModal(classId, date, students) {
    const classes = Data.getClasses();
    const cls = classes.find(c => c.id === classId);
    const allAttendance = Data.getAttendance();
    const sessionRecords = allAttendance.filter(a => a.classId === classId && a.date === date);
    const classStudents = students.filter(s => s.classId === classId);

    const content = `
      <div class="space-y-4">
        <div class="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between text-xs">
          <div>
            <span class="font-bold text-slate-900">${cls ? cls.name : 'Class'}</span>
            <span class="text-slate-500 ml-2">Date: <strong class="font-mono text-slate-800">${date}</strong></span>
          </div>
          <span class="text-slate-500">${sessionRecords.length} student records</span>
        </div>

        <div class="max-h-96 overflow-y-auto border border-slate-200 rounded-lg">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 sticky top-0">
              <tr>
                <th class="py-2.5 px-3">Student ID</th>
                <th class="py-2.5 px-3">Student Name</th>
                <th class="py-2.5 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${classStudents.map(st => {
                const rec = sessionRecords.find(r => r.studentId === st.id);
                const status = rec ? rec.status : 'Not Recorded';
                const statusBadge = status === 'Present' 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                  : status === 'Absent'
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : 'bg-slate-100 text-slate-500 border-slate-200';

                return `
                  <tr class="hover:bg-slate-50">
                    <td class="py-2 px-3 font-mono font-medium text-blue-600">${st.id}</td>
                    <td class="py-2 px-3 font-semibold text-slate-900">${st.fullName}</td>
                    <td class="py-2 px-3 text-center">
                      <span class="inline-block px-2.5 py-0.5 rounded text-[11px] font-bold border ${statusBadge}">
                        ${status}
                      </span>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    Components.openModal(content, `Roll Call Audit: ${cls ? cls.name : ''} (${date})`, { maxWidth: 'max-w-md' });
  }
};
