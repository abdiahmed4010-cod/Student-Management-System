/**
 * AL-IMAAMA - Subject Management Module
 * Enables Admin to configure class curriculum, maximum marks, and subject codes.
 */

import { Data } from './data.js';
import { Components } from './components.js';

let activeClassFilter = '';

export const SubjectsView = {
  render(container) {
    const classes = Data.getClasses();
    const allSubjects = Data.getSubjects();

    if (!activeClassFilter && classes.length > 0) {
      activeClassFilter = classes[0].id;
    }

    const displayedSubjects = activeClassFilter 
      ? allSubjects.filter(s => s.classId === activeClassFilter)
      : allSubjects;

    const currentClass = classes.find(c => c.id === activeClassFilter);

    container.innerHTML = `
      <div class="space-y-6">
        <!-- Module Header -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold tracking-tight text-slate-900">Curriculum & Subject Setup</h1>
            <p class="text-sm text-slate-500 mt-1">Configure subjects, syllabus codes, and maximum examination marks per class.</p>
          </div>
          <button id="add-subject-btn" class="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors self-start sm:self-auto">
            ${Components.icon('plus', 'w-4 h-4')} Create Subject
          </button>
        </div>

        <!-- Class Filter Selector -->
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <div class="flex items-center gap-3 w-full sm:w-auto">
            <label class="text-xs font-semibold text-slate-700 whitespace-nowrap">Filter by Class:</label>
            <select id="subject-class-select" class="py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-medium text-slate-800">
              <option value="">All Classes (${allSubjects.length} subjects)</option>
              ${classes.map(c => `
                <option value="${c.id}" ${activeClassFilter === c.id ? 'selected' : ''}>
                  ${c.name} (${allSubjects.filter(s => s.classId === c.id).length} subjects)
                </option>
              `).join('')}
            </select>
          </div>

          <div class="text-xs text-slate-500">
            Selected Class: <strong class="text-slate-800">${currentClass ? currentClass.name : 'All Classes'}</strong>
          </div>
        </div>

        <!-- Subjects Table -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div class="overflow-x-auto custom-scrollbar">
            <table class="w-full text-left text-xs text-slate-600">
              <thead class="bg-slate-50/80 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th class="py-3.5 px-4">Subject Name</th>
                  <th class="py-3.5 px-4">Optional Code</th>
                  <th class="py-3.5 px-4">Assigned Class</th>
                  <th class="py-3.5 px-4 text-right">Max Examination Marks</th>
                  <th class="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${displayedSubjects.length > 0 ? displayedSubjects.map(sub => {
                  const cls = classes.find(c => c.id === sub.classId);
                  return `
                    <tr class="hover:bg-slate-50/80 transition-colors">
                      <td class="py-3 px-4 font-semibold text-slate-900">${sub.name}</td>
                      <td class="py-3 px-4 font-mono text-slate-500">${sub.code || '—'}</td>
                      <td class="py-3 px-4">
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-800">
                          ${cls ? cls.name : 'Unknown Class'}
                        </span>
                      </td>
                      <td class="py-3 px-4 text-right tabular-nums font-bold text-slate-800">${sub.maxMarks} pts</td>
                      <td class="py-3 px-4 text-right whitespace-nowrap">
                        <div class="inline-flex items-center gap-1">
                          <button class="edit-subject-btn p-1.5 text-slate-400 hover:text-amber-600 hover:bg-slate-50 rounded-md" data-id="${sub.id}" title="Edit Subject">
                            ${Components.icon('edit', 'w-4 h-4')}
                          </button>
                          <button class="delete-subject-btn p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-50 rounded-md" data-id="${sub.id}" title="Delete Subject">
                            ${Components.icon('trash-2', 'w-4 h-4')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('') : `
                  <tr>
                    <td colspan="5" class="p-8">
                      ${Components.emptyState(
                        'No subjects configured',
                        'There are no curriculum subjects assigned to the selected class yet.',
                        `<button id="empty-add-subject-btn" class="px-3.5 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">Add First Subject</button>`
                      )}
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
          <div class="px-4 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500">
            <span>Configured subjects automatically populate the Marks Entry spreadsheet columns.</span>
          </div>
        </div>
      </div>
    `;

    this.bindEvents(container);
  },

  bindEvents(container) {
    const classSelect = container.querySelector('#subject-class-select');
    if (classSelect) {
      classSelect.addEventListener('change', (e) => {
        activeClassFilter = e.target.value;
        this.render(container);
      });
    }

    const addBtn = container.querySelector('#add-subject-btn');
    if (addBtn) addBtn.addEventListener('click', () => this.openSubjectModal(null, container));

    const emptyAddBtn = container.querySelector('#empty-add-subject-btn');
    if (emptyAddBtn) emptyAddBtn.addEventListener('click', () => this.openSubjectModal(null, container));

    container.querySelectorAll('.edit-subject-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const subjects = Data.getSubjects();
        const sub = subjects.find(s => s.id === btn.dataset.id);
        if (sub) this.openSubjectModal(sub, container);
      });
    });

    container.querySelectorAll('.delete-subject-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const subjects = Data.getSubjects();
        const sub = subjects.find(s => s.id === btn.dataset.id);
        if (!sub) return;

        Components.confirmDialog({
          title: `Delete Subject: ${sub.name}`,
          message: `Are you sure you want to remove <strong>${sub.name}</strong>? This subject column will no longer appear in future exam spreadsheets for this class.`,
          confirmText: 'Delete Subject',
          isDestructive: true,
          onConfirm: async () => {
            try {
              const res = await Data.deleteSubject(sub.id);
              if (res && res.success === false) {
                Components.showToast(res.reason || 'Cannot delete subject because marks exist.', 'warning', 4500);
              } else {
                Components.showToast(
                  res.refreshWarning
                    ? `Subject ${sub.name} was deleted, but the list could not be refreshed. Reload the page to retry.`
                    : `Subject ${sub.name} deleted successfully.`,
                  res.refreshWarning ? 'warning' : 'success',
                  5000
                );
                this.render(container);
              }
            } catch (error) {
              Components.showToast(`Could not delete subject: ${error.message || 'The backend rejected the request.'}`, 'error', 6000);
            }
          }
        });
      });
    });
  },

  openSubjectModal(existing = null, parentContainer) {
    const isEdit = !!existing;
    const classes = Data.getClasses();
    if (!classes.length) {
      Components.showToast('No classes are available. Create a class before adding a subject.', 'error', 5000);
      return;
    }

    const content = `
      <form id="subject-form" class="space-y-4 text-xs">
        <div>
          <label class="block font-semibold text-slate-700 mb-1">Subject Name <span class="text-rose-500">*</span></label>
          <input 
            type="text" 
            name="name" 
            required 
            placeholder="e.g. Mathematics, English Language, Physics" 
            value="${isEdit ? existing.name : ''}"
            class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
          />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-semibold text-slate-700 mb-1">Optional Subject Code</label>
            <input 
              type="text" 
              name="code" 
              placeholder="e.g. MATH101" 
              value="${isEdit ? existing.code : ''}"
              class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none font-mono"
            />
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">Maximum Marks <span class="text-rose-500">*</span></label>
            <input 
              type="number" 
              name="maxMarks" 
              min="10" 
              max="200" 
              required 
              value="${isEdit ? existing.maxMarks : '100'}"
              class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none tabular-nums"
            />
          </div>
        </div>

        <div>
          <label class="block font-semibold text-slate-700 mb-1">Assign to Class <span class="text-rose-500">*</span></label>
          <select name="classId" required class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none">
            ${classes.map(c => `
              <option value="${c.id}" ${(isEdit && existing.classId === c.id) || (!isEdit && activeClassFilter === c.id) ? 'selected' : ''}>
                ${c.name} (${c.academicYear})
              </option>
            `).join('')}
          </select>
        </div>

        <div class="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <button type="button" id="modal-cancel-sub" class="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button type="submit" class="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors">
            ${isEdit ? 'Update Subject' : 'Save Subject'}
          </button>
        </div>
      </form>
    `;

    Components.openModal(content, isEdit ? `Edit Subject: ${existing.name}` : 'Create New Subject', { maxWidth: 'max-w-md' });

    document.getElementById('modal-cancel-sub').addEventListener('click', () => Components.closeModal());

    document.getElementById('subject-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const submitButton = form.querySelector('button[type="submit"]');
      const originalButtonText = submitButton ? submitButton.innerHTML : '';
      const formData = new FormData(form);
      const payload = {
        name: formData.get('name'),
        code: formData.get('code'),
        maxMarks: formData.get('maxMarks'),
        classId: formData.get('classId')
      };

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = isEdit ? 'Saving…' : 'Registering…';
      }
      try {
        const saved = isEdit
          ? await Data.updateSubject(existing.id, payload)
          : await Data.addSubject(payload);
        const action = isEdit ? 'updated' : 'created';
        Components.showToast(
          saved.refreshWarning
            ? `Subject ${payload.name} was ${action}, but the list could not be refreshed. Reload the page to retry.`
            : `Subject ${payload.name} ${action}.`,
          saved.refreshWarning ? 'warning' : 'success',
          5000
        );

        Components.closeModal();
        this.render(parentContainer);
      } catch (error) {
        Components.showToast(`Could not save subject: ${error.message || 'The backend rejected the request.'}`, 'error', 6000);
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.innerHTML = originalButtonText;
        }
      }
    });
  }
};
