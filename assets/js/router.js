/**
 * AL-IMAAMA - Single-Page Application Router
 * Governs hash routing, authentication guards, breadcrumbs, multi-language switching, and dynamic view mounting.
 */

import { Auth } from './auth.js';
import { Data } from './data.js';
import { Storage } from './storage.js';
import { Permissions } from './permissions.js';
import { Components } from './components.js';
import { I18n } from './i18n.js';

// Module view imports
import { DashboardView } from './dashboard.js';
import { StudentsView } from './students.js';
import { ClassesView } from './classes.js';
import { SubjectsView } from './subjects.js';
import { TeachersView } from './teachers.js';
import { AttendanceView } from './attendance.js';
import { ExaminationsView } from './examinations.js';
import { ResultsView } from './results.js';
import { PromotionView } from './promotion.js';
import { PaymentsView } from './payments.js';
import { ReportsView } from './reports.js';
import { CertificatesView } from './certificates.js';
import { UsersView } from './users.js';
import { SettingsView } from './settings.js';
import { AttendanceHistoryView } from './attendance-history.js';
import { MarksHistoryView } from './marks-history.js';

const ROUTE_CONFIG = {
  'dashboard': { view: DashboardView, labelKey: 'nav.dashboard', adminOnly: false },
  'students': { view: StudentsView, labelKey: 'nav.students', adminOnly: false, permModule: 'students' },
  'classes': { view: ClassesView, labelKey: 'nav.classes', adminOnly: true },
  'subjects': { view: SubjectsView, labelKey: 'nav.subjects', adminOnly: true },
  'teachers': { view: TeachersView, labelKey: 'nav.teachers', adminOnly: true },
  'attendance': { view: AttendanceView, labelKey: 'nav.attendance', adminOnly: false, permModule: 'attendance' },
  'examinations': { view: ExaminationsView, labelKey: 'nav.examinations', adminOnly: false, permModule: 'examinations' },
  'results': { view: ResultsView, labelKey: 'nav.results', adminOnly: true, permModule: 'examinations' },
  'promotion': { view: PromotionView, labelKey: 'nav.promotion', adminOnly: true },
  'payments': { view: PaymentsView, labelKey: 'nav.payments', adminOnly: true, permModule: 'payments' },
  'reports': { view: ReportsView, labelKey: 'nav.reports', adminOnly: false, permModule: 'reports' },
  'certificates': { view: CertificatesView, labelKey: 'nav.certificates', adminOnly: true },
  'users': { view: UsersView, labelKey: 'nav.users', adminOnly: true },
  'settings': { view: SettingsView, labelKey: 'nav.settings', adminOnly: true },
  'attendance-history': { view: AttendanceHistoryView, labelKey: 'nav.attendanceHistory', adminOnly: false, permModule: 'attendance' },
  'marks-history': { view: MarksHistoryView, labelKey: 'nav.marksHistory', adminOnly: false, permModule: 'examinations' }
};

