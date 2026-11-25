/**
 * AL-IMAAMA - Role & Permission Engine
 * Strictly enforces ADMIN and TEACHER roles plus granular per-user module permissions.
 */

import { Storage } from './storage.js';

export const ROLES = {
  ADMIN: 'ADMIN',
  TEACHER: 'TEACHER'
};

export const PERMISSION_MODULES = [
  { id: 'students', label: 'Student Management', labelKey: 'permissions.modStudents' },
  { id: 'attendance', label: 'Attendance', labelKey: 'permissions.modAttendance' },
  { id: 'examinations', label: 'Examinations', labelKey: 'permissions.modExaminations' },
  { id: 'reports', label: 'Reports', labelKey: 'permissions.modReports' },
  { id: 'payments', label: 'Fees & Payments', labelKey: 'permissions.modPayments' }
];

export const PERMISSION_ACTIONS = [
  { id: 'view', label: 'View', labelKey: 'permissions.actView' },
  { id: 'add', label: 'Add', labelKey: 'permissions.actAdd' },
  { id: 'edit', label: 'Edit', labelKey: 'permissions.actEdit' },
  { id: 'delete', label: 'Delete', labelKey: 'permissions.actDelete' },
  { id: 'import', label: 'Import', labelKey: 'permissions.actImport' },
  { id: 'print', label: 'Print', labelKey: 'permissions.actPrint' },
  { id: 'export', label: 'Export', labelKey: 'permissions.actExport' }
];

