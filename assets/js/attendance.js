/**
 * AL-IMAAMA - Attendance Management Module
 * Strict RBAC & Scoping:
 * - Teachers record attendance ONLY for students in their assigned classes.
 * - Teacher attendance statuses remain ONLY: Present, Absent.
 * - Teachers never see or select Excused (Admin-only).
 * - Full multi-language localization (EN, SO, AR).
 */

import { Data } from './data.js';
import { Auth } from './auth.js';
import { Permissions } from './permissions.js';
import { Components } from './components.js';
import { I18n } from './i18n.js';

let selectedClassId = '';
let selectedDate = new Date().toISOString().split('T')[0];
let activeViewMode = 'take'; // 'take' or 'history'
let statusMap = {}; // { [studentId]: 'Present' | 'Absent' }

export const AttendanceView = {
  selectClass(classId) {
    selectedClassId = classId;
    selectedDate = new Date().toISOString().split('T')[0];
    statusMap = {};
  },

  render(container) {
    const user = Auth.getCurrentUser();
    const isAdmin = Permissions.isAdmin(user);
    const teacher = user.teacherDetails || Data.getTeacherByEmail(user.email);
    const classes = Data.getClasses();

    // Determine available classes for this user
    let availableClasses = classes;
    if (!isAdmin && teacher) {
      const assignedIds = teacher.assignedClassIds || [];
      availableClasses = classes.filter(c => assignedIds.includes(c.id));
    }

    if (!selectedClassId && availableClasses.length > 0) {
      selectedClassId = availableClasses[0].id;
    } else if (availableClasses.length > 0 && !availableClasses.some(c => c.id === selectedClassId)) {
      selectedClassId = availableClasses[0].id;
    }

    const currentClass = classes.find(c => c.id === selectedClassId);
    const classStudents = selectedClassId ? Data.getStudentsByClass(selectedClassId) : [];

    // Check if attendance already taken for selectedClassId + selectedDate
    const existingRecords = selectedClassId && selectedDate 
      ? Data.getAttendance({ classId: selectedClassId, date: selectedDate })
      : [];
    const isAlreadyRecorded = existingRecords.length > 0;

    // Initialize status map
    if (Object.keys(statusMap).length === 0 || !classStudents.every(s => statusMap[s.id])) {
      statusMap = {};
      classStudents.forEach(s => {
        const found = existingRecords.find(r => r.studentId === s.id);
        // If teacher, convert Excused to Absent if reviewing existing session
        statusMap[s.id] = found ? (found.status === 'Excused' && !isAdmin ? 'Absent' : found.status) : 'Present';
      });
    }

    container.innerHTML = `
      <div class="space-y-6">
        <!-- Module Header -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold tracking-tight text-slate-900">${I18n.t('attendance.title', 'Attendance Management')}</h1>
            <p class="text-sm text-slate-500 mt-1">
              ${isAdmin ? I18n.t('attendance.adminSub', 'Comprehensive institutional attendance logs, roll call auditing, and excuse authorization.') : I18n.t('attendance.teacherSub', 'Daily roll call for your assigned classroom students.')}
            </p>
          </div>
          
          <div class="flex items-center gap-2">
            <button id="view-mode-take-btn" class="px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${activeViewMode === 'take' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}">
              ${Components.icon('clipboard-check', 'w-3.5 h-3.5 inline mr-1')} ${I18n.t('attendance.rollCall', 'Roll Call')}
            </button>
            <button id="view-mode-history-btn" class="px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${activeViewMode === 'history' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}">
              ${Components.icon('calendar', 'w-3.5 h-3.5 inline mr-1')} ${I18n.t('attendance.log', 'Attendance Log')}
            </button>
          </div>
        </div>

        <!-- Filter Controls -->
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
          <div class="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div>
              <label class="block text-[11px] font-semibold text-slate-500 mb-1">${I18n.t('attendance.selectClass', 'Select Class:')}</label>
              <select id="attendance-class-select" class="py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-semibold text-slate-800">
                ${availableClasses.length > 0 ? availableClasses.map(c => `
                  <option value="${c.id}" ${selectedClassId === c.id ? 'selected' : ''}>
                    ${c.name} (${classStudents.length} ${I18n.t('nav.students', 'students')})
                  </option>
                `).join('') : '<option value="">No Assigned Classes</option>'}
              </select>
            </div>

            <div>
              <label class="block text-[11px] font-semibold text-slate-500 mb-1">${I18n.t('attendance.date', 'Attendance Date:')}</label>
              <input 
                type="date" 
                id="attendance-date-input" 
                value="${selectedDate}" 
                class="py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-medium text-slate-800"
              />
            </div>
          </div>

          <!-- Quick Action Buttons for Roll Call -->
          ${activeViewMode === 'take' && classStudents.length > 0 && (Permissions.hasPermission(user, 'attendance', 'add') || Permissions.hasPermission(user, 'attendance', 'edit')) ? `
            <div class="flex items-center gap-2 w-full md:w-auto justify-end">
              <button id="select-all-present-btn" class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors">
                ${Components.icon('check', 'w-4 h-4')} ${I18n.t('attendance.selectAllPresent', 'Select All Present')}
              </button>
              <button id="save-attendance-btn" class="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors">
                ${Components.icon('check-circle', 'w-4 h-4')} ${isAlreadyRecorded ? I18n.t('attendance.updateAttendance', 'Update Attendance') : I18n.t('attendance.saveAttendance', 'Save Attendance')}
              </button>
            </div>
          ` : ''}
        </div>

        ${isAlreadyRecorded && activeViewMode === 'take' ? `
          <div class="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between text-xs text-blue-900">
            <div class="flex items-center gap-2">
              ${Components.icon('info', 'w-4 h-4 text-blue-600')}
              <span>${I18n.t('attendance.alreadyTakenNotice', 'Attendance has already been recorded for this class and date.')} (<strong>${currentClass ? currentClass.name : ''}</strong> on <strong>${selectedDate}</strong>).</span>
            </div>
          </div>
        ` : ''}

        <!-- Active View Body -->
        ${activeViewMode === 'take' ? this.renderRollCallView(classStudents, isAdmin) : this.renderHistoryView(selectedClassId, selectedDate, isAdmin)}
      </div>
    `;

    this.bindEvents(container, availableClasses);
  },

  renderRollCallView(classStudents, isAdmin) {
    if (classStudents.length === 0) {
      return Components.emptyState('No students found in selected class', 'Please choose an assigned class or verify student registration.');
    }

    const presentCount = Object.values(statusMap).filter(s => s === 'Present').length;
    const absentCount = Object.values(statusMap).filter(s => s === 'Absent').length;
    const excusedCount = Object.values(statusMap).filter(s => s === 'Excused').length;

    return `
      <div class="grid grid-cols-3 gap-4 text-center text-xs">
        <div class="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
          <span class="text-slate-400 block text-[10px] font-bold uppercase">${I18n.t('attendance.present', 'Marked Present')}</span>
          <span class="text-xl font-bold text-emerald-600 tabular-nums">${presentCount}</span>
        </div>
        <div class="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
          <span class="text-slate-400 block text-[10px] font-bold uppercase">${I18n.t('attendance.absent', 'Marked Absent')}</span>
          <span class="text-xl font-bold text-rose-600 tabular-nums">${absentCount}</span>
        </div>
        <div class="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
          <span class="text-slate-400 block text-[10px] font-bold uppercase">${isAdmin ? I18n.t('attendance.excused', 'Excused Absences') : I18n.t('common.total', 'Total Students')}</span>
          <span class="text-xl font-bold ${isAdmin ? 'text-amber-600' : 'text-slate-800'} tabular-nums">${isAdmin ? excusedCount : classStudents.length}</span>
        </div>
      </div>

      <div class="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div class="overflow-x-auto custom-scrollbar">
          <table class="w-full text-left text-xs text-slate-600">
            <thead class="bg-slate-50/80 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th class="py-3.5 px-4">#</th>
                <th class="py-3.5 px-4">${I18n.t('students.studentId', 'Student ID')}</th>
                <th class="py-3.5 px-4">${I18n.t('students.fullName', 'Full Name')}</th>
                <th class="py-3.5 px-4">${I18n.t('students.gender', 'Gender')}</th>
                <th class="py-3.5 px-4 text-center">${I18n.t('common.status', 'Attendance Status')}</th>
                ${isAdmin ? `<th class="py-3.5 px-4 text-right">${I18n.t('attendance.adminOverride', 'Admin Override')}</th>` : ''}
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${classStudents.map((student, idx) => {
                const currentStatus = statusMap[student.id] || 'Present';
                return `
                  <tr class="hover:bg-slate-50/80 transition-colors">
                    <td class="py-3 px-4 text-slate-400 tabular-nums">${idx + 1}</td>
                    <td class="py-3 px-4 font-mono font-medium text-blue-600">${student.id}</td>
                    <td class="py-3 px-4 font-semibold text-slate-900">${student.fullName}</td>
                    <td class="py-3 px-4">${student.gender}</td>
                    <td class="py-3 px-4 text-center">
                      <!-- Two buttons ONLY for Teachers: Present / Absent -->
                      <div class="inline-flex p-1 bg-slate-100 rounded-lg gap-1">
                        <button 
                          type="button"
                          class="toggle-present-btn px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${currentStatus === 'Present' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}"
                          data-student-id="${student.id}"
                        >
                          ${I18n.t('attendance.present', 'Present')}
                        </button>
                        <button 
                          type="button"
                          class="toggle-absent-btn px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${currentStatus === 'Absent' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}"
                          data-student-id="${student.id}"
                        >
                          ${I18n.t('attendance.absent', 'Absent')}
                        </button>
                      </div>
                    </td>
                    ${isAdmin ? `
                      <td class="py-3 px-4 text-right">
                        ${currentStatus === 'Absent' ? `
                          <button class="mark-excused-btn px-2.5 py-1 text-[11px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md transition-colors" data-student-id="${student.id}">
                            ${I18n.t('attendance.authorizeExcuse', 'Authorize Excuse')}
                          </button>
                        ` : currentStatus === 'Excused' ? `
                          <span class="inline-block px-2.5 py-1 text-[11px] font-semibold bg-amber-100 text-amber-800 rounded-md">
                            ${I18n.t('attendance.excuseAuthorized', 'Excused Authorized')}
                          </span>
                        ` : `<span class="text-slate-400 text-[11px]">—</span>`}
                      </td>
                    ` : ''}
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  renderHistoryView(classId, date, isAdmin) {
    const records = Data.getAttendance({ classId, date });
    const students = Data.getStudents();
    const classes = Data.getClasses();
    const currentClass = classes.find(c => c.id === classId);

    return `
      <div class="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div class="p-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between text-xs">
          <span class="font-semibold text-slate-800">
            ${I18n.t('attendance.log', 'Attendance Log')}: <strong>${currentClass ? currentClass.name : 'Selected Class'}</strong> · <strong>${date}</strong>
          </span>
          <span class="text-slate-500">${records.length} records</span>
        </div>
        <div class="overflow-x-auto custom-scrollbar">
          <table class="w-full text-left text-xs text-slate-600">
            <thead class="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th class="py-3 px-4">${I18n.t('students.studentId', 'Student ID')}</th>
                <th class="py-3 px-4">${I18n.t('students.fullName', 'Student Name')}</th>
                <th class="py-3 px-4">${I18n.t('common.status', 'Status')}</th>
                <th class="py-3 px-4">${I18n.t('attendance.excuseReason', 'Reason / Notes')}</th>
                <th class="py-3 px-4">${I18n.t('common.time', 'Logged At')}</th>
                ${isAdmin ? `<th class="py-3 px-4 text-right">${I18n.t('common.actions', 'Admin Action')}</th>` : ''}
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${records.length > 0 ? records.map(rec => {
                const s = students.find(st => st.id === rec.studentId);
                return `
                  <tr class="hover:bg-slate-50">
                    <td class="py-3 px-4 font-mono font-medium text-blue-600">${rec.studentId}</td>
                    <td class="py-3 px-4 font-semibold text-slate-900">${s ? s.fullName : 'Student'}</td>
                    <td class="py-3 px-4">
                      <span class="inline-block px-2.5 py-0.5 rounded text-[11px] font-semibold ${
                        rec.status === 'Present' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                        rec.status === 'Excused' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                        'bg-rose-50 text-rose-700 border border-rose-200'
                      }">
                        ${I18n.t(`attendance.${rec.status.toLowerCase()}`, rec.status)}
                      </span>
                    </td>
                    <td class="py-3 px-4 text-slate-500">${rec.excusedReason || '—'}</td>
                    <td class="py-3 px-4 tabular-nums text-slate-400">${new Date(rec.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    ${isAdmin ? `
                      <td class="py-3 px-4 text-right">
                        ${rec.status === 'Absent' ? `
                          <button class="history-excuse-btn text-amber-600 hover:text-amber-700 font-semibold" data-id="${rec.id}" data-name="${s ? s.fullName : ''}">
                            ${I18n.t('attendance.authorizeExcuse', 'Mark Excused')}
                          </button>
                        ` : ''}
                      </td>
                    ` : ''}
                  </tr>
                `;
              }).join('') : `
                <tr><td colspan="${isAdmin ? 6 : 5}" class="p-8 text-center text-slate-400">No attendance records logged for this class and date.</td></tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  bindEvents(container, availableClasses) {
    const takeBtn = container.querySelector('#view-mode-take-btn');
    const historyBtn = container.querySelector('#view-mode-history-btn');

    if (takeBtn) {
      takeBtn.addEventListener('click', () => {
        activeViewMode = 'take';
        this.render(container);
      });
    }

    if (historyBtn) {
      historyBtn.addEventListener('click', () => {
        activeViewMode = 'history';
        this.render(container);
      });
    }

    const classSelect = container.querySelector('#attendance-class-select');
    if (classSelect) {
      classSelect.addEventListener('change', (e) => {
        selectedClassId = e.target.value;
        statusMap = {};
        this.render(container);
      });
    }

    const dateInput = container.querySelector('#attendance-date-input');
    if (dateInput) {
      dateInput.addEventListener('change', (e) => {
        selectedDate = e.target.value;
        statusMap = {};
        this.render(container);
      });
    }

    const selectAllBtn = container.querySelector('#select-all-present-btn');
    if (selectAllBtn) {
      selectAllBtn.addEventListener('click', () => {
        const students = Data.getStudentsByClass(selectedClassId);
        students.forEach(s => {
          statusMap[s.id] = 'Present';
        });
        Components.showToast(I18n.t('attendance.selectAllPresent', 'All students marked as Present.'), 'info', 2000);
        this.render(container);
      });
    }

    container.querySelectorAll('.toggle-present-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        statusMap[btn.dataset.studentId] = 'Present';
        this.render(container);
      });
    });

    container.querySelectorAll('.toggle-absent-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        statusMap[btn.dataset.studentId] = 'Absent';
        this.render(container);
      });
    });

    const saveBtn = container.querySelector('#save-attendance-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const user = Auth.getCurrentUser();
        const teacherId = user.teacherId || '';

        const res = Data.saveAttendanceBatch(selectedClassId, selectedDate, teacherId, statusMap);
        if (res.success) {
          Components.showToast(
            res.wasUpdate 
              ? `Attendance session for ${selectedDate} updated.` 
              : `Attendance for ${res.count} students saved successfully.`,
            'success'
          );
          this.render(container);
        }
      });
    }

    container.querySelectorAll('.mark-excused-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const studentId = btn.dataset.studentId;
        const student = Data.getStudentById(studentId);
        this.openExcuseReasonModal(student, container, false);
      });
    });

    container.querySelectorAll('.history-excuse-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const recordId = btn.dataset.id;
        const studentName = btn.dataset.name;
        this.openExcuseReasonModal({ fullName: studentName }, container, true, recordId);
      });
    });
  },

  openExcuseReasonModal(student, parentContainer, fromHistory = false, recordId = null) {
    const content = `
      <form id="excuse-form" class="space-y-4 text-xs">
        <p class="text-slate-600">
          Enter official justification for excusing <strong>${student.fullName}</strong> on <strong>${selectedDate}</strong>:
        </p>
        <div>
          <label class="block font-semibold text-slate-700 mb-1">${I18n.t('attendance.excuseReason', 'Excuse Reason')} <span class="text-rose-500">*</span></label>
          <textarea 
            name="reason" 
            required 
            rows="3" 
            placeholder="${I18n.t('attendance.reasonPlaceholder', 'e.g. Verified medical note...')}" 
            class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
          ></textarea>
        </div>
        <div class="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <button type="button" id="cancel-excuse-btn" class="px-3.5 py-1.5 text-xs text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">${I18n.t('common.cancel', 'Cancel')}</button>
          <button type="submit" class="px-4 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm">${I18n.t('attendance.authorizeExcuse', 'Authorize Excuse')}</button>
        </div>
      </form>
    `;

    Components.openModal(content, I18n.t('attendance.authorizeExcuse', 'Authorize Excused Absence'), { maxWidth: 'max-w-md' });

    document.getElementById('cancel-excuse-btn').addEventListener('click', () => Components.closeModal());

    document.getElementById('excuse-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const reason = new FormData(e.target).get('reason');

      if (fromHistory && recordId) {
        Data.updateAttendanceRecord(recordId, 'Excused', reason);
      } else {
        statusMap[student.id] = 'Excused';
      }

      Components.closeModal();
      Components.showToast(`Absence for ${student.fullName} authorized as Excused.`, 'success');
      this.render(parentContainer);
    });
  }
};
