/**
 * AL-IMAAMA - Student Management Module
 * Implements 7-field registration, search/filter, CRUD operations, profile tabs, export,
 * multi-language translations, and role-based student scoping (teachers only see their assigned students, read-only).
 */

import { Data } from './data.js';
import { Storage } from './storage.js';
import { Auth } from './auth.js';
import { Permissions } from './permissions.js';
import { Components } from './components.js';
import { I18n } from './i18n.js';
import { StudentImport } from './student-import.js';
import { API } from './api.js';

let currentSearch = '';
let currentClassFilter = '';
let currentGenderFilter = '';

export const StudentsView = {
  render(container) {
    const user = Auth.getCurrentUser();
    const isAdmin = Permissions.isAdmin(user);
    const teacher = user.teacherDetails || Data.getTeacherByEmail(user.email);
    const classes = Data.getClasses();
    const allStudents = Data.getStudents();

    // Restrict visible students and classes if Teacher
    let availableClasses = classes;
    let baseStudents = allStudents;

    if (!isAdmin && teacher) {
      const assignedClassIds = teacher.assignedClassIds || [];
      availableClasses = classes.filter(c => assignedClassIds.includes(c.id));
      baseStudents = allStudents.filter(s => assignedClassIds.includes(s.classId));
    }

    // Apply search and filters
    const filtered = baseStudents.filter(s => {
      const matchSearch = !currentSearch || 
        s.fullName.toLowerCase().includes(currentSearch.toLowerCase()) ||
        String(s.admissionNumber || s.id).toLowerCase().includes(currentSearch.toLowerCase()) ||
        s.parentPhone.includes(currentSearch);
      
      const matchClass = !currentClassFilter || s.classId === currentClassFilter;
      const matchGender = !currentGenderFilter || s.gender === currentGenderFilter;

      return matchSearch && matchClass && matchGender;
    });

    const canAdd = isAdmin && Permissions.hasPermission(user, 'students', 'add');
    const canEdit = isAdmin && Permissions.hasPermission(user, 'students', 'edit');
    const canDelete = isAdmin && Permissions.hasPermission(user, 'students', 'delete');
    const canImport = isAdmin && Permissions.hasPermission(user, 'students', 'import');
    const canExport = Permissions.hasPermission(user, 'students', 'export');

    container.innerHTML = `
      <div class="space-y-6">
        <!-- Module Header -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold tracking-tight text-slate-900">${I18n.t('students.title', 'Student Directory')}</h1>
            <p class="text-sm text-slate-500 mt-1">
              ${isAdmin ? I18n.t('students.sub', 'Manage student registrations, demographic profiles, and student records across all classes.') : I18n.t('students.teacherSub', 'Students registered in your assigned classes.')}
            </p>
          </div>
          <div class="flex items-center gap-2">
            ${canExport ? `
              <button id="export-students-btn" class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                ${Components.icon('download', 'w-4 h-4')} ${I18n.t('students.exportCsv', 'Export CSV')}
              </button>
            ` : ''}
            ${canImport ? `
              <button id="import-students-btn" class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                ${Components.icon('upload', 'w-4 h-4')} ${I18n.t('students.importStudents', 'Import Students')}
              </button>
            ` : ''}
            ${canAdd ? `
              <button id="add-student-btn" class="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors">
                ${Components.icon('plus', 'w-4 h-4')} ${I18n.t('students.addStudent', 'Add Student')}
              </button>
            ` : ''}
          </div>
        </div>

        <!-- Filter & Search Bar -->
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
          <div class="relative w-full md:w-80">
            <span class="absolute inset-y-0 ${I18n.isRTL() ? 'right-0 pr-3' : 'left-0 pl-3'} flex items-center pointer-events-none text-slate-400">
              ${Components.icon('search', 'w-4 h-4')}
            </span>
            <input 
              type="text" 
              id="student-search-input" 
              placeholder="${I18n.t('students.searchPlaceholder', 'Search by name, ID, or phone...')}" 
              value="${currentSearch}"
              class="w-full ${I18n.isRTL() ? 'pr-9 pl-4' : 'pl-9 pr-4'} py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all text-slate-900"
            />
          </div>

          <div class="flex items-center gap-2 w-full md:w-auto">
            <select id="student-class-filter" class="w-full md:w-44 py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-700">
              <option value="">${I18n.t('students.allClasses', 'All Classes')} (${baseStudents.length})</option>
              ${availableClasses.map(c => `
                <option value="${c.id}" ${currentClassFilter === c.id ? 'selected' : ''}>
                  ${c.name} (${baseStudents.filter(s => s.classId === c.id).length})
                </option>
              `).join('')}
            </select>

            <select id="student-gender-filter" class="w-full md:w-36 py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-700">
              <option value="">${I18n.t('students.allGenders', 'All Genders')}</option>
              <option value="Male" ${currentGenderFilter === 'Male' ? 'selected' : ''}>${I18n.t('students.male', 'Male')}</option>
              <option value="Female" ${currentGenderFilter === 'Female' ? 'selected' : ''}>${I18n.t('students.female', 'Female')}</option>
            </select>

            ${(currentSearch || currentClassFilter || currentGenderFilter) ? `
              <button id="clear-student-filters-btn" class="px-2.5 py-2 text-xs text-slate-500 hover:text-slate-800 transition-colors" title="Clear Filters">
                ${Components.icon('x', 'w-4 h-4')}
              </button>
            ` : ''}
          </div>
        </div>

        <!-- Student Data Table -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div class="overflow-x-auto custom-scrollbar">
            <table class="w-full text-left text-xs text-slate-600">
              <thead class="bg-slate-50/80 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th class="py-3.5 px-4">${I18n.t('students.studentId', 'Student ID')}</th>
                  <th class="py-3.5 px-4">${I18n.t('students.fullName', 'Full Name')}</th>
                  <th class="py-3.5 px-4">${I18n.t('students.gender', 'Gender')}</th>
                  <th class="py-3.5 px-4">${I18n.t('students.parentPhone', 'Parent Phone')}</th>
                  <th class="py-3.5 px-4">${I18n.t('students.classLabel', 'Class')}</th>
                  <th class="py-3.5 px-4 text-right">${I18n.t('common.actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${filtered.length > 0 ? filtered.map(student => {
                  const cls = classes.find(c => c.id === student.classId);
                  return `
                    <tr class="hover:bg-slate-50/80 transition-colors">
                      <td class="py-3 px-4 font-mono font-medium text-blue-600">${student.admissionNumber || student.id}</td>
                      <td class="py-3 px-4 font-semibold text-slate-900">${student.fullName}</td>
                      <td class="py-3 px-4">
                        <span class="inline-block px-2 py-0.5 rounded text-[11px] font-medium ${student.gender === 'Female' ? 'bg-rose-50 text-rose-700' : 'bg-blue-50 text-blue-700'}">
                          ${student.gender === 'Female' ? I18n.t('students.female', 'Female') : I18n.t('students.male', 'Male')}
                        </span>
                      </td>
                      <td class="py-3 px-4 font-mono text-slate-600">${student.parentPhone}</td>
                      <td class="py-3 px-4">
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-800">
                          ${cls ? cls.name : 'Unassigned'}
                        </span>
                      </td>
                      <td class="py-3 px-4 text-right whitespace-nowrap">
                        <div class="inline-flex items-center gap-1">
                          <button class="view-student-btn p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors" data-id="${student.id}" title="${I18n.t('common.view', 'View Profile')}">
                            ${Components.icon('eye', 'w-4 h-4')}
                          </button>
                          ${canEdit ? `
                            <button class="edit-student-btn p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-md transition-colors" data-id="${student.id}" title="${I18n.t('common.edit', 'Edit Student')}">
                              ${Components.icon('edit', 'w-4 h-4')}
                            </button>
                          ` : ''}
                          ${canDelete ? `
                            <button class="delete-student-btn p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors" data-id="${student.id}" title="${I18n.t('common.delete', 'Delete Student')}">
                              ${Components.icon('trash-2', 'w-4 h-4')}
                            </button>
                          ` : ''}
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('') : `
                  <tr>
                    <td colspan="6" class="p-8">
                      ${Components.emptyState(
                        'No students found', 
                        'No student records match the active search or filter criteria.',
                        canAdd ? `<button id="empty-add-student-btn" class="px-3.5 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">${I18n.t('students.addStudent', 'Add Student')}</button>` : ''
                      )}
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
          
          <!-- Table Footer Status -->
          <div class="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <span>Showing <strong class="text-slate-800 font-semibold">${filtered.length}</strong> of <strong class="text-slate-800 font-semibold">${baseStudents.length}</strong> students</span>
            <span class="text-slate-400">${isAdmin ? 'Institutional Directory' : 'Assigned Class Roster'}</span>
          </div>
        </div>
      </div>
    `;

    this.bindEvents(container, baseStudents);
  },

  bindEvents(container, baseStudents) {
    const searchInput = container.querySelector('#student-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        currentSearch = e.target.value;
        this.render(container);
      });
    }

    const classFilter = container.querySelector('#student-class-filter');
    if (classFilter) {
      classFilter.addEventListener('change', (e) => {
        currentClassFilter = e.target.value;
        this.render(container);
      });
    }

    const genderFilter = container.querySelector('#student-gender-filter');
    if (genderFilter) {
      genderFilter.addEventListener('change', (e) => {
        currentGenderFilter = e.target.value;
        this.render(container);
      });
    }

    const clearBtn = container.querySelector('#clear-student-filters-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        currentSearch = '';
        currentClassFilter = '';
        currentGenderFilter = '';
        this.render(container);
      });
    }

    const addBtn = container.querySelector('#add-student-btn');
    if (addBtn) addBtn.addEventListener('click', () => this.openStudentModal(null, container));

    const importBtn = container.querySelector('#import-students-btn');
    if (importBtn) {
      importBtn.addEventListener('click', () => {
        StudentImport.openImportModal(() => this.render(container));
      });
    }

    const emptyAddBtn = container.querySelector('#empty-add-student-btn');
    if (emptyAddBtn) emptyAddBtn.addEventListener('click', () => this.openStudentModal(null, container));

    const exportBtn = container.querySelector('#export-students-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportToCSV(baseStudents));
    }

    container.querySelectorAll('.view-student-btn').forEach(btn => {
      btn.addEventListener('click', () => this.openStudentProfile(btn.dataset.id));
    });

    container.querySelectorAll('.edit-student-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const student = Data.getStudentById(btn.dataset.id);
        this.openStudentModal(student, container);
      });
    });

    container.querySelectorAll('.delete-student-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const student = Data.getStudentById(btn.dataset.id);
        if (!student) return;

        Components.confirmDialog({
          title: I18n.t('students.deleteConfirmTitle', 'Delete Student Record'),
          message: `${I18n.t('students.deleteConfirmMsg', 'Are you sure you want to delete')} <strong>${student.fullName}</strong> (${student.id})?`,
          confirmText: I18n.t('common.delete', 'Delete'),
          isDestructive: true,
          onConfirm: () => {
            Data.deleteStudent(student.id);
            Components.showToast(`Student ${student.fullName} deleted.`, 'success');
            this.render(container);
          }
        });
      });
    });
  },

  openStudentModal(existingStudent = null, parentContainer) {
    const isEdit = !!existingStudent;
    const classes = Data.getClasses();
    if (!isEdit && classes.length === 0) {
      Components.showToast('No classes are available from the backend. Create a class before registering a student.', 'error', 5000);
      return;
    }
    const autoId = isEdit
      ? (existingStudent.admissionNumber || existingStudent.id)
      : Storage.generateNextStudentId();
    const today = new Date().toISOString().split('T')[0];

    const content = `
      <form id="student-form" class="space-y-4 text-xs">
        <div>
          <label class="block font-semibold text-slate-700 mb-1">1. ${I18n.t('students.studentId', 'Student ID')} (Auto)</label>
          <input 
            type="text" 
            name="id" 
            value="${autoId}" 
            readonly 
            class="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg font-mono text-blue-700 font-semibold cursor-not-allowed"
          />
        </div>

        <div>
          <label class="block font-semibold text-slate-700 mb-1">2. ${I18n.t('students.fullName', 'Full Name')} <span class="text-rose-500">*</span></label>
          <input 
            type="text" 
            name="fullName" 
            required 
            placeholder="e.g. Ayan Hersi Warsame" 
            value="${isEdit ? existingStudent.fullName : ''}"
            class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
          />
        </div>

        <div>
          <label class="block font-semibold text-slate-700 mb-1">3. ${I18n.t('students.gender', 'Gender')} <span class="text-rose-500">*</span></label>
          <select name="gender" required class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none">
            <option value="Male" ${isEdit && existingStudent.gender === 'Male' ? 'selected' : ''}>${I18n.t('students.male', 'Male')}</option>
            <option value="Female" ${isEdit && existingStudent.gender === 'Female' ? 'selected' : ''}>${I18n.t('students.female', 'Female')}</option>
          </select>
        </div>

        <div>
          <label class="block font-semibold text-slate-700 mb-1">4. ${I18n.t('students.dob', 'Date of Birth')} <span class="text-rose-500">*</span></label>
          <input 
            type="date" 
            name="dateOfBirth" 
            required 
            value="${isEdit ? existingStudent.dateOfBirth : '2018-01-01'}"
            class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
          />
        </div>

        <div>
          <label class="block font-semibold text-slate-700 mb-1">5. ${I18n.t('students.parentPhone', 'Parent Phone Number')} <span class="text-rose-500">*</span></label>
          <input 
            type="tel" 
            name="parentPhone" 
            required 
            placeholder="e.g. +252 63 411 2233" 
            value="${isEdit ? existingStudent.parentPhone : ''}"
            class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none font-mono"
          />
        </div>

        <div>
          <label class="block font-semibold text-slate-700 mb-1">6. ${I18n.t('students.classLabel', 'Class')} <span class="text-rose-500">*</span></label>
          <select name="classId" required class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none">
            ${classes.map(c => `
              <option value="${c.id}" ${isEdit && existingStudent.classId === c.id ? 'selected' : ''}>
                ${c.name} (${c.academicYear})
              </option>
            `).join('')}
          </select>
        </div>

        <div>
          <label class="block font-semibold text-slate-700 mb-1">7. ${I18n.t('students.regDate', 'Registration Date')} <span class="text-rose-500">*</span></label>
          <input 
            type="date" 
            name="registrationDate" 
            required 
            value="${isEdit ? existingStudent.registrationDate : today}"
            class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
          />
        </div>

        <div class="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <button type="button" id="modal-cancel" class="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
            ${I18n.t('common.cancel', 'Cancel')}
          </button>
          <button type="submit" class="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors">
            ${isEdit ? I18n.t('common.save', 'Save Changes') : I18n.t('students.addStudent', 'Register Student')}
          </button>
        </div>
      </form>
    `;

    Components.openModal(content, isEdit ? `${I18n.t('common.edit', 'Edit')}: ${existingStudent.fullName}` : I18n.t('students.addStudent', 'New Student Registration'), { maxWidth: 'max-w-lg' });

    document.getElementById('modal-cancel').addEventListener('click', () => Components.closeModal());

    if (!isEdit && API.hasToken()) {
      API.students.nextId().then(result => {
        const idInput = document.querySelector('#student-form [name="id"]');
        if (idInput && result.nextId) idInput.value = result.nextId;
      }).catch(error => {
        console.warn('Could not retrieve the next student admission number:', error);
      });
    }

    document.getElementById('student-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const submitButton = form.querySelector('button[type="submit"]');
      const originalButtonText = submitButton ? submitButton.innerHTML : '';
      const formData = new FormData(form);

      const studentPayload = {
        id: formData.get('id'),
        fullName: formData.get('fullName'),
        gender: formData.get('gender'),
        dateOfBirth: formData.get('dateOfBirth'),
        parentPhone: formData.get('parentPhone'),
        classId: formData.get('classId'),
        registrationDate: formData.get('registrationDate')
      };

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = isEdit ? 'Saving…' : 'Registering…';
      }
      try {
        if (isEdit) {
          Data.updateStudent(existingStudent.id, studentPayload);
          Components.showToast(`Updated student ${studentPayload.fullName}.`, 'success');
        } else {
          await Data.addStudent(studentPayload);
          Components.showToast(`Registered student ${studentPayload.fullName}.`, 'success');
        }

        Components.closeModal();
        this.render(parentContainer);
      } catch (error) {
        Components.showToast(`Student registration failed: ${error.message || 'The backend could not save this record.'}`, 'error', 6000);
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.innerHTML = originalButtonText;
        }
      }
    });
  },

  openStudentProfile(studentId) {
    const student = Data.getStudentById(studentId);
    if (!student) return;

    const user = Auth.getCurrentUser();
    const isAdmin = Permissions.isAdmin(user);
    if (!isAdmin) {
      const assignedClassIds = Permissions.getTeacherAssignedClassIds(user);
      if (!assignedClassIds.includes(student.classId)) {
        Components.showToast('Access denied: You can only view student profiles within your assigned classes.', 'warning', 3500);
        return;
      }
    }

    const classes = Data.getClasses();
    const currentClass = classes.find(c => c.id === student.classId);
    const attendanceRecords = Data.getAttendance({ studentId });
    const payments = Data.getPayments({ studentId });
    const promotions = Data.getPromotionHistory(studentId);
    const settings = Data.getSettings();
    const currency = settings.currencySymbol || '$';

    const exams = Data.getExaminations({}, user);
    const subjects = Data.getSubjects();
    const teacherAssignedSubIds = !isAdmin ? Permissions.getTeacherAssignedSubjectIds(user) : null;

    const studentExams = [];
    exams.forEach(ex => {
      if (ex.marks && ex.marks[student.id]) {
        const studentMarkObj = ex.marks[student.id];
        // If teacher, only keep scores for their assigned subjects belonging to that exam's class
        if (!isAdmin && teacherAssignedSubIds) {
          const teacherScores = [];
          teacherAssignedSubIds.forEach(subId => {
            const subObj = subjects.find(s => s.id === subId && s.classId === ex.classId);
            if (subObj && studentMarkObj[subId] !== undefined && studentMarkObj[subId] !== null) {
              teacherScores.push({
                subjectName: subObj.name,
                maxMarks: subObj.maxMarks,
                score: studentMarkObj[subId]
              });
            }
          });
          if (teacherScores.length > 0) {
            studentExams.push({
              examType: ex.examType,
              term: ex.term,
              academicYear: ex.academicYear,
              teacherScores
            });
          }
        } else {
          studentExams.push({
            examType: ex.examType,
            term: ex.term,
            academicYear: ex.academicYear,
            data: studentMarkObj
          });
        }
      }
    });

    const totalAtt = attendanceRecords.length;
    const presentAtt = attendanceRecords.filter(a => a.status === 'Present').length;
    const absentAtt = attendanceRecords.filter(a => a.status === 'Absent').length;
    const excusedAtt = attendanceRecords.filter(a => a.status === 'Excused').length;
    const attRate = totalAtt > 0 ? Math.round((presentAtt / totalAtt) * 100) : 100;

    const content = `
      <div class="space-y-6">
        <!-- Top Banner Header with Official Emblem -->
        <div class="flex items-start justify-between bg-slate-50 p-4 rounded-xl border border-slate-200 border-t-2 border-t-blue-900">
          <div class="flex items-center gap-3">
            ${Components.getLogoHtml('w-12 h-12')}
            <div>
              <span class="text-[10px] font-bold uppercase tracking-wider text-amber-600 block">MADARASATUL AL-IMAAM</span>
              <h2 class="text-base font-bold text-slate-900">${student.fullName}</h2>
              <p class="text-xs text-slate-500 font-mono">ID: ${student.admissionNumber || student.id} · ${currentClass ? currentClass.name : 'Unassigned'} · ${student.registrationDate}</p>
            </div>
          </div>
          <span class="inline-block px-2.5 py-1 text-xs font-semibold rounded-md ${student.gender === 'Female' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}">
            ${student.gender === 'Female' ? I18n.t('students.female', 'Female') : I18n.t('students.male', 'Male')}
          </span>
        </div>

        <!-- Tabs Navigation -->
        <div class="border-b border-slate-200">
          <nav class="flex space-x-4 text-xs font-medium" id="profile-tabs-nav">
            <button class="profile-tab-btn active pb-2 border-b-2 border-blue-600 text-blue-600 font-semibold" data-tab="tab-overview">${I18n.t('students.tabOverview', 'Overview')}</button>
            <button class="profile-tab-btn pb-2 border-b-2 border-transparent text-slate-500 hover:text-slate-800" data-tab="tab-attendance">${I18n.t('students.tabAttendance', 'Attendance')} (${totalAtt})</button>
            <button class="profile-tab-btn pb-2 border-b-2 border-transparent text-slate-500 hover:text-slate-800" data-tab="tab-exams">${I18n.t('students.tabExams', 'Examinations')} (${studentExams.length})</button>
            ${isAdmin ? `<button class="profile-tab-btn pb-2 border-b-2 border-transparent text-slate-500 hover:text-slate-800" data-tab="tab-payments">${I18n.t('students.tabPayments', 'Fee History')} (${payments.length})</button>` : ''}
            <button class="profile-tab-btn pb-2 border-b-2 border-transparent text-slate-500 hover:text-slate-800" data-tab="tab-promotions">${I18n.t('students.tabPromotions', 'Promotion History')}</button>
          </nav>
        </div>

        <!-- Tab 1: Overview -->
        <div id="tab-overview" class="profile-tab-pane space-y-4">
          <div class="grid grid-cols-2 gap-4 text-xs">
            <div class="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span class="text-slate-400 block text-[11px]">${I18n.t('students.dob', 'Date of Birth')}</span>
              <p class="font-semibold text-slate-900 mt-0.5 tabular-nums">${student.dateOfBirth}</p>
            </div>
            <div class="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span class="text-slate-400 block text-[11px]">${I18n.t('students.parentPhone', 'Parent Phone Number')}</span>
              <p class="font-semibold text-slate-900 mt-0.5 font-mono">${student.parentPhone}</p>
            </div>
            <div class="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span class="text-slate-400 block text-[11px]">${I18n.t('students.classLabel', 'Enrolled Class')}</span>
              <p class="font-semibold text-slate-900 mt-0.5">${currentClass ? currentClass.name : 'None'}</p>
            </div>
            <div class="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span class="text-slate-400 block text-[11px]">${I18n.t('students.tabAttendance', 'Attendance Rate')}</span>
              <p class="font-semibold text-emerald-600 mt-0.5 tabular-nums">${attRate}%</p>
            </div>
          </div>
        </div>

        <!-- Tab 2: Attendance History -->
        <div id="tab-attendance" class="profile-tab-pane hidden space-y-4">
          <div class="grid grid-cols-3 gap-3 text-center text-xs">
            <div class="p-2.5 bg-emerald-50 rounded-lg border border-emerald-200">
              <span class="text-emerald-700 block text-[10px] uppercase font-bold">${I18n.t('attendance.present', 'Present')}</span>
              <span class="text-lg font-bold text-emerald-800 tabular-nums">${presentAtt}</span>
            </div>
            <div class="p-2.5 bg-rose-50 rounded-lg border border-rose-200">
              <span class="text-rose-700 block text-[10px] uppercase font-bold">${I18n.t('attendance.absent', 'Absent')}</span>
              <span class="text-lg font-bold text-rose-800 tabular-nums">${absentAtt}</span>
            </div>
            <div class="p-2.5 bg-amber-50 rounded-lg border border-amber-200">
              <span class="text-amber-700 block text-[10px] uppercase font-bold">${I18n.t('attendance.excused', 'Excused')}</span>
              <span class="text-lg font-bold text-amber-800 tabular-nums">${excusedAtt}</span>
            </div>
          </div>

          <div class="border border-slate-200 rounded-lg overflow-hidden max-h-56 overflow-y-auto custom-scrollbar">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-100 text-slate-700 border-b border-slate-200">
                <tr>
                  <th class="py-2 px-3">${I18n.t('common.date', 'Date')}</th>
                  <th class="py-2 px-3">${I18n.t('common.status', 'Status')}</th>
                  <th class="py-2 px-3">${I18n.t('attendance.excuseReason', 'Details')}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${attendanceRecords.length > 0 ? attendanceRecords.map(att => `
                  <tr>
                    <td class="py-2 px-3 tabular-nums font-mono">${att.date}</td>
                    <td class="py-2 px-3">
                      <span class="px-2 py-0.5 rounded text-[10px] font-medium ${
                        att.status === 'Present' ? 'bg-emerald-50 text-emerald-700' :
                        att.status === 'Excused' ? 'bg-amber-50 text-amber-700' :
                        'bg-rose-50 text-rose-700'
                      }">
                        ${I18n.t(`attendance.${att.status.toLowerCase()}`, att.status)}
                      </span>
                    </td>
                    <td class="py-2 px-3 text-slate-500">${att.excusedReason || '-'}</td>
                  </tr>
                `).join('') : `
                  <tr><td colspan="3" class="py-4 text-center text-slate-400">No attendance logs found</td></tr>
                `}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Tab 3: Examination Results (Strict Marks Privacy) -->
        <div id="tab-exams" class="profile-tab-pane hidden space-y-4">
          ${studentExams.length > 0 ? studentExams.map(ex => `
            <div class="border border-slate-200 rounded-lg p-3 bg-slate-50/50 space-y-2">
              <div class="flex items-center justify-between text-xs">
                <span class="font-bold text-slate-900">${ex.examType} (${ex.term})</span>
                <span class="text-slate-500 font-mono">${ex.academicYear}</span>
              </div>
              ${ex.teacherScores ? `
                <div class="space-y-1.5 pt-1">
                  ${ex.teacherScores.map(ts => `
                    <div class="flex items-center justify-between bg-white p-2 rounded border border-slate-200 text-xs">
                      <span class="font-semibold text-slate-800">${ts.subjectName} <span class="text-[10px] text-slate-400 font-normal">(Max: ${ts.maxMarks})</span></span>
                      <span class="font-bold text-blue-600 tabular-nums">${ts.score} pts</span>
                    </div>
                  `).join('')}
                </div>
              ` : `
                <div class="flex items-center justify-between bg-white p-2.5 rounded border border-slate-200 text-xs">
                  <span class="text-slate-600">${I18n.t('examinations.total', 'Total Achieved')}:</span>
                  <span class="font-bold text-blue-600 tabular-nums text-sm">${ex.data.total} pts</span>
                </div>
              `}
            </div>
          `).join('') : `
            <p class="text-xs text-slate-500 py-6 text-center">No examination records registered yet for this student.</p>
          `}
        </div>

        <!-- Tab 4: Fee & Payment History -->
        <div id="tab-payments" class="profile-tab-pane hidden space-y-4">
          <div class="border border-slate-200 rounded-lg overflow-hidden max-h-56 overflow-y-auto custom-scrollbar">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-100 text-slate-700 border-b border-slate-200">
                <tr>
                  <th class="py-2 px-3">${I18n.t('common.date', 'Date')}</th>
                  <th class="py-2 px-3">${I18n.t('payments.feeCategory', 'Category')}</th>
                  <th class="py-2 px-3">${I18n.t('payments.paymentMethod', 'Method')}</th>
                  <th class="py-2 px-3 text-right">${I18n.t('payments.amountPaid', 'Amount')}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${payments.length > 0 ? payments.map(pay => `
                  <tr>
                    <td class="py-2 px-3 tabular-nums">${pay.paymentDate}</td>
                    <td class="py-2 px-3 font-medium">${pay.feeCategory}</td>
                    <td class="py-2 px-3"><span class="px-1.5 py-0.5 rounded bg-slate-100 text-[11px] font-mono">${pay.paymentMethod}</span></td>
                    <td class="py-2 px-3 text-right font-bold text-emerald-600 tabular-nums">${currency}${pay.amountPaid.toFixed(2)}</td>
                  </tr>
                `).join('') : `
                  <tr><td colspan="4" class="py-4 text-center text-slate-400">No payment records found</td></tr>
                `}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Tab 5: Promotion History -->
        <div id="tab-promotions" class="profile-tab-pane hidden space-y-4">
          ${promotions.length > 0 ? `
            <div class="border border-slate-200 rounded-lg overflow-hidden">
              <table class="w-full text-left text-xs">
                <thead class="bg-slate-100 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th class="py-2 px-3">Academic Year</th>
                    <th class="py-2 px-3">Previous Class</th>
                    <th class="py-2 px-3">Promoted To</th>
                    <th class="py-2 px-3">Date</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  ${promotions.map(p => {
                    const prevC = classes.find(c => c.id === p.previousClassId);
                    const newC = classes.find(c => c.id === p.newClassId);
                    return `
                      <tr>
                        <td class="py-2 px-3 font-mono">${p.academicYear}</td>
                        <td class="py-2 px-3 text-slate-500">${prevC ? prevC.name : p.previousClassId}</td>
                        <td class="py-2 px-3 font-semibold text-emerald-600">${newC ? newC.name : p.newClassId}</td>
                        <td class="py-2 px-3 tabular-nums">${p.promotedDate}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          ` : `
            <p class="text-xs text-slate-500 py-6 text-center">No promotion history recorded yet for this student.</p>
          `}
        </div>
      </div>
    `;

    Components.openModal(content, `${I18n.t('students.profileTitle', 'Student Profile')}: ${student.fullName}`, { maxWidth: 'max-w-2xl' });

    const tabBtns = document.querySelectorAll('.profile-tab-btn');
    const tabPanes = document.querySelectorAll('.profile-tab-pane');

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => {
          b.classList.remove('active', 'border-blue-600', 'text-blue-600', 'font-semibold');
          b.classList.add('border-transparent', 'text-slate-500');
        });
        btn.classList.add('active', 'border-blue-600', 'text-blue-600', 'font-semibold');
        btn.classList.remove('border-transparent', 'text-slate-500');

        const target = btn.dataset.tab;
        tabPanes.forEach(pane => {
          if (pane.id === target) {
            pane.classList.remove('hidden');
          } else {
            pane.classList.add('hidden');
          }
        });
      });
    });
  },

  exportToCSV(studentsToExport) {
    const students = studentsToExport || Data.getStudents();
    const classes = Data.getClasses();

    const headers = [
      I18n.t('students.studentId', 'Student ID'),
      I18n.t('students.fullName', 'Full Name'),
      I18n.t('students.gender', 'Gender'),
      I18n.t('students.dob', 'Date of Birth'),
      I18n.t('students.parentPhone', 'Parent Phone'),
      I18n.t('students.classLabel', 'Class'),
      I18n.t('students.regDate', 'Registration Date')
    ];

    const rows = students.map(s => {
      const cls = classes.find(c => c.id === s.classId);
      return [
        `"${s.admissionNumber || s.id}"`,
        `"${s.fullName.replace(/"/g, '""')}"`,
        `"${s.gender}"`,
        `"${s.dateOfBirth}"`,
        `"${s.parentPhone}"`,
        `"${cls ? cls.name : ''}"`,
        `"${s.registrationDate}"`
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `AL_IMAAMA_Students_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    Components.showToast('Student list exported to CSV.', 'success');
  }
};