export const Permissions = {
  isAdmin(user) {
    return !!(user && user.role === ROLES.ADMIN);
  },

  isTeacher(user) {
    return !!(user && user.role === ROLES.TEACHER);
  },

  getDefaultPermissions(role) {
    if (role === ROLES.ADMIN) {
      return {
        students: { view: true, add: true, edit: true, delete: true, import: true, print: true, export: true },
        attendance: { view: true, add: true, edit: true, delete: true, import: false, print: true, export: true },
        examinations: { view: true, add: true, edit: true, delete: true, import: false, print: true, export: true },
        reports: { view: true, add: false, edit: false, delete: false, import: false, print: true, export: true },
        payments: { view: true, add: true, edit: true, delete: true, import: false, print: true, export: true }
      };
    }

    // Teacher fundamental role defaults (no financial access, no student CRUD/import)
    return {
      students: { view: true, add: false, edit: false, delete: false, import: false, print: true, export: false },
      attendance: { view: true, add: true, edit: true, delete: false, import: false, print: true, export: false },
      examinations: { view: true, add: true, edit: true, delete: false, import: false, print: true, export: false },
      reports: { view: true, add: false, edit: false, delete: false, import: false, print: true, export: true },
      payments: { view: false, add: false, edit: false, delete: false, import: false, print: false, export: false }
    };
  },

  _resolveLatestUser(user) {
    if (!user) return null;
    const users = Storage.get(Storage.KEYS.USERS, []);
    const fresh = users.find(u => u.id === user.id || (user.email && u.email.toLowerCase() === user.email.toLowerCase()));
    if (!fresh) return user;
    return { ...user, ...fresh, teacherDetails: user.teacherDetails };
  },

  getUserPermissions(user) {
    if (!user) return this.getDefaultPermissions(ROLES.TEACHER);
    const resolved = this._resolveLatestUser(user);
    const defaults = this.getDefaultPermissions(resolved.role);
    const custom = resolved.permissions || {};
    const merged = {};

    PERMISSION_MODULES.forEach(mod => {
      merged[mod.id] = {
        ...defaults[mod.id],
        ...(custom[mod.id] || {})
      };
    });

    // Enforce Teacher role safety ceiling: Teachers NEVER gain financial or admin-only capabilities
    if (resolved.role === ROLES.TEACHER) {
      merged.payments = { view: false, add: false, edit: false, delete: false, import: false, print: false, export: false };
      merged.students.add = false;
      merged.students.edit = false;
      merged.students.delete = false;
      merged.students.import = false;
      merged.attendance.delete = false;
      merged.examinations.delete = false;
    }

    // Primary Super Admin safeguard
    if ((resolved.id === 'usr-1' || resolved.is_superuser) && resolved.role === ROLES.ADMIN) {
      return this.getDefaultPermissions(ROLES.ADMIN);
    }

    return merged;
  },

  hasPermission(user, module, action = 'view') {
    if (!user) return false;
    const resolved = this._resolveLatestUser(user);
    if ((resolved.id === 'usr-1' || resolved.is_superuser) && resolved.role === ROLES.ADMIN) return true;

    const perms = this.getUserPermissions(resolved);
    if (!perms[module]) return false;
    return !!perms[module][action];
  },

  summarizeUserPermissions(user) {
    const perms = this.getUserPermissions(user);
    const summary = [];
    PERMISSION_MODULES.forEach(mod => {
      const modPerms = perms[mod.id] || {};
      const activeActions = Object.keys(modPerms).filter(k => modPerms[k]);
      if (activeActions.length > 0) {
        summary.push(`${mod.label.split(' ')[0]} (${activeActions.length})`);
      }
    });
    return summary.length > 0 ? summary.join(', ') : 'Restricted';
  },

  canAccessFinances(user) {
    return this.isAdmin(user) && this.hasPermission(user, 'payments', 'view');
  },

  canAccessPromotion(user) {
    return this.isAdmin(user);
  },

  canAccessCertificates(user) {
    return this.isAdmin(user);
  },

  canManageUsers(user) {
    return this.isAdmin(user);
  },

  canManageClasses(user) {
    return this.isAdmin(user);
  },

  canManageSubjects(user) {
    return this.isAdmin(user);
  },

  canManageTeachers(user) {
    return this.isAdmin(user);
  },

  canMarkExcusedAttendance(user) {
    return this.isAdmin(user) && this.hasPermission(user, 'attendance', 'edit');
  },

  canAccessReport(user, reportCategory) {
    if (!this.hasPermission(user, 'reports', 'view')) return false;
    const validCategories = ['students', 'attendance', 'examinations', 'results', 'promotion', 'payments', 'income-expenses'];
    if (!validCategories.includes(reportCategory)) return false;
    if (this.isAdmin(user)) {
      if ((reportCategory === 'payments' || reportCategory === 'income-expenses') && !this.hasPermission(user, 'payments', 'view')) {
        return false;
      }
      return true;
    }
    // Teachers may only access permitted academic reports (never financial or promotion)
    const allowedForTeacher = ['students', 'attendance', 'examinations', 'results'];
    return allowedForTeacher.includes(reportCategory);
  },

  canAccessSubReport(user, reportCategory, subReport) {
    if (!this.canAccessReport(user, reportCategory)) return false;
    if (this.isAdmin(user)) return true;

    // Admin-only sub-reports according to BUSINESS_RULES_SPECIFICATION Section 10
    if (reportCategory === 'students' && subReport === 'all') return false;
    if (reportCategory === 'results' && subReport === 'class-ranking') return false;

    return true;
  },

  _resolveTeacherDetails(user) {
    if (!user || !this.isTeacher(user)) return null;
    const teachers = Storage.get(Storage.KEYS.TEACHERS, []);
    const matched = teachers.find(
      t =>
        (user.teacherId && t.id === user.teacherId) ||
        (user.email && t.email && t.email.toLowerCase() === user.email.toLowerCase())
    );
    return matched || user.teacherDetails || null;
  },

  getTeacherAssignedClassIds(user) {
    if (!user) return [];
    if (this.isAdmin(user)) return null; // null indicates unrestricted (Admin)
    const teacher = this._resolveTeacherDetails(user);
    return teacher && Array.isArray(teacher.assignedClassIds) ? [...teacher.assignedClassIds] : [];
  },

  getTeacherAssignedSubjectIds(user) {
    if (!user) return [];
    if (this.isAdmin(user)) return null; // null indicates unrestricted (Admin)
    const teacher = this._resolveTeacherDetails(user);
    return teacher && Array.isArray(teacher.assignedSubjectIds) ? [...teacher.assignedSubjectIds] : [];
  },

  canAccessClassMarks(user, classId) {
    if (!user || !classId) return false;
    if (this.isAdmin(user)) {
      return this.hasPermission(user, 'examinations', 'view') || this.hasPermission(user, 'examinations', 'edit');
    }
    if (!this.isTeacher(user) || !this.hasPermission(user, 'examinations', 'view')) {
      return false;
    }
    const assignedClassIds = this.getTeacherAssignedClassIds(user);
    if (!assignedClassIds.includes(classId)) return false;

    const assignedSubjectIds = this.getTeacherAssignedSubjectIds(user);
    const subjects = Storage.get(Storage.KEYS.SUBJECTS, []);
    return subjects.some(s => s.classId === classId && assignedSubjectIds.includes(s.id));
  },

  canAccessSubjectMarks(user, classId, subjectId) {
    if (!user || !classId || !subjectId) return false;
    if (this.isAdmin(user)) {
      return this.hasPermission(user, 'examinations', 'view') || this.hasPermission(user, 'examinations', 'edit');
    }
    if (!this.isTeacher(user) || !this.hasPermission(user, 'examinations', 'view')) {
      return false;
    }
    const assignedClassIds = this.getTeacherAssignedClassIds(user);
    const assignedSubjectIds = this.getTeacherAssignedSubjectIds(user);
    if (!assignedClassIds.includes(classId) || !assignedSubjectIds.includes(subjectId)) {
      return false;
    }
    const subjects = Storage.get(Storage.KEYS.SUBJECTS, []);
    return subjects.some(s => s.id === subjectId && s.classId === classId);
  },

  canEditSubjectMarks(user, classId, subjectId) {
    if (!user || !classId || !subjectId) return false;
    const canWrite = this.hasPermission(user, 'examinations', 'add') || this.hasPermission(user, 'examinations', 'edit');
    if (!canWrite) return false;
    if (this.isAdmin(user)) return true;
    return this.canAccessSubjectMarks(user, classId, subjectId);
  },

  canEditClassMarks(user, classId) {
    if (this.isAdmin(user)) return this.hasPermission(user, 'examinations', 'edit') || this.hasPermission(user, 'examinations', 'add');
    if (this.isTeacher(user)) {
      return (this.hasPermission(user, 'examinations', 'edit') || this.hasPermission(user, 'examinations', 'add')) &&
        this.canAccessClassMarks(user, classId);
    }
    return false;
  },

  // Returns permitted sidebar navigation links
  getNavItems(user) {
    if (!user) return [];

    if (this.isTeacher(user)) {
      const items = [
        { id: 'dashboard', label: 'My Classes', labelKey: 'nav.myClasses', icon: 'school' }
      ];
      if (this.hasPermission(user, 'attendance', 'view')) {
        items.push({ id: 'attendance', label: 'Take Attendance', labelKey: 'nav.takeAttendance', icon: 'clipboard-check' });
      }
      if (this.hasPermission(user, 'examinations', 'view')) {
        items.push({ id: 'examinations', label: 'Enter Marks', labelKey: 'nav.enterMarks', icon: 'file-spreadsheet' });
      }
      if (this.hasPermission(user, 'attendance', 'view')) {
        items.push({ id: 'attendance-history', label: 'Attendance History', labelKey: 'nav.attendanceHistory', icon: 'calendar' });
      }
      if (this.hasPermission(user, 'examinations', 'view')) {
        items.push({ id: 'marks-history', label: 'Marks History', labelKey: 'nav.marksHistory', icon: 'award' });
      }
      if (this.hasPermission(user, 'reports', 'view')) {
        items.push({ id: 'reports', label: 'Reports', labelKey: 'nav.reports', icon: 'bar-chart-3' });
      }
      return items;
    }

    // Admin navigation (strictly respects granular view permissions)
    const adminItems = [
      { id: 'dashboard', label: 'Dashboard', labelKey: 'nav.dashboard', icon: 'layout-dashboard' }
    ];
    if (this.hasPermission(user, 'students', 'view')) {
      adminItems.push({ id: 'students', label: 'Students', labelKey: 'nav.students', icon: 'graduation-cap' });
    }
    adminItems.push(
      { id: 'classes', label: 'Classes', labelKey: 'nav.classes', icon: 'school' },
      { id: 'subjects', label: 'Subjects', labelKey: 'nav.subjects', icon: 'book-open' },
      { id: 'teachers', label: 'Teachers', labelKey: 'nav.teachers', icon: 'users' }
    );
    if (this.hasPermission(user, 'attendance', 'view')) {
      adminItems.push({ id: 'attendance', label: 'Attendance', labelKey: 'nav.attendance', icon: 'clipboard-check' });
    }
    if (this.hasPermission(user, 'examinations', 'view')) {
      adminItems.push({ id: 'examinations', label: 'Examinations', labelKey: 'nav.examinations', icon: 'file-spreadsheet' });
      adminItems.push({ id: 'results', label: 'Results & Ranking', labelKey: 'nav.results', icon: 'award' });
    }
    adminItems.push({ id: 'promotion', label: 'Promotion', labelKey: 'nav.promotion', icon: 'trending-up' });
    if (this.hasPermission(user, 'payments', 'view')) {
      adminItems.push({ id: 'payments', label: 'Fees & Payments', labelKey: 'nav.payments', icon: 'wallet' });
    }
    if (this.hasPermission(user, 'reports', 'view')) {
      adminItems.push({ id: 'reports', label: 'Reports', labelKey: 'nav.reports', icon: 'bar-chart-3' });
    }
    adminItems.push(
      { id: 'certificates', label: 'Certificates & Transcripts', labelKey: 'nav.certificates', icon: 'scroll-text' },
      { id: 'users', label: 'User Management', labelKey: 'nav.users', icon: 'shield-check' },
      { id: 'settings', label: 'Settings', labelKey: 'nav.settings', icon: 'settings' }
    );
    return adminItems;
  }
};
