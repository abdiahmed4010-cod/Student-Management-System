/**
 * AL-IMAAMA - Class Management Module
 * Enables Admin to create, view, edit, delete classes, view enrolled students, and assign teachers.
 */

import { Data } from './data.js';
import { Components } from './components.js';

export const ClassesView = {
  render(container) {
    const classes = Data.getClasses();
    const students = Data.getStudents();
    const teachers = Data.getTeachers();
    const subjects = Data.getSubjects();

    container.innerHTML = `
      <div class="space-y-6">
        <!-- Module Header -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold tracking-tight text-slate-900">Class & Grade Management</h1>
            <p class="text-sm text-slate-500 mt-1">Configure class structures, monitor grade capacities, assign homeroom teachers, and curriculum subjects.</p>
          </div>
          <button id="add-class-btn" class="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors self-start sm:self-auto">
            ${Components.icon('plus', 'w-4 h-4')} Create Class
          </button>
        </div>

        <!-- Class Cards Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          ${classes.map(cls => {
            const classStudents = students.filter(s => s.classId === cls.id);
            const classSubjects = subjects.filter(s => s.classId === cls.id);
            const teacher = teachers.find(t => t.id === cls.teacherId);
            const fillPercentage = Math.min(100, Math.round((classStudents.length / cls.capacity) * 100));

            return `
              <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-blue-200 transition-all flex flex-col justify-between">
                <div>
                  <div class="flex items-start justify-between">
                    <div>
                      <span class="inline-block px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-blue-50 text-blue-700 rounded mb-1">
                        ${cls.academicYear}
                      </span>
                      <h3 class="text-lg font-bold text-slate-900">${cls.name} <span class="text-sm font-normal text-slate-400">· Section ${cls.section}</span></h3>
                    </div>
                    <div class="flex items-center gap-1">
                      <button class="edit-class-btn p-1.5 text-slate-400 hover:text-amber-600 hover:bg-slate-50 rounded-md" data-id="${cls.id}" title="Edit Class">
                        ${Components.icon('edit', 'w-4 h-4')}
                      </button>
                      <button class="delete-class-btn p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-50 rounded-md" data-id="${cls.id}" title="Delete Class">
                        ${Components.icon('trash-2', 'w-4 h-4')}
                      </button>
                    </div>
                  </div>

                  <div class="mt-4 space-y-2 text-xs">
                    <div class="flex items-center justify-between text-slate-600">
                      <span>Room Location:</span>
                      <span class="font-medium text-slate-800">${cls.room || 'General Hall'}</span>
                    </div>
                    <div class="flex items-center justify-between text-slate-600">
                      <span>Assigned Teacher:</span>
                      <span class="font-medium text-blue-600">${teacher ? teacher.fullName : 'Not Assigned'}</span>
                    </div>
                    <div class="flex items-center justify-between text-slate-600">
                      <span>Configured Subjects:</span>
                      <span class="font-medium text-slate-800">${classSubjects.length} Subjects</span>
                    </div>
                  </div>

                  <!-- Class Capacity Progress -->
                  <div class="mt-4 pt-3 border-t border-slate-100">
                    <div class="flex items-center justify-between text-xs mb-1.5">
                      <span class="text-slate-500">Registered Students</span>
                      <span class="font-semibold text-slate-800 tabular-nums">${classStudents.length} / ${cls.capacity} (${fillPercentage}%)</span>
                    </div>
                    <div class="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div class="h-full bg-blue-600 rounded-full transition-all" style="width: ${fillPercentage}%"></div>
                    </div>
                  </div>
                </div>

                <!-- Footer Action Buttons -->
                <div class="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <button class="view-class-students-btn font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1" data-id="${cls.id}">
                    ${Components.icon('users', 'w-3.5 h-3.5')} View Students (${classStudents.length})
                  </button>
                  <button class="view-class-subjects-btn font-medium text-slate-600 hover:text-slate-900 flex items-center gap-1" data-id="${cls.id}">
                    ${Components.icon('book-open', 'w-3.5 h-3.5')} Subjects (${classSubjects.length})
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    this.bindEvents(container);
  },

  bindEvents(container) {
    const addBtn = container.querySelector('#add-class-btn');
    if (addBtn) addBtn.addEventListener('click', () => this.openClassModal(null, container));

    container.querySelectorAll('.edit-class-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const cls = Data.getClassById(btn.dataset.id);
        this.openClassModal(cls, container);
      });
    });

    container.querySelectorAll('.delete-class-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const cls = Data.getClassById(btn.dataset.id);
        if (!cls) return;

        const students = Data.getStudentsByClass(cls.id);
        if (students.length > 0) {
          Components.showToast(`Cannot delete ${cls.name}: it currently contains ${students.length} active students. Please reassign or promote students first.`, 'warning', 4500);
          return;
        }

        Components.confirmDialog({
          title: `Delete Class: ${cls.name}`,
          message: `Are you sure you want to delete ${cls.name}? This will remove class configurations and curriculum associations.`,
          confirmText: 'Delete Class',
          isDestructive: true,
          onConfirm: () => {
            const res = Data.deleteClass(cls.id);
            if (res.success) {
              Components.showToast(`Class ${cls.name} deleted successfully.`, 'success');
              this.render(container);
            } else {
              Components.showToast(res.reason, 'error');
            }
          }
        });
      });
    });

    container.querySelectorAll('.view-class-students-btn').forEach(btn => {
      btn.addEventListener('click', () => this.viewClassRoster(btn.dataset.id));
    });

    container.querySelectorAll('.view-class-subjects-btn').forEach(btn => {
      btn.addEventListener('click', () => this.viewClassSubjects(btn.dataset.id));
    });
  },

  openClassModal(existing = null, parentContainer) {
    const isEdit = !!existing;
    const teachers = Data.getTeachers();

    const content = `
      <form id="class-form" class="space-y-4 text-xs">
        <div>
          <label class="block font-semibold text-slate-700 mb-1">Class Name <span class="text-rose-500">*</span></label>
          <input 
            type="text" 
            name="name" 
            required 
            placeholder="e.g. Grade 1 or Primary 1" 
            value="${isEdit ? existing.name : ''}"
            class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
          />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-semibold text-slate-700 mb-1">Section</label>
            <input 
              type="text" 
              name="section" 
              placeholder="e.g. A" 
              value="${isEdit ? existing.section : 'A'}"
              class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">Room / Location</label>
            <input 
              type="text" 
              name="room" 
              placeholder="e.g. Room 101" 
              value="${isEdit ? existing.room : ''}"
              class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
            />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-semibold text-slate-700 mb-1">Max Student Capacity <span class="text-rose-500">*</span></label>
            <input 
              type="number" 
              name="capacity" 
              min="5" 
              max="100" 
              required 
              value="${isEdit ? existing.capacity : '35'}"
              class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">Academic Year</label>
            <input 
              type="text" 
              name="academicYear" 
              value="${isEdit ? existing.academicYear : '2026-2027'}"
              class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label class="block font-semibold text-slate-700 mb-1">Assigned Homeroom Teacher</label>
          <select name="teacherId" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none">
            <option value="">-- No Teacher Assigned --</option>
            ${teachers.map(t => `
              <option value="${t.id}" ${isEdit && existing.teacherId === t.id ? 'selected' : ''}>
                ${t.fullName} (${t.email})
              </option>
            `).join('')}
          </select>
        </div>

        <div class="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <button type="button" id="modal-cancel-cls" class="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button type="submit" class="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors">
            ${isEdit ? 'Update Class' : 'Create Class'}
          </button>
        </div>
      </form>
    `;

    Components.openModal(content, isEdit ? `Edit Class: ${existing.name}` : 'Create New Class', { maxWidth: 'max-w-md' });

    document.getElementById('modal-cancel-cls').addEventListener('click', () => Components.closeModal());

    document.getElementById('class-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const payload = {
        name: formData.get('name'),
        section: formData.get('section'),
        room: formData.get('room'),
        capacity: formData.get('capacity'),
        academicYear: formData.get('academicYear'),
        teacherId: formData.get('teacherId')
      };

      if (isEdit) {
        Data.updateClass(existing.id, payload);
        Components.showToast(`Class ${payload.name} updated successfully.`, 'success');
      } else {
        Data.addClass(payload);
        Components.showToast(`Class ${payload.name} created successfully.`, 'success');
      }

      Components.closeModal();
      this.render(parentContainer);
    });
  },

  viewClassRoster(classId) {
    const cls = Data.getClassById(classId);
    if (!cls) return;
    const students = Data.getStudentsByClass(classId);

    const content = `
      <div class="space-y-4">
        <div class="flex items-center justify-between text-xs text-slate-500 pb-2 border-b border-slate-200">
          <span>Enrolled Students in <strong>${cls.name}</strong></span>
          <span class="font-semibold text-slate-800">${students.length} students</span>
        </div>
        <div class="max-h-80 overflow-y-auto custom-scrollbar border border-slate-200 rounded-lg">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 text-slate-700 border-b border-slate-200 font-medium">
              <tr>
                <th class="py-2.5 px-3">ID</th>
                <th class="py-2.5 px-3">Student Name</th>
                <th class="py-2.5 px-3">Gender</th>
                <th class="py-2.5 px-3">Parent Phone</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${students.length > 0 ? students.map(s => `
                <tr class="hover:bg-slate-50">
                  <td class="py-2 px-3 font-mono font-medium text-blue-600">${s.id}</td>
                  <td class="py-2 px-3 font-semibold text-slate-800">${s.fullName}</td>
                  <td class="py-2 px-3">${s.gender}</td>
                  <td class="py-2 px-3 font-mono text-slate-500">${s.parentPhone}</td>
                </tr>
              `).join('') : `
                <tr><td colspan="4" class="p-4 text-center text-slate-400">No students enrolled yet in this class.</td></tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;

    Components.openModal(content, `${cls.name} Student Roster`, { maxWidth: 'max-w-xl' });
  },

  viewClassSubjects(classId) {
    const cls = Data.getClassById(classId);
    if (!cls) return;
    const subjects = Data.getSubjectsByClass(classId);

    const content = `
      <div class="space-y-4">
        <div class="flex items-center justify-between text-xs text-slate-500 pb-2 border-b border-slate-200">
          <span>Curriculum Subjects for <strong>${cls.name}</strong></span>
          <span class="font-semibold text-slate-800">${subjects.length} subjects configured</span>
        </div>
        <div class="border border-slate-200 rounded-lg overflow-hidden">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 text-slate-700 border-b border-slate-200 font-medium">
              <tr>
                <th class="py-2.5 px-3">Subject Name</th>
                <th class="py-2.5 px-3">Code</th>
                <th class="py-2.5 px-3 text-right">Maximum Marks</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${subjects.length > 0 ? subjects.map(sub => `
                <tr>
                  <td class="py-2 px-3 font-medium text-slate-800">${sub.name}</td>
                  <td class="py-2 px-3 font-mono text-slate-500">${sub.code || '-'}</td>
                  <td class="py-2 px-3 text-right tabular-nums font-bold text-slate-700">${sub.maxMarks}</td>
                </tr>
              `).join('') : `
                <tr><td colspan="3" class="p-4 text-center text-slate-400">No subjects configured for this class yet.</td></tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;

    Components.openModal(content, `${cls.name} Curriculum Subjects`, { maxWidth: 'max-w-md' });
  }
};