export const Router = {
  currentRoute: '',

  init() {
    window.addEventListener('hashchange', () => this.handleRoute());

    // Listen to language changes and re-render current view & shell seamlessly
    I18n.onLanguageChange(() => {
      const shell = document.getElementById('app-shell-container');
      if (shell) {
        shell.remove(); // Force shell re-render with new translated labels and RTL layout
      }
      this.handleRoute();
    });

    this.handleRoute();
  },

  navigate(route) {
    window.location.hash = `#${route}`;
  },

  handleRoute() {
    const rawHash = window.location.hash.replace(/^#/, '').trim();
    const [routePart, queryString = ''] = rawHash.split('?');
    let hash = routePart;
    if (!hash) hash = Auth.isAuthenticated() ? 'dashboard' : 'login';

    // Handle authentication screens
    if (hash === 'login' || hash === 'forgot-password' || hash === 'reset-password') {
      this.renderAuthScreen(hash);
      return;
    }

    // Guard: Require login for all other screens
    if (!Auth.isAuthenticated()) {
      this.navigate('login');
      return;
    }

    const user = Auth.getCurrentUser();
    const config = ROUTE_CONFIG[hash];

    // Check if route exists
    if (!config) {
      this.navigate('dashboard');
      return;
    }

    // Role Guard: Prevent Teacher from accessing Admin-only routes
    if (config.adminOnly && !Permissions.isAdmin(user)) {
      Components.showToast('Access restricted: Only administrators can access that module.', 'warning', 3500);
      this.navigate('dashboard');
      return;
    }

    // Granular Permission Guard
    if (config.permModule && !Permissions.hasPermission(user, config.permModule, 'view')) {
      Components.showToast('Access denied: Your account does not have view permission for that module.', 'warning', 3500);
      this.navigate('dashboard');
      return;
    }

    // Direct URL Query Parameter Authorization (classId, subjectId, report category)
    if (queryString) {
      const params = new URLSearchParams(queryString);
      if (hash === 'examinations') {
        const reqClassId = params.get('classId');
        const reqSubjectId = params.get('subjectId');

        if (reqClassId) {
          if (!Permissions.canAccessClassMarks(user, reqClassId)) {
            Components.showToast('Access denied: That class is not assigned to your teaching profile.', 'warning', 3500);
            this.navigate('dashboard');
            return;
          }
          ExaminationsView.selectClass(reqClassId);
        }

        if (reqSubjectId) {
          const subObj = Data.getSubjects().find(s => s.id === reqSubjectId) || null;
          const effectiveClassId = reqClassId || (subObj ? subObj.classId : '');
          if (!subObj || !Permissions.canAccessSubjectMarks(user, effectiveClassId, reqSubjectId)) {
            Components.showToast('Access denied: That subject is not assigned to your teaching profile.', 'warning', 3500);
            this.navigate('dashboard');
            return;
          }
          if (!reqClassId && subObj.classId) {
            ExaminationsView.selectClass(subObj.classId);
          }
          ExaminationsView.selectSubject(reqSubjectId);
        }
      } else if (hash === 'reports') {
        const reqCat = params.get('category');
        const reqSub = params.get('sub');
        if (reqCat && !Permissions.canAccessReport(user, reqCat)) {
          const contentArea = document.getElementById('main-content-viewport');
          if (contentArea) contentArea.innerHTML = '';
          Components.showToast('Access denied: You do not have permission to view that report category.', 'warning', 3500);
          this.navigate('dashboard');
          return;
        }
        if (reqCat && reqSub && !Permissions.canAccessSubReport(user, reqCat, reqSub)) {
          const contentArea = document.getElementById('main-content-viewport');
          if (contentArea) contentArea.innerHTML = '';
          Components.showToast('Access denied: You do not have permission to view that report view.', 'warning', 3500);
          this.navigate('dashboard');
          return;
        }
      }
    }

    this.currentRoute = hash;

    // Render Shell if not already mounted
    this.ensureAppShellMounted(user);

    // Update active sidebar item
    this.updateActiveNav(hash);

    // Update Topbar Breadcrumbs
    this.updateBreadcrumbs(I18n.t(config.labelKey, hash));

    // Mount Active View
    const contentArea = document.getElementById('main-content-viewport');
    if (contentArea) {
      contentArea.innerHTML = '';
      config.view.render(contentArea);
    }

    window.scrollTo(0, 0);
  },

  ensureAppShellMounted(user) {
    const root = document.getElementById('app-root');
    const existingShell = document.getElementById('app-shell-container');
    if (existingShell) return;

    const navItems = Permissions.getNavItems(user);
    const isRtl = I18n.isRTL();
    const currentLang = I18n.getLanguage();
    const availableLangs = I18n.getAvailableLanguages();
    const isCollapsed = localStorage.getItem('studently_sidebar_collapsed') === 'true';

    root.innerHTML = `
      <div id="app-shell-container" class="min-h-screen flex bg-slate-50 text-slate-800 antialiased ${isRtl ? 'font-cairo' : ''}">
        <!-- Collapsible Mobile Drawer Overlay -->
        <div id="sidebar-overlay" class="fixed inset-0 bg-slate-900/40 z-30 hidden lg:hidden backdrop-blur-xs"></div>

        <!-- Sidebar Navigation (Royal Navy & Gold Identity) -->
        <aside 
          id="app-sidebar" 
          class="fixed top-0 bottom-0 ${isRtl ? 'right-0 border-l' : 'left-0 border-r'} ${isCollapsed ? 'w-20 sidebar-collapsed' : 'w-64'} bg-blue-900 text-white border-amber-500/30 z-40 flex flex-col justify-between transition-all duration-300 ${isRtl ? 'translate-x-full lg:translate-x-0' : '-translate-x-full lg:translate-x-0'}"
        >
          <div>
            <!-- Brand Lockup & Mobile Close -->
            <div class="h-16 px-4 border-b border-white/15 flex items-center justify-between">
              <a href="#dashboard" class="flex items-center gap-2.5 overflow-hidden">
                ${Components.getLogoHtml('w-10 h-10')}
                <div class="sidebar-expanded-text ${isCollapsed ? 'hidden' : ''}">
                  <span class="text-base font-extrabold text-white tracking-tight block leading-tight">AL-IMAAMA</span>
                  <span class="text-[10px] text-amber-300 font-semibold tracking-tight block truncate max-w-[145px]">MADARASATUL AL-IMAAM</span>
                </div>
              </a>
              <button id="close-mobile-nav-btn" class="lg:hidden text-blue-200 hover:text-white p-1.5 rounded-lg">
                ${Components.icon('x', 'w-5 h-5')}
              </button>
            </div>

            <!-- Role Context Bar -->
            <div class="sidebar-role-badge px-4 py-2.5 border-b border-white/10 bg-blue-950/60 flex items-center justify-between">
              <div class="flex items-center gap-2 text-blue-100">
                <span class="text-amber-300 shrink-0">${Components.icon('shield-check', 'w-3.5 h-3.5')}</span>
                <span class="text-xs font-semibold sidebar-expanded-text ${isCollapsed ? 'hidden' : ''}">
                  ${Permissions.isAdmin(user) ? I18n.t('users.adminRole', 'Administrator') : I18n.t('users.teacherRole', 'Teacher')}
                </span>
              </div>
              <span class="text-[10px] uppercase font-bold text-amber-300/80 tracking-wider font-mono sidebar-expanded-text ${isCollapsed ? 'hidden' : ''}">${user.role}</span>
            </div>

            <!-- Navigation Links List with Floating Tooltips -->
            <nav class="p-3 space-y-1.5 max-h-[calc(100vh-14rem)] overflow-y-auto custom-scrollbar" id="sidebar-nav-list">
              ${navItems.map(item => `
                <div class="relative nav-item-wrapper group">
                  <a 
                    href="#${item.id}" 
                    id="nav-${item.id}"
                    class="nav-link flex items-center ${isCollapsed ? 'justify-center px-2 py-3' : 'gap-3 px-3 py-2.5'} rounded-xl text-xs font-medium text-blue-100 hover:bg-white/10 hover:text-white transition-colors"
                    title="${I18n.t(item.labelKey, item.label)}"
                  >
                    <span class="shrink-0 text-current opacity-90">${Components.icon(item.icon, 'w-4 h-4')}</span>
                    <span class="truncate sidebar-expanded-text ${isCollapsed ? 'hidden' : ''}">${I18n.t(item.labelKey, item.label)}</span>
                  </a>
                  <!-- Floating Tooltip for Collapsed Sidebar -->
                  <div class="sidebar-tooltip hidden ${isCollapsed ? 'group-hover:block' : ''} absolute ${isRtl ? 'right-full mr-2.5' : 'left-full ml-2.5'} top-1/2 -translate-y-1/2 px-2.5 py-1 bg-blue-950 text-white border border-amber-400/50 text-[11px] font-semibold rounded-md shadow-lg whitespace-nowrap z-50 pointer-events-none">
                    ${I18n.t(item.labelKey, item.label)}
                  </div>
                </div>
              `).join('')}
            </nav>
          </div>

          <!-- Sidebar Footer User Profile & Logout -->
          <div class="p-3.5 border-t border-white/15 bg-blue-950/60">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2.5 truncate" title="${user.fullName} (${user.email})">
                <div class="w-8 h-8 rounded-full bg-blue-600 text-white border border-amber-400/70 font-bold flex items-center justify-center text-xs shrink-0 shadow-xs">
                  ${user.fullName.charAt(0)}
                </div>
                <div class="truncate sidebar-expanded-text ${isCollapsed ? 'hidden' : ''}">
                  <p class="text-xs font-semibold text-white truncate leading-tight">${user.fullName}</p>
                  <p class="text-[11px] text-blue-200 truncate leading-tight">${user.email}</p>
                </div>
              </div>
              <button id="logout-btn" class="p-1.5 text-blue-200 hover:text-amber-300 hover:bg-white/10 rounded-lg transition-colors shrink-0" title="${I18n.t('common.logout', 'Sign Out')}">
                ${Components.icon('log-out', 'w-4 h-4')}
              </button>
            </div>
          </div>
        </aside>

        <!-- Right Side Main Canvas (or Left in RTL) -->
        <div 
          id="main-layout-container" 
          class="flex-1 ${isCollapsed ? (isRtl ? 'lg:pr-20 sidebar-collapsed' : 'lg:pl-20 sidebar-collapsed') : (isRtl ? 'lg:pr-64' : 'lg:pl-64')} flex flex-col min-h-screen transition-all duration-300"
        >
          <!-- Topbar Application Header -->
          <header id="app-header" class="h-16 bg-white border-b border-slate-200 border-t-2 border-t-amber-500 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-20">
            <div class="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <!-- Mobile Drawer Toggle Button -->
              <button id="open-mobile-nav-btn" class="lg:hidden p-2 text-blue-900 hover:bg-blue-50 rounded-lg transition-colors shrink-0" title="Open Navigation Menu">
                ${Components.icon('menu', 'w-5 h-5')}
              </button>

              <!-- Desktop Sidebar Collapse/Expand Toggle Button -->
              <button 
                id="toggle-sidebar-collapse-btn" 
                class="hidden lg:flex items-center justify-center p-2 text-blue-900 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors shrink-0" 
                title="${isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}"
              >
                ${Components.icon(isCollapsed ? 'panel-left-open' : 'panel-left-close', 'w-4 h-4')}
              </button>

              <!-- Application Header Brand & Breadcrumbs -->
              <div class="flex items-center gap-2 text-xs min-w-0">
                <a href="#dashboard" class="flex items-center gap-2 shrink-0 whitespace-nowrap">
                  ${Components.getLogoHtml('w-8 h-8')}
                  <span class="font-extrabold text-blue-900 tracking-tight hidden sm:inline">AL-IMAAMA</span>
                </a>
                <span class="text-slate-300 hidden sm:inline">/</span>
                <span id="breadcrumb-current-page" class="font-semibold text-slate-900 truncate">Dashboard</span>
              </div>
            </div>

            <!-- Topbar Actions: Language Selector, Date & User Menu -->
            <div class="flex items-center gap-2.5 sm:gap-3">
              <!-- Compact Language Selector Dropdown -->
              <div class="relative shrink-0" id="topbar-lang-container">
                <button 
                  id="lang-menu-btn" 
                  class="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200/70 rounded-lg text-xs font-semibold text-blue-900 transition-colors whitespace-nowrap"
                  title="Switch Language"
                >
                  <span class="text-blue-700">${Components.icon('globe', 'w-3.5 h-3.5')}</span>
                  <span class="font-bold font-mono uppercase">${currentLang}</span>
                  <span class="text-blue-500">${Components.icon('chevron-down', 'w-3 h-3')}</span>
                </button>

                <div 
                  id="lang-dropdown-menu" 
                  class="hidden absolute ${isRtl ? 'left-0' : 'right-0'} mt-1.5 w-36 bg-white border border-slate-200 rounded-xl shadow-lg py-1 z-50 text-xs font-medium"
                >
                  ${availableLangs.map(l => `
                    <button 
                      class="lang-option-btn w-full text-left px-3 py-2 flex items-center justify-between hover:bg-slate-50 transition-colors ${currentLang === l.code ? 'text-blue-700 font-bold bg-blue-50/60' : 'text-slate-700'}"
                      data-lang="${l.code}"
                    >
                      <span>${l.label}</span>
                      <span class="text-[10px] font-mono px-1 py-0.5 rounded ${currentLang === l.code ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-500'}">${l.short}</span>
                    </button>
                  `).join('')}
                </div>
              </div>

              <!-- Date indicator -->
              <div class="hidden md:flex items-center gap-2 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 whitespace-nowrap">
                <span class="text-blue-700">${Components.icon('calendar', 'w-3.5 h-3.5')}</span>
                <span class="tabular-nums">${new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>

              ${Permissions.isAdmin(user) ? `
                <a href="#settings" class="hidden sm:flex p-1.5 text-blue-900 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors" title="${I18n.t('nav.settings', 'Settings')}">
                  ${Components.icon('settings', 'w-4 h-4')}
                </a>
              ` : ''}

              <!-- Interactive User Menu Dropdown -->
              <div class="relative shrink-0" id="topbar-user-container">
                <button
                  id="user-menu-btn"
                  class="flex items-center gap-2 px-2 py-1 rounded-lg border border-slate-200 bg-white hover:border-amber-400 hover:bg-slate-50 transition-colors"
                  title="${user.fullName}"
                >
                  <div class="w-7 h-7 rounded-full bg-blue-900 text-white border border-amber-400/70 font-bold flex items-center justify-center text-xs shrink-0">
                    ${user.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div class="hidden sm:block text-left leading-tight">
                    <span class="block text-xs font-semibold text-slate-900 max-w-[110px] truncate">${user.fullName}</span>
                    <span class="block text-[10px] font-bold text-amber-600 uppercase">${user.role}</span>
                  </div>
                  <span class="text-slate-400">${Components.icon('chevron-down', 'w-3.5 h-3.5')}</span>
                </button>

                <div
                  id="user-dropdown-menu"
                  class="hidden absolute ${isRtl ? 'left-0' : 'right-0'} mt-1.5 w-56 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-50 text-xs"
                >
                  <div class="px-3.5 py-2 border-b border-slate-100">
                    <p class="font-bold text-slate-900 truncate">${user.fullName}</p>
                    <p class="text-[11px] text-slate-500 font-mono truncate">${user.email}</p>
                  </div>
                  <button id="menu-my-profile" class="w-full text-left px-3.5 py-2 flex items-center gap-2.5 text-slate-700 hover:bg-slate-50 transition-colors">
                    <span class="text-slate-400">${Components.icon('user', 'w-4 h-4')}</span>
                    <span>${I18n.t('userMenu.myProfile', 'My Profile')}</span>
                  </button>
                  <button id="menu-change-password" class="w-full text-left px-3.5 py-2 flex items-center gap-2.5 text-slate-700 hover:bg-slate-50 transition-colors">
                    <span class="text-slate-400">${Components.icon('key', 'w-4 h-4')}</span>
                    <span>${I18n.t('userMenu.changePassword', 'Change Password')}</span>
                  </button>
                  <button id="menu-account-info" class="w-full text-left px-3.5 py-2 flex items-center gap-2.5 text-slate-700 hover:bg-slate-50 transition-colors">
                    <span class="text-slate-400">${Components.icon('info', 'w-4 h-4')}</span>
                    <span>${I18n.t('userMenu.accountInfo', 'Account Information')}</span>
                  </button>
                  ${Permissions.isAdmin(user) ? `
                    <button id="menu-download-zip" class="w-full text-left px-3.5 py-2 flex items-center gap-2.5 text-blue-800 hover:bg-blue-50 font-medium transition-colors">
                      <span class="text-blue-600">${Components.icon('download', 'w-4 h-4')}</span>
                      <span>Download Complete Project (ZIP)</span>
                    </button>
                  ` : ''}
                  <div class="my-1 border-t border-slate-100"></div>
                  <button id="menu-logout" class="w-full text-left px-3.5 py-2 flex items-center gap-2.5 text-rose-600 hover:bg-rose-50 font-semibold transition-colors">
                    <span>${Components.icon('log-out', 'w-4 h-4')}</span>
                    <span>${I18n.t('userMenu.logout', 'Logout')}</span>
                  </button>
                </div>
              </div>
            </div>
          </header>

          <!-- Main Content Viewport -->
          <main id="main-content" class="flex-1 p-4 sm:p-6 md:p-8 max-w-7xl w-full mx-auto">
            <div id="main-content-viewport"></div>
          </main>
        </div>
      </div>
    `;

    this.bindShellEvents();
  },

  bindShellEvents() {
    const openBtn = document.getElementById('open-mobile-nav-btn');
    const closeBtn = document.getElementById('close-mobile-nav-btn');
    const toggleCollapseBtn = document.getElementById('toggle-sidebar-collapse-btn');
    const sidebar = document.getElementById('app-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const mainContainer = document.getElementById('main-layout-container');
    const logoutBtn = document.getElementById('logout-btn');
    const isRtl = I18n.isRTL();

    // Mobile Navigation Drawer Toggle with Background Scroll Prevention
    const toggleMobileDrawer = (open) => {
      const translateClass = isRtl ? 'translate-x-full' : '-translate-x-full';
      if (open) {
        sidebar.classList.remove(translateClass);
        overlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden'; // Prevent background scrolling while open
      } else {
        sidebar.classList.add(translateClass);
        overlay.classList.add('hidden');
        document.body.style.overflow = ''; // Restore scrolling
      }
    };

    if (openBtn) openBtn.addEventListener('click', () => toggleMobileDrawer(true));
    if (closeBtn) closeBtn.addEventListener('click', () => toggleMobileDrawer(false));
    if (overlay) overlay.addEventListener('click', () => toggleMobileDrawer(false));

    // Close mobile drawer when clicking any navigation link
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth < 1024) {
          toggleMobileDrawer(false);
        }
      });
    });

    // Desktop Sidebar Collapse/Expand Toggle
    if (toggleCollapseBtn && sidebar && mainContainer) {
      toggleCollapseBtn.addEventListener('click', () => {
        const isCurrentlyCollapsed = sidebar.classList.contains('sidebar-collapsed');
        const willCollapse = !isCurrentlyCollapsed;

        // Persist user preference
        localStorage.setItem('studently_sidebar_collapsed', willCollapse ? 'true' : 'false');

        if (willCollapse) {
          sidebar.classList.add('sidebar-collapsed', 'w-20');
          sidebar.classList.remove('w-64');
          mainContainer.classList.add('sidebar-collapsed');
          if (isRtl) {
            mainContainer.classList.remove('lg:pr-64');
            mainContainer.classList.add('lg:pr-20');
          } else {
            mainContainer.classList.remove('lg:pl-64');
            mainContainer.classList.add('lg:pl-20');
          }
          document.querySelectorAll('.sidebar-expanded-text').forEach(el => el.classList.add('hidden'));
          document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.add('justify-center', 'px-2', 'py-3');
            link.classList.remove('gap-3', 'px-3', 'py-2.5');
          });
          document.querySelectorAll('.sidebar-tooltip').forEach(tt => tt.classList.add('group-hover:block'));
          toggleCollapseBtn.innerHTML = Components.icon('panel-left-open', 'w-4 h-4');
          toggleCollapseBtn.title = 'Expand Sidebar';
        } else {
          sidebar.classList.remove('sidebar-collapsed', 'w-20');
          sidebar.classList.add('w-64');
          mainContainer.classList.remove('sidebar-collapsed');
          if (isRtl) {
            mainContainer.classList.remove('lg:pr-20');
            mainContainer.classList.add('lg:pr-64');
          } else {
            mainContainer.classList.remove('lg:pl-20');
            mainContainer.classList.add('lg:pl-64');
          }
          document.querySelectorAll('.sidebar-expanded-text').forEach(el => el.classList.remove('hidden'));
          document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('justify-center', 'px-2', 'py-3');
            link.classList.add('gap-3', 'px-3', 'py-2.5');
          });
          document.querySelectorAll('.sidebar-tooltip').forEach(tt => tt.classList.remove('group-hover:block'));
          toggleCollapseBtn.innerHTML = Components.icon('panel-left-close', 'w-4 h-4');
          toggleCollapseBtn.title = 'Collapse Sidebar';
        }
      });
    }

    // Language Dropdown & User Menu Dropdown toggles
    const langBtn = document.getElementById('lang-menu-btn');
    const langMenu = document.getElementById('lang-dropdown-menu');
    const userBtn = document.getElementById('user-menu-btn');
    const userMenu = document.getElementById('user-dropdown-menu');

    if (langBtn && langMenu) {
      langBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (userMenu) userMenu.classList.add('hidden');
        langMenu.classList.toggle('hidden');
      });

      document.querySelectorAll('.lang-option-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const targetLang = btn.dataset.lang;
          I18n.setLanguage(targetLang);
          langMenu.classList.add('hidden');
          Components.showToast(`Language changed to ${btn.querySelector('span').textContent}`, 'info', 2000);
        });
      });
    }

    if (userBtn && userMenu) {
      userBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (langMenu) langMenu.classList.add('hidden');
        userMenu.classList.toggle('hidden');
      });
    }

    document.addEventListener('click', () => {
      if (langMenu) langMenu.classList.add('hidden');
      if (userMenu) userMenu.classList.add('hidden');
    });

    const triggerLogout = () => {
      Components.confirmDialog({
        title: I18n.t('common.logout', 'Sign Out Session'),
        message: 'Are you sure you want to end your current session?',
        confirmText: I18n.t('common.logout', 'Sign Out'),
        onConfirm: async () => {
          await Auth.logout();
          Components.showToast('You have signed out successfully.', 'info');
          this.navigate('login');
        }
      });
    };

    if (logoutBtn) logoutBtn.addEventListener('click', triggerLogout);

    const menuLogout = document.getElementById('menu-logout');
    if (menuLogout) {
      menuLogout.addEventListener('click', () => {
        if (userMenu) userMenu.classList.add('hidden');
        triggerLogout();
      });
    }

    const menuProfile = document.getElementById('menu-my-profile');
    if (menuProfile) {
      menuProfile.addEventListener('click', () => {
        if (userMenu) userMenu.classList.add('hidden');
        this.openMyProfileModal(Auth.getCurrentUser());
      });
    }

    const menuChangePass = document.getElementById('menu-change-password');
    if (menuChangePass) {
      menuChangePass.addEventListener('click', () => {
        if (userMenu) userMenu.classList.add('hidden');
        this.openChangePasswordModal(Auth.getCurrentUser());
      });
    }

    const menuAccountInfo = document.getElementById('menu-account-info');
    if (menuAccountInfo) {
      menuAccountInfo.addEventListener('click', () => {
        if (userMenu) userMenu.classList.add('hidden');
        this.openAccountInfoModal(Auth.getCurrentUser());
      });
    }

    const menuDownloadZip = document.getElementById('menu-download-zip');
    if (menuDownloadZip) {
      menuDownloadZip.addEventListener('click', async () => {
        if (userMenu) userMenu.classList.add('hidden');
        if (!Permissions.isAdmin(Auth.getCurrentUser())) return;
        await Components.downloadProjectZip();
      });
    }
  },

  openMyProfileModal(user) {
    if (!user) return;
    const classes = Data.getClasses();
    const subjects = Data.getSubjects();
    const teacher = user.teacherDetails || null;
    const assignedClasses = teacher ? classes.filter(c => (teacher.assignedClassIds || []).includes(c.id)) : [];
    const assignedSubjects = teacher ? subjects.filter(s => (teacher.assignedSubjectIds || []).includes(s.id)) : [];

    const content = `
      <form id="my-profile-form" class="space-y-4 text-xs">
        <div class="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
          <div class="w-12 h-12 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-lg shrink-0">
            ${user.fullName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 class="text-sm font-bold text-slate-900">${user.fullName}</h3>
            <p class="text-slate-500 font-mono">${user.email}</p>
            <span class="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">${user.role}</span>
          </div>
        </div>

        <div>
          <label class="block font-semibold text-slate-700 mb-1">Full Name <span class="text-rose-500">*</span></label>
          <input type="text" name="fullName" required value="${user.fullName}" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 font-medium text-slate-900"/>
        </div>

        <div>
          <label class="block font-semibold text-slate-700 mb-1">Email Address</label>
          <input type="email" value="${user.email}" readonly class="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg font-mono text-slate-500 cursor-not-allowed"/>
        </div>

        ${teacher ? `
          <div class="p-3 bg-blue-50/50 border border-blue-100 rounded-lg space-y-2">
            <p class="font-bold text-slate-800">Teacher Assignments</p>
            <p class="text-slate-600"><strong>Classes:</strong> ${assignedClasses.map(c => c.name).join(', ') || 'None'}</p>
            <p class="text-slate-600"><strong>Subjects:</strong> ${assignedSubjects.map(s => s.name).join(', ') || 'None'}</p>
          </div>
        ` : ''}

        <div class="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <button type="button" id="profile-cancel-btn" class="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">Close</button>
          <button type="submit" class="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm">Save Profile</button>
        </div>
      </form>
    `;

    Components.openModal(content, I18n.t('userMenu.myProfile', 'My Profile'), { maxWidth: 'max-w-md' });
    document.getElementById('profile-cancel-btn').addEventListener('click', () => Components.closeModal());
    document.getElementById('my-profile-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const fullName = (new FormData(e.target).get('fullName') || '').trim();
      if (!fullName) return;

      const userRecord = Data.getUserByEmail(user.email);
      if (userRecord) {
        Data.updateUser(userRecord.id, { ...userRecord, fullName });
      }
      const session = Storage.get(Storage.KEYS.SESSION, null);
      if (session) {
        session.fullName = fullName;
        Storage.set(Storage.KEYS.SESSION, session);
      }
      Components.closeModal();
      Components.showToast('Profile updated successfully.', 'success');
      const shell = document.getElementById('app-shell-container');
      if (shell) shell.remove();
      this.handleRoute();
    });
  },

  openChangePasswordModal(user) {
    if (!user) return;
    const content = `
      <form id="change-password-form" class="space-y-4 text-xs">
        <div>
          <label class="block font-semibold text-slate-700 mb-1">Current Password <span class="text-rose-500">*</span></label>
          <input type="password" name="currentPassword" required placeholder="••••••••" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600"/>
        </div>
        <div>
          <label class="block font-semibold text-slate-700 mb-1">New Password (min 6 characters) <span class="text-rose-500">*</span></label>
          <input type="password" name="newPassword" required minlength="6" placeholder="••••••••" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600"/>
        </div>
        <div>
          <label class="block font-semibold text-slate-700 mb-1">Confirm New Password <span class="text-rose-500">*</span></label>
          <input type="password" name="confirmPassword" required minlength="6" placeholder="••••••••" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600"/>
        </div>
        <div id="change-pass-error" class="hidden p-2.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-medium"></div>
        <div class="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <button type="button" id="pass-cancel-btn" class="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
          <button type="submit" class="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm">Update Password</button>
        </div>
      </form>
    `;

    Components.openModal(content, I18n.t('userMenu.changePassword', 'Change Password'), { maxWidth: 'max-w-md' });
    document.getElementById('pass-cancel-btn').addEventListener('click', () => Components.closeModal());
    document.getElementById('change-password-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const cur = (fd.get('currentPassword') || '').trim();
      const next = (fd.get('newPassword') || '').trim();
      const conf = (fd.get('confirmPassword') || '').trim();
      const errEl = document.getElementById('change-pass-error');

      const userRecord = Data.getUserByEmail(user.email);
      if (!userRecord || userRecord.password !== cur) {
        errEl.classList.remove('hidden');
        errEl.textContent = 'Current password is incorrect.';
        return;
      }
      if (next.length < 6) {
        errEl.classList.remove('hidden');
        errEl.textContent = 'New password must be at least 6 characters long.';
        return;
      }
      if (next !== conf) {
        errEl.classList.remove('hidden');
        errEl.textContent = 'New password and confirmation do not match.';
        return;
      }

      Data.updateUser(userRecord.id, { ...userRecord, password: next });
      Components.closeModal();
      Components.showToast('Your password has been updated successfully.', 'success');
    });
  },

  openAccountInfoModal(user) {
    if (!user) return;
    const userRecord = Data.getUserByEmail(user.email) || user;
    const permSummary = Permissions.summarizeUserPermissions(user);
    const content = `
      <div class="space-y-4 text-xs">
        <div class="grid grid-cols-2 gap-3">
          <div class="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <span class="text-slate-400 block text-[10px] uppercase font-bold">Account ID</span>
            <p class="font-mono font-bold text-blue-600 mt-0.5">${userRecord.id}</p>
          </div>
          <div class="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <span class="text-slate-400 block text-[10px] uppercase font-bold">Role & Status</span>
            <p class="font-bold text-slate-900 mt-0.5">${userRecord.role} · <span class="text-emerald-600">${userRecord.status || 'Active'}</span></p>
          </div>
          <div class="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <span class="text-slate-400 block text-[10px] uppercase font-bold">Email Address</span>
            <p class="font-mono text-slate-800 mt-0.5 break-all">${userRecord.email}</p>
          </div>
          <div class="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <span class="text-slate-400 block text-[10px] uppercase font-bold">Session Started</span>
            <p class="tabular-nums text-slate-800 mt-0.5">${user.loginAt ? new Date(user.loginAt).toLocaleString() : 'Active Session'}</p>
          </div>
        </div>
        <div class="p-3 bg-blue-50/50 rounded-lg border border-blue-100">
          <span class="text-slate-500 block text-[10px] uppercase font-bold mb-1">Active Permissions Summary</span>
          <p class="font-semibold text-slate-800">${permSummary}</p>
        </div>
        <div class="flex justify-end pt-2">
          <button type="button" id="info-close-btn" class="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">Close</button>
        </div>
      </div>
    `;
    Components.openModal(content, I18n.t('userMenu.accountInfo', 'Account Information'), { maxWidth: 'max-w-md' });
    document.getElementById('info-close-btn').addEventListener('click', () => Components.closeModal());
  },

  updateActiveNav(route) {
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.remove('bg-blue-600', 'text-white', 'font-semibold', 'border', 'border-amber-400/60', 'shadow-sm');
      link.classList.add('text-blue-100', 'hover:bg-white/10', 'hover:text-white');
    });

    const activeEl = document.getElementById(`nav-${route}`);
    if (activeEl) {
      activeEl.classList.add('bg-blue-600', 'text-white', 'font-semibold', 'border', 'border-amber-400/60', 'shadow-sm');
      activeEl.classList.remove('text-blue-100', 'hover:bg-white/10', 'hover:text-white');
    }
  },

  updateBreadcrumbs(label) {
    const el = document.getElementById('breadcrumb-current-page');
    if (el) el.textContent = label;
  },

  // Auth Screens Rendering
  renderAuthScreen(type) {
    // 1. Ensure any existing authenticated app shell, sidebar, or drawer overlay is cleanly purged
    const existingShell = document.getElementById('app-shell-container');
    if (existingShell) existingShell.remove();
    const existingSidebar = document.getElementById('app-sidebar');
    if (existingSidebar) existingSidebar.remove();
    const existingOverlay = document.getElementById('sidebar-overlay');
    if (existingOverlay) existingOverlay.remove();
    document.body.style.overflow = '';

    const root = document.getElementById('app-root');
    const rememberedEmail = Auth.getRememberedEmail();

    if (type === 'forgot-password') {
      root.innerHTML = `
        <div class="min-h-dvh w-full overflow-x-hidden bg-slate-50 flex flex-col justify-center items-center py-4 px-4 sm:px-6 ${I18n.isRTL() ? 'font-cairo' : ''}">
          <div class="w-full max-w-[410px]">
            <div class="text-center mb-4">
              ${Components.getLogoHtml('w-16 h-16 sm:w-20 sm:h-20 mx-auto p-0.5 shadow-sm')}
              <h2 class="mt-2.5 text-xl sm:text-2xl font-extrabold tracking-tight text-blue-900">${I18n.t('auth.forgotPassword', 'AL-IMAAMA Password Recovery')}</h2>
              <p class="mt-1 text-xs text-slate-600"><strong class="text-amber-600">MADARASATUL AL-IMAAM</strong> · Enter your registered email to receive recovery instructions.</p>
            </div>

            <div class="bg-white py-5 px-5 sm:py-6 sm:px-7 shadow-sm border border-slate-200 border-t-4 border-t-blue-900 rounded-2xl">
              <form id="forgot-form" class="space-y-3.5 text-xs">
                <div>
                  <label class="block font-semibold text-slate-800 mb-1">${I18n.t('auth.emailLabel', 'Email Address')}</label>
                  <input type="email" id="forgot-email" required placeholder="admin@alimaama.demo" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 focus:bg-white focus:outline-none text-slate-900"/>
                </div>
                <div id="forgot-status" class="hidden text-xs p-2.5 rounded-lg"></div>
                <button type="submit" class="w-full py-2.5 px-4 text-xs font-semibold rounded-lg text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm">
                  Send Recovery Link
                </button>
                <div class="text-center pt-1">
                  <a href="#login" class="text-xs font-semibold text-blue-600 hover:underline">${I18n.t('auth.backToLogin', '← Back to Login')}</a>
                </div>
              </form>
            </div>
          </div>
        </div>
      `;

      document.getElementById('forgot-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('forgot-email').value;
        const res = await Auth.requestPasswordReset(email);
        const statusBox = document.getElementById('forgot-status');
        statusBox.classList.remove('hidden');
        if (res.success) {
          statusBox.className = 'text-xs p-3 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200';
          statusBox.innerHTML = `${res.message} <br/><a href="#reset-password" class="font-bold underline mt-1 inline-block">Proceed to Reset Password →</a>`;
        } else {
          statusBox.className = 'text-xs p-3 rounded-lg bg-rose-50 text-rose-800 border border-rose-200';
          statusBox.textContent = res.error;
        }
      });
      return;
    }

    if (type === 'reset-password') {
      root.innerHTML = `
        <div class="min-h-dvh w-full overflow-x-hidden bg-slate-50 flex flex-col justify-center items-center py-4 px-4 sm:px-6 ${I18n.isRTL() ? 'font-cairo' : ''}">
          <div class="w-full max-w-[410px]">
            <div class="text-center mb-4">
              ${Components.getLogoHtml('w-16 h-16 sm:w-20 sm:h-20 mx-auto p-0.5 shadow-sm')}
              <h2 class="mt-2.5 text-xl sm:text-2xl font-extrabold tracking-tight text-blue-900">Set New Password</h2>
              <p class="mt-1 text-xs text-slate-600"><strong class="text-amber-600">MADARASATUL AL-IMAAM</strong> · Create a new secure password for your AL-IMAAMA account.</p>
            </div>

            <div class="bg-white py-5 px-5 sm:py-6 sm:px-7 shadow-sm border border-slate-200 border-t-4 border-t-blue-900 rounded-2xl">
              <form id="reset-form" class="space-y-3.5 text-xs">
                <div>
                  <label class="block font-semibold text-slate-800 mb-1">Confirm Account Email</label>
                  <input type="email" id="reset-email" required value="admin@alimaama.demo" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 focus:bg-white focus:outline-none text-slate-900"/>
                </div>
                <div>
                  <label class="block font-semibold text-slate-800 mb-1">New Password (min 6 characters)</label>
                  <input type="password" id="reset-new-password" required placeholder="••••••••" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 focus:bg-white focus:outline-none text-slate-900"/>
                </div>
                <div id="reset-status" class="hidden text-xs p-2.5 rounded-lg"></div>
                <button type="submit" class="w-full py-2.5 px-4 text-xs font-semibold rounded-lg text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm">
                  Update Password & Proceed
                </button>
                <div class="text-center pt-1">
                  <a href="#login" class="text-xs font-semibold text-blue-600 hover:underline">${I18n.t('auth.backToLogin', '← Back to Login')}</a>
                </div>
              </form>
            </div>
          </div>
        </div>
      `;

      document.getElementById('reset-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('reset-email').value;
        const pass = document.getElementById('reset-new-password').value;
        const res = Auth.resetPassword(email, pass);
        const statusBox = document.getElementById('reset-status');
        statusBox.classList.remove('hidden');
        if (res.success) {
          statusBox.className = 'text-xs p-3 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200';
          statusBox.innerHTML = 'Password updated successfully! <a href="#login" class="font-bold underline ml-1">Login now →</a>';
        } else {
          statusBox.className = 'text-xs p-3 rounded-lg bg-rose-50 text-rose-800 border border-rose-200';
          statusBox.textContent = res.error;
        }
      });
      return;
    }

    // Default: Clean Login Screen (No Sidebar, No Language Selector, Single-Viewport Fit on Desktop/Laptop/Tablet/Mobile)
    root.innerHTML = `
      <div id="login-screen-wrapper" class="min-h-dvh w-full overflow-x-hidden bg-slate-50 flex flex-col justify-center items-center py-3 px-4 sm:py-5 sm:px-6 ${I18n.isRTL() ? 'font-cairo' : ''}">
        <div class="w-full max-w-[410px]">
          <div class="text-center mb-3 sm:mb-4">
            ${Components.getLogoHtml('w-16 h-16 sm:w-20 sm:h-20 mx-auto p-0.5 shadow-sm')}
            <h2 class="mt-2 text-xl sm:text-2xl font-extrabold tracking-tight text-blue-900 leading-tight">${I18n.t('auth.signInTitle', 'AL-IMAAMA')}</h2>
            <p class="text-[11px] font-bold text-amber-600 tracking-wide uppercase mt-0.5">MADARASATUL AL-IMAAM</p>
            <p class="text-[11px] sm:text-xs text-slate-500 mt-0.5 font-medium">${I18n.t('auth.tagline', 'Smart Student & Payment Management')}</p>
          </div>

          <div class="bg-white py-4 px-5 sm:py-5 sm:px-7 shadow-sm border border-slate-200 border-t-4 border-t-blue-900 rounded-2xl space-y-3.5">
            <!-- 1-Click Demo Fill Tabs -->
            <div class="space-y-1">
              <span class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">${I18n.t('auth.adminDemo', 'Admin Demo')} / ${I18n.t('auth.teacherDemo', 'Teacher Demo')}</span>
              <div class="grid grid-cols-2 gap-2">
                <button type="button" id="fill-admin-btn" class="py-1.5 px-2.5 text-left border border-blue-200 bg-blue-50/60 hover:bg-blue-50 hover:border-blue-600 rounded-xl transition-colors">
                  <span class="block font-bold text-blue-900 text-xs leading-tight">${I18n.t('auth.adminDemo', 'Admin Demo')}</span>
                  <span class="block font-mono text-[10px] text-blue-700 truncate">admin@alimaama.demo</span>
                </button>
                <button type="button" id="fill-teacher-btn" class="py-1.5 px-2.5 text-left border border-amber-300 bg-amber-50/70 hover:bg-amber-50 hover:border-amber-500 rounded-xl transition-colors">
                  <span class="block font-bold text-blue-900 text-xs leading-tight">${I18n.t('auth.teacherDemo', 'Teacher Demo')}</span>
                  <span class="block font-mono text-[10px] text-amber-700 truncate">teacher@alimaama.demo</span>
                </button>
              </div>
            </div>

            <!-- Login Form -->
            <form id="login-form" class="space-y-3 text-xs">
              <div>
                <label class="block font-semibold text-slate-700 mb-1">${I18n.t('auth.emailLabel', 'Email Address')}</label>
                <input 
                  type="email" 
                  id="login-email" 
                  required 
                  placeholder="admin@alimaama.demo"
                  value="${rememberedEmail || 'admin@alimaama.demo'}"
                  class="w-full px-3 py-1.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 focus:bg-white focus:outline-none text-slate-900 font-medium"
                />
              </div>

              <div>
                <div class="flex items-center justify-between mb-1">
                  <label class="font-semibold text-slate-700">${I18n.t('auth.passwordLabel', 'Password')}</label>
                  <a href="#forgot-password" class="text-[11px] font-semibold text-blue-600 hover:underline">${I18n.t('auth.forgotPassword', 'Forgot password?')}</a>
                </div>
                <div class="relative">
                  <input 
                    type="password" 
                    id="login-password" 
                    required 
                    placeholder="••••••••"
                    value="Admin123!"
                    class="w-full px-3 py-1.5 sm:py-2 pr-10 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 focus:bg-white focus:outline-none text-slate-900"
                  />
                  <button type="button" id="toggle-pass-visibility" class="absolute inset-y-0 ${I18n.isRTL() ? 'left-0 pl-3' : 'right-0 pr-3'} flex items-center text-slate-400 hover:text-slate-600">
                    ${Components.icon('eye', 'w-4 h-4')}
                  </button>
                </div>
              </div>

              <div class="flex items-center">
                <input 
                  type="checkbox" 
                  id="remember-me" 
                  ${rememberedEmail ? 'checked' : ''}
                  class="rounded text-blue-600 focus:ring-blue-500"
                />
                <label for="remember-me" class="ml-2 block text-slate-600 font-medium">${I18n.t('auth.rememberMe', 'Remember my email')}</label>
              </div>

              <div id="login-error-msg" class="hidden text-xs p-2.5 rounded-lg bg-rose-50 text-rose-800 border border-rose-200 font-medium"></div>

              <button 
                type="submit" 
                id="login-submit-btn" 
                class="w-full py-2 sm:py-2.5 px-4 text-xs font-semibold rounded-lg text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm"
              >
                ${I18n.t('auth.signInBtn', 'Sign In to System')}
              </button>
            </form>
          </div>
        </div>
      </div>
    `;

    // Quick demo fills
    const adminBtn = document.getElementById('fill-admin-btn');
    const teacherBtn = document.getElementById('fill-teacher-btn');
    const emailInput = document.getElementById('login-email');
    const passInput = document.getElementById('login-password');

    if (adminBtn) {
      adminBtn.addEventListener('click', () => {
        emailInput.value = 'admin@alimaama.demo';
        passInput.value = 'Admin123!';
      });
    }

    if (teacherBtn) {
      teacherBtn.addEventListener('click', () => {
        emailInput.value = 'teacher@alimaama.demo';
        passInput.value = 'Teacher123!';
      });
    }

    // Toggle password visibility
    const togglePassBtn = document.getElementById('toggle-pass-visibility');
    if (togglePassBtn) {
      togglePassBtn.addEventListener('click', () => {
        passInput.type = passInput.type === 'password' ? 'text' : 'password';
      });
    }

    // Login submit
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        const origText = submitBtn ? submitBtn.innerHTML : '';
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<span class="inline-block animate-spin mr-2">⟳</span> Signing in...';
        }

        const email = emailInput.value;
        const pass = passInput.value;
        const remember = document.getElementById('remember-me').checked;
        const errBox = document.getElementById('login-error-msg');

        try {
          const res = await Auth.login(email, pass, remember);
          if (res.success) {
            if (errBox) errBox.classList.add('hidden');
            Components.showToast(`Signed in as ${res.user.fullName} (${res.user.role})`, 'success');
            if (window.Data && typeof Data.syncFromBackend === 'function') {
              Data.syncFromBackend().catch(err => console.warn('Background sync warning:', err));
            }
            this.navigate('dashboard');
          } else {
            if (errBox) {
              errBox.classList.remove('hidden');
              errBox.textContent = res.error || 'Authentication failed';
            }
          }
        } catch (err) {
          if (errBox) {
            errBox.classList.remove('hidden');
            errBox.textContent = err.message || 'An unexpected error occurred during sign in.';
          }
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = origText;
          }
        }
      });
    }
  },

  bindAuthLangEvents() {
    document.querySelectorAll('.auth-lang-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const lang = btn.dataset.lang;
        I18n.setLanguage(lang);
      });
    });
  }
};
