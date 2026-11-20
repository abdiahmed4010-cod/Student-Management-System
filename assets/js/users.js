/**
 * AL-IMAAMA - User Management Module (ADMIN-ONLY)
 * Governs system user accounts, login credentials, RBAC assignment, and account activation.
 */

import { Data } from './data.js';
import { Auth } from './auth.js';
import { Permissions } from './permissions.js';
import { Components } from './components.js';

export const UsersView = {
  render(container) {
    const currentUser = Auth.getCurrentUser();
    if (!Permissions.isAdmin(currentUser)) {
      container.innerHTML = `
        <div class="p-8 max-w-lg mx-auto text-center space-y-3">
          <div class="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            ${Components.icon('alert-circle', 'w-6 h-6')}
          </div>
          <h2 class="text-base font-bold text-slate-900">Access Restricted</h2>
          <p class="text-xs text-slate-500">System user administration is restricted to administrators.</p>
        </div>
      `;
      return;
    }

    const users = Data.getUsers();
    const teachers = Data.getTeachers();

    container.innerHTML = `
      <div class="space-y-6">
        <!-- Module Header -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold tracking-tight text-slate-900">System User & Credential Administration</h1>
            <p class="text-sm text-slate-500 mt-1">Manage system accounts, access levels, authentication statuses, and security credentials.</p>
          </div>
          <button id="add-user-btn" class="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors self-start sm:self-auto">
            ${Components.icon('plus', 'w-4 h-4')} Create User Account
          </button>
        </div>

        <!-- Users Table -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div class="overflow-x-auto custom-scrollbar">
            <table class="w-full text-left text-xs text-slate-600">
              <thead class="bg-slate-50/80 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th class="py-3.5 px-4">User ID</th>
                  <th class="py-3.5 px-4">Account Name</th>
                  <th class="py-3.5 px-4">Email Address</th>
                  <th class="py-3.5 px-4">Role</th>
                  <th class="py-3.5 px-4">Account Status</th>
                  <th class="py-3.5 px-4">Created Date</th>
                  <th class="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${users.map(u => {
                  const isCurrent = currentUser && currentUser.id === u.id;
                  const teacher = u.teacherId ? teachers.find(t => t.id === u.teacherId) : null;

                  return `
                    <tr class="hover:bg-slate-50/80 transition-colors">
                      <td class="py-3 px-4 font-mono font-medium text-blue-600">${u.id}</td>
                      <td class="py-3 px-4 font-semibold text-slate-900">
                        ${u.fullName} ${isCurrent ? '<span class="ml-1 text-[10px] text-blue-600 font-medium">(You)</span>' : ''}
                        ${teacher ? `<span class="block text-[11px] text-slate-400 font-normal">Linked: ${teacher.fullName}</span>` : ''}
                      </td>
                      <td class="py-3 px-4 font-mono text-slate-600">${u.email}</td>
                      <td class="py-3 px-4">
                        <span class="inline-block px-2.5 py-0.5 rounded text-[11px] font-semibold ${
                          u.role === 'ADMIN' ? 'bg-blue-50 text-blue-800 border border-blue-200' : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }">
                          ${u.role}
                        </span>
                      </td>
                      <td class="py-3 px-4">
                        <span class="inline-block px-2 py-0.5 rounded text-[11px] font-medium ${
                          u.status === 'Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }">
                          ${u.status}
                        </span>
                      </td>
                      <td class="py-3 px-4 tabular-nums text-slate-400">${u.createdAt || '2025-08-01'}</td>
                      <td class="py-3 px-4 text-right whitespace-nowrap">
                        <div class="inline-flex items-center gap-1">
                          <button class="edit-user-btn p-1.5 text-slate-400 hover:text-amber-600 hover:bg-slate-50 rounded-md" data-id="${u.id}" title="Edit User">
                            ${Components.icon('edit', 'w-4 h-4')}
                          </button>
                          <button class="reset-pass-btn p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-50 rounded-md" data-id="${u.id}" title="Reset Password">
                            ${Components.icon('lock', 'w-4 h-4')}
                          </button>
                          ${!isCurrent ? `
                            <button class="toggle-status-btn p-1.5 ${u.status === 'Active' ? 'text-slate-400 hover:text-rose-600' : 'text-slate-400 hover:text-emerald-600'} hover:bg-slate-50 rounded-md" data-id="${u.id}" title="${u.status === 'Active' ? 'Deactivate' : 'Activate'}">
                              ${Components.icon('shield-check', 'w-4 h-4')}
                            </button>
                          ` : ''}
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
          <div class="px-4 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
            <span>Authentication accounts provide login access. Distinct from teacher profiles.</span>
            <span>Total Users: <strong>${users.length}</strong></span>
          </div>
        </div>
      </div>
    `;

    this.bindEvents(container);
  },

  bindEvents(container) {
    const addBtn = container.querySelector('#add-user-btn');
    if (addBtn) addBtn.addEventListener('click', () => this.openUserModal(null, container));

    container.querySelectorAll('.edit-user-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const users = Data.getUsers();
        const user = users.find(u => u.id === btn.dataset.id);
        if (user) this.openUserModal(user, container);
      });
    });

    container.querySelectorAll('.reset-pass-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const users = Data.getUsers();
        const user = users.find(u => u.id === btn.dataset.id);
        if (!user) return;

        Components.confirmDialog({
          title: `Reset Password for ${user.fullName}`,
          message: `Are you sure you want to reset the password for <strong>${user.email}</strong>? The demo password will be reset to: <code class="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-blue-700">DemoPass123!</code>`,
          confirmText: 'Reset Password',
          onConfirm: () => {
            Data.resetUserPassword(user.id, 'DemoPass123!');
            Components.showToast(`Password for ${user.email} reset to: DemoPass123!`, 'success', 5000);
            this.render(container);
          }
        });
      });
    });

    container.querySelectorAll('.toggle-status-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const users = Data.getUsers();
        const user = users.find(u => u.id === btn.dataset.id);
        if (!user) return;

        const nextStatus = user.status === 'Active' ? 'Deactivated' : 'Active';
        Data.updateUser(user.id, { ...user, status: nextStatus });
        Components.showToast(`User ${user.fullName} is now ${nextStatus}.`, 'info');
        this.render(container);
      });
    });
  },

  openUserModal(existing = null, parentContainer) {
    const isEdit = !!existing;
    const teachers = Data.getTeachers();

    const content = `
      <form id="user-form" class="space-y-4 text-xs">
        <div>
          <label class="block font-semibold text-slate-700 mb-1">Full Name <span class="text-rose-500">*</span></label>
          <input 
            type="text" 
            name="fullName" 
            required 
            placeholder="e.g. Marian Hassan" 
            value="${isEdit ? existing.fullName : ''}"
            class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
          />
        </div>

        <div>
          <label class="block font-semibold text-slate-700 mb-1">Email Address (Login ID) <span class="text-rose-500">*</span></label>
          <input 
            type="email" 
            name="email" 
            required 
            placeholder="e.g. staff@alimaama.demo" 
            value="${isEdit ? existing.email : ''}"
            class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none font-mono"
          />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-semibold text-slate-700 mb-1">System Role <span class="text-rose-500">*</span></label>
            <select name="role" id="user-role-select" required class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-semibold">
              <option value="ADMIN" ${isEdit && existing.role === 'ADMIN' ? 'selected' : ''}>ADMIN (Full Access)</option>
              <option value="TEACHER" ${isEdit && existing.role === 'TEACHER' ? 'selected' : ''}>TEACHER (Pedagogical Only)</option>
            </select>
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">Account Status</label>
            <select name="status" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-medium">
              <option value="Active" ${!isEdit || existing.status === 'Active' ? 'selected' : ''}>Active</option>
              <option value="Deactivated" ${isEdit && existing.status === 'Deactivated' ? 'selected' : ''}>Deactivated</option>
            </select>
          </div>
        </div>

        <div id="linked-teacher-group" class="${isEdit && existing.role === 'TEACHER' ? '' : 'hidden'}">
          <label class="block font-semibold text-slate-700 mb-1">Link to Teacher Profile</label>
          <select name="teacherId" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-medium">
            <option value="">-- No Linked Teacher Record --</option>
            ${teachers.map(t => `
              <option value="${t.id}" ${isEdit && existing.teacherId === t.id ? 'selected' : ''}>
                ${t.fullName} (${t.phone})
              </option>
            `).join('')}
          </select>
        </div>

        ${!isEdit ? `
          <div>
            <label class="block font-semibold text-slate-700 mb-1">Initial Password <span class="text-rose-500">*</span></label>
            <input 
              type="text" 
              name="password" 
              required 
              value="Demo123!" 
              class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-mono text-blue-700 font-semibold"
            />
          </div>
        ` : ''}

        <div class="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <button type="button" id="modal-cancel-usr" class="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button type="submit" class="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors">
            ${isEdit ? 'Update Account' : 'Create User'}
          </button>
        </div>
      </form>
    `;

    Components.openModal(content, isEdit ? `Edit User: ${existing.fullName}` : 'Create New User Account', { maxWidth: 'max-w-md' });

    document.getElementById('modal-cancel-usr').addEventListener('click', () => Components.closeModal());

    const roleSelect = document.getElementById('user-role-select');
    const teacherGroup = document.getElementById('linked-teacher-group');
    if (roleSelect && teacherGroup) {
      roleSelect.addEventListener('change', (e) => {
        if (e.target.value === 'TEACHER') {
          teacherGroup.classList.remove('hidden');
        } else {
          teacherGroup.classList.add('hidden');
        }
      });
    }

    document.getElementById('user-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const payload = {
        fullName: formData.get('fullName'),
        email: formData.get('email'),
        role: formData.get('role'),
        status: formData.get('status'),
        teacherId: formData.get('teacherId')
      };
      if (!isEdit) {
        payload.password = formData.get('password');
      }

      if (isEdit) {
        Data.updateUser(existing.id, payload);
        Components.showToast(`User account ${payload.email} updated.`, 'success');
      } else {
        const res = Data.addUser(payload);
        if (!res.success) {
          Components.showToast(res.reason, 'error');
          return;
        }
        Components.showToast(`User account ${payload.email} created successfully.`, 'success');
      }

      Components.closeModal();
      this.render(parentContainer);
    });
  }
};
