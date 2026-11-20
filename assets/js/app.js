/**
 * AL-IMAAMA - Master Application Initialization
 * Coordinates storage seeding, router lifecycle, and DOM mount.
 */

import { Storage } from './storage.js';
import { Router } from './router.js';

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize LocalStorage persistence and ensure default demo seed data exists
  Storage.init();

  // 2. Initialize Single-Page Router
  Router.init();
});
