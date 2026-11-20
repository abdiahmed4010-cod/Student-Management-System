/**
 * AL-IMAAMA - Teacher Management Module
 * Governs teacher academic profiles, assigned classes, curriculum subjects, and teaching workload.
 */

import { Data } from './data.js';
import { Components } from './components.js';

export const TeachersView = {
  render(container) {
    const teachers = Data.getTeachers();
    const classes = Data.getClasses();
    const subjects = Data.getSubjects();

    container.innerHTML = `
      <div class="space-y-6">
        <!-- Module Header -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold tracking-tight text-slate-900">Teacher Directory</h1>
            <p class="text-sm text-slate-500 mt-1">Manage teaching staff, class assignments, subject allocations, and teacher accounts.</p>
          </div>
          <button id="add-teacher-btn" class="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors self-start sm:self-auto">
            ${Components.icon('plus', 'w-4 h-4')} Add Teacher
          </button>
        </div>

        <!-- Teachers Table -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div class="overflow-x-auto custom-scrollbar">
            <table class="w-full text-left text-xs text-slate-600">
              <thead class="bg-slate-50/80 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th class="py-3.5 px-4">Teacher ID</th>
                  <th class="py-3.5 px-4">Full Name</th>
                  <th class="py-3.5 px-4">Email</th>
                  <th class="py-3.5 px-4">Phone Number</th>
                  <th class="py-3.5 px-4">Assigned Classes</th>
                  <th class="py-3.5 px-4">Assigned Subjects</th>
                  <th class="py-3.5 px-4">Status</th>
                  <th class="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${teachers.map(t => {
                  const assignedClasses = classes.filter(c => (t.assignedClassIds || []).includes(c.id));
                  const assignedSubs = subjects.filter(s => (t.assignedSubjectIds || []).includes(s.id));

                  return `
                    <tr class="hover:bg-slate-50/80 transition-colors">
                      <td class="py-3 px-4 font-mono font-medium text-blue-600">${t.id}</td>
                      <td class="py-3 px-4 font-semibold text-slate-900">${t.fullName}</td>
                      <td class="py-3 px-4 text-slate-600">${t.email}</td>
                      <td class="py-3 px-4 font-mono text-slate-600">${t.phone}</td>
                      <td class="py-3 px-4">
                        <div class="flex flex-wrap gap-1">
                          ${assignedClasses.length > 0 ? assignedClasses.map(c => `
                            <span class="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-100">
                              ${c.name}
                            </span>
                          `).join('') : '<span class="text-slate-400">None</span>'}
                        </div>
                      </td>
                      <td class="py-3 px-4">
                        <div class="flex flex-wrap gap-1">
                          ${assignedSubs.length > 0 ? assignedSubs.slice(0, 2).map(s => `
                            <span class="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">
                              ${s.name}
                            </span>
                          `).join('') + (assignedSubs.length > 2 ? `<span class="text-[10px] text-slate-400 font-medium">+${assignedSubs.length - 2} more</span>` : '') : '<span class="text-slate-400">None</span>'}
                        </div>
                      </td>
                      <td class="py-3 px-4">
                        <span class="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                          ${t.accountStatus || 'Active'}
                        </span>
                      </td>
                      <td class="py-3 px-4 text-right whitespace-nowrap">
                        <div class="inline-flex items-center gap-1">
                          <button class="view-teacher-btn p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-50 rounded-md" data-id="${t.id}" title="View Teaching Schedule">
                            ${Components.icon('eye', 'w-4 h-4')}
                          </button>
                          <button class="edit-teacher-btn p-1.5 text-slate-400 hover:text-amber-600 hover:bg-slate-50 rounded-md" data-id="${t.id}" title="Edit Teacher">
                            ${Components.icon('edit', 'w-4 h-4')}
                          </button>
                          <button class="delete-teacher-btn p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-50 rounded-md" data-id="${t.id}" title="Delete Teacher">
                            ${Components.icon('trash-2', 'w-4 h-4')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
          <div class="px-4 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
            <span>Teachers receive access strictly to their assigned classes and subjects.</span>
            <span>Total Staff: <strong>${teachers.length}</strong></span>
          </div>
        </div>
      </div>
    `;

    this.bindEvents(container);
  },

  bindEvents(container) {
    const addBtn = container.querySelector('#add-teacher-btn');
    if (addBtn) addBtn.addEventListener('click', () => this.openTeacherModal(null, container));

    container.querySelectorAll('.view-teacher-btn').forEach(btn => {
      btn.addEventListener('click', () => this.viewTeacherProfile(btn.dataset.id));
    });

    container.querySelectorAll('.edit-teacher-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const teacher = Data.getTeacherById(btn.dataset.id);
        if (teacher) this.openTeacherModal(teacher, container);
      });
    });

    container.querySelectorAll('.delete-teacher-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const teacher = Data.getTeacherById(btn.dataset.id);
        if (!teacher) return;

        Components.confirmDialog({
          title: `Delete Teacher: ${teacher.fullName}`,
          message: `Are you sure you want to remove <strong>${teacher.fullName}</strong> (${teacher.id})? This will detach assigned classes and subjects.`,
          confirmText: 'Delete Teacher',
          isDestructive: true,
          onConfirm: () => {
            Data.deleteTeacher(teacher.id);
            Components.showToast(`Teacher ${teacher.fullName} removed.`, 'success');
            this.render(container);
          }
        });
      });
    });
  },

  openTeacherModal(existing = null, parentContainer) {
    const isEdit = !!existing;
    const classes = Data.getClasses();
    const subjects = Data.getSubjects();

    const selectedClasses = existing ? (existing.assignedClassIds || []) : [];
    const selectedSubjects = existing ? (existing.assignedSubjectIds || []) : [];

    const content = `
      <form id="teacher-form" class="space-y-4 text-xs">
        <div>
          <label class="block font-semibold text-slate-700 mb-1">Full Name <span class="text-rose-500">*</span></label>
          <input 
            type="text" 
            name="fullName" 
            required 
            placeholder="e.g. Ahmed Jama" 
            value="${isEdit ? existing.fullName : ''}"
            class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
          />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-semibold text-slate-700 mb-1">Email Address <span class="text-rose-500">*</span></label>
            <input 
              type="email" 
              name="email" 
              required 
              placeholder="e.g. teacher@alimaama.demo" 
              value="${isEdit ? existing.email : ''}"
              class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">Phone Number <span class="text-rose-500">*</span></label>
            <input 
              type="tel" 
              name="phone" 
              required 
              placeholder="e.g. +252 63 444 1122" 
              value="${isEdit ? existing.phone : ''}"
              class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none font-mono"
            />
          </div>
        </div>

        <div>
          <label class="block font-semibold text-slate-700 mb-1">Specialization / Subject Area</label>
          <input 
            type="text" 
            name="specialization" 
            placeholder="e.g. Quran Memorization, Tajweed, Arabic, Fiqh" 
            value="${isEdit ? (existing.specialization || '') : ''}"
            class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
          />
        </div>

        <!-- Class Multi-assignment Checkboxes -->
        <div>
          <label class="block font-semibold text-slate-700 mb-1.5">Assign Classes</label>
          <div class="grid grid-cols-2 gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg max-h-36 overflow-y-auto custom-scrollbar">
            ${classes.map(c => `
              <label class="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-white text-slate-800">
                <input 
                  type="checkbox" 
                  name="assignedClasses" 
                  value="${c.id}" 
                  ${selectedClasses.includes(c.id) ? 'checked' : ''}
                  class="rounded text-blue-600 focus:ring-blue-500"
                />
                <span>${c.name} (${c.academicYear})</span>
              </label>
            `).join('')}
          </div>
        </div>

        <!-- Subject Multi-assignment Checkboxes -->
        <div>
          <label class="block font-semibold text-slate-700 mb-1.5">Assign Teaching Subjects</label>
          <div class="grid grid-cols-2 gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg max-h-40 overflow-y-auto custom-scrollbar">
            ${subjects.map(s => {
              const cls = classes.find(c => c.id === s.classId);
              return `
                <label class="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-white text-slate-800">
                  <input 
                    type="checkbox" 
                    name="assignedSubjects" 
                    value="${s.id}" 
                    ${selectedSubjects.includes(s.id) ? 'checked' : ''}
                    class="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>${s.name} <span class="text-slate-400 text-[10px]">(${cls ? cls.name : ''})</span></span>
                </label>
              `;
            }).join('')}
          </div>
        </div>

        <div class="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <button type="button" id="modal-cancel-tch" class="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button type="submit" class="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors">
            ${isEdit ? 'Update Teacher' : 'Add Teacher'}
          </button>
        </div>
      </form>
    `;

    Components.openModal(content, isEdit ? `Edit Teacher: ${existing.fullName}` : 'Add New Teacher', { maxWidth: 'max-w-lg' });

    document.getElementById('modal-cancel-tch').addEventListener('click', () => Components.closeModal());

    document.getElementById('teacher-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target;
      const formData = new FormData(form);

      const assignedClassIds = Array.from(form.querySelectorAll('input[name="assignedClasses"]:checked')).map(cb => cb.value);
      const assignedSubjectIds = Array.from(form.querySelectorAll('input[name="assignedSubjects"]:checked')).map(cb => cb.value);

      const payload = {
        fullName: formData.get('fullName'),
        email: formData.get('email'),
        phone: formData.get('phone'),
        specialization: formData.get('specialization'),
        assignedClassIds,
        assignedSubjectIds,
        accountStatus: 'Active'
      };

      if (isEdit) {
        Data.updateTeacher(existing.id, payload);
        Components.showToast(`Teacher ${payload.fullName} updated.`, 'success');
      } else {
        Data.addTeacher(payload);
        Components.showToast(`Teacher ${payload.fullName} added successfully.`, 'success');
      }

      Components.closeModal();
      this.render(parentContainer);
    });
  },

  viewTeacherProfile(teacherId) {
    const teacher = Data.getTeacherById(teacherId);
    if (!teacher) return;
    const classes = Data.getClasses();
    const subjects = Data.getSubjects();
    const students = Data.getStudents();

    const assignedClasses = classes.filter(c => (teacher.assignedClassIds || []).includes(c.id));
    const assignedSubs = subjects.filter(s => (teacher.assignedSubjectIds || []).includes(s.id));
    const totalStudentsTaught = students.filter(s => (teacher.assignedClassIds || []).includes(s.classId)).length;

    const content = `
      <div class="space-y-5">
        <div class="flex items-start justify-between bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div>
            <h3 class="text-base font-bold text-slate-900">${teacher.fullName}</h3>
            <p class="text-xs text-slate-500 font-mono">ID: ${teacher.id} · ${teacher.email} · ${teacher.phone}</p>
            <p class="text-xs font-medium text-blue-600 mt-1">${teacher.specialization || 'General Teacher'}</p>
          </div>
          <span class="px-2.5 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md">
            ${teacher.accountStatus}
          </span>
        </div>

        <div class="grid grid-cols-3 gap-3 text-center text-xs">
          <div class="p-3 bg-blue-50/60 rounded-lg border border-blue-100">
            <span class="text-slate-500 block text-[10px] uppercase font-bold">Assigned Classes</span>
            <span class="text-lg font-bold text-blue-700 tabular-nums">${assignedClasses.length}</span>
          </div>
          <div class="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <span class="text-slate-500 block text-[10px] uppercase font-bold">Teaching Subjects</span>
            <span class="text-lg font-bold text-slate-800 tabular-nums">${assignedSubs.length}</span>
          </div>
          <div class="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <span class="text-slate-500 block text-[10px] uppercase font-bold">Total Students</span>
            <span class="text-lg font-bold text-slate-800 tabular-nums">${totalStudentsTaught}</span>
          </div>
        </div>

        <!-- Weekly Teaching Schedule -->
        <div>
          <h4 class="text-xs font-semibold text-slate-700 mb-2">Teaching Schedule & Classroom Allocations</h4>
          <div class="border border-slate-200 rounded-lg overflow-hidden text-xs">
            <table class="w-full text-left">
              <thead class="bg-slate-100 text-slate-700 border-b border-slate-200">
                <tr>
                  <th class="py-2.5 px-3">Class</th>
                  <th class="py-2.5 px-3">Room</th>
                  <th class="py-2.5 px-3">Subjects Taught</th>
                  <th class="py-2.5 px-3 text-right">Students</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${assignedClasses.length > 0 ? assignedClasses.map(c => {
                  const classSubs = assignedSubs.filter(s => s.classId === c.id);
                  const count = students.filter(s => s.classId === c.id).length;
                  return `
                    <tr>
                      <td class="py-2 px-3 font-semibold text-slate-900">${c.name}</td>
                      <td class="py-2 px-3 text-slate-500">${c.room || 'Main Hall'}</td>
                      <td class="py-2 px-3">${classSubs.map(s => s.name).join(', ') || 'All curriculum subjects'}</td>
                      <td class="py-2 px-3 text-right tabular-nums font-medium text-slate-700">${count} students</td>
                    </tr>
                  `;
                }).join('') : `
                  <tr><td colspan="4" class="p-4 text-center text-slate-400">No classes assigned yet.</td></tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    Components.openModal(content, `Teacher Profile & Schedule: ${teacher.fullName}`, { maxWidth: 'max-w-xl' });
  }
};
