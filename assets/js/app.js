/**
 * AL-IMAAMA - Master Application Initialization
 * Coordinates storage seeding, router lifecycle, and DOM mount.
 */

import { Storage } from './storage.js';
import { Router } from './router.js';
import { Auth } from './auth.js';
import { Data } from './data.js';

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Initialize LocalStorage persistence and ensure default demo seed data exists
  Storage.init();

  // 2. If authenticated, refresh user profile and sync backend data
  if (Auth.isAuthenticated()) {
    try {
      await Auth.refreshCurrentUser();
      await Data.syncFromBackend();
    } catch (e) {
      console.warn('Initial session sync warning:', e);
    }
  }

  // 3. Initialize Single-Page Router
  Router.init();
});
