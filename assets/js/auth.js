/**
 * AL-IMAAMA - Authentication Module
 * Manages prototype session, demo login credentials, and password recovery.
 */

import { Storage } from './storage.js';
import { Data } from './data.js';

export const Auth = {
  getCurrentUser() {
    const session = Storage.get(Storage.KEYS.SESSION, null);
    if (!session) return null;

    // Attach enriched teacher details if user is a teacher
    if (session.role === 'TEACHER') {
      const teacher = Data.getTeacherByEmail(session.email) || (session.teacherId ? Data.getTeacherById(session.teacherId) : null);
      session.teacherDetails = teacher;
    }
    return session;
  },

  isAuthenticated() {
    return !!this.getCurrentUser();
  },

  login(email, password, rememberMe = false) {
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPass = (password || '').trim();

    if (!cleanEmail || !cleanPass) {
      return { success: false, error: 'Please enter both email and password.' };
    }

    const users = Data.getUsers();
    let user = users.find(u => u.email.toLowerCase() === cleanEmail);

    // Backward-compatible alias support for demo credentials
    if (!user) {
      if (cleanEmail === 'admin@alimaama.demo' || cleanEmail === 'admin@studently.demo') {
        user = users.find(u => u.role === 'ADMIN');
      } else if (cleanEmail === 'teacher@alimaama.demo' || cleanEmail === 'teacher@studently.demo') {
        user = users.find(u => u.role === 'TEACHER');
      }
    }

    if (!user) {
      return { success: false, error: 'No account found with this email address.' };
    }

    if (user.status === 'Deactivated') {
      return { success: false, error: 'This account has been deactivated. Contact the administrator.' };
    }

    if (user.password !== cleanPass) {
      return { success: false, error: 'Invalid password. Check credentials and try again.' };
    }

    // Login successful
    const sessionData = {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      teacherId: user.teacherId || '',
      loginAt: new Date().toISOString()
    };

    Storage.set(Storage.KEYS.SESSION, sessionData);

    if (rememberMe) {
      localStorage.setItem('alimaama_remembered_email', cleanEmail);
    } else {
      localStorage.removeItem('alimaama_remembered_email');
    }

    return { success: true, user: sessionData };
  },

  logout() {
    Storage.remove(Storage.KEYS.SESSION);
    return true;
  },

  getRememberedEmail() {
    return localStorage.getItem('alimaama_remembered_email') || localStorage.getItem('studently_remembered_email') || '';
  },

  // Prototype Forgot Password
  requestPasswordReset(email) {
    const cleanEmail = (email || '').trim().toLowerCase();
    const user = Data.getUserByEmail(cleanEmail);
    if (!user) {
      return { success: false, error: 'No account registered with that email address.' };
    }
    // Prototype demonstration token
    return {
      success: true,
      message: `A password reset link has been dispatched to ${cleanEmail}. In this prototype, you can proceed to Reset Password directly.`,
      email: cleanEmail
    };
  },

  resetPassword(email, newPassword) {
    const user = Data.getUserByEmail(email);
    if (!user) {
      return { success: false, error: 'Invalid email address.' };
    }
    if (!newPassword || newPassword.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters long.' };
    }
    const updated = Data.updateUser(user.id, { ...user, password: newPassword });
    return { success: !!updated };
  }
};
