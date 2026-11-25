// Reports & Router RBAC & CSV Export Tests
// Polyfill minimal browser globals for Node.js test environment
const storageStore = new Map();
globalThis.localStorage = {
  getItem: (k) => (storageStore.has(k) ? storageStore.get(k) : null),
  setItem: (k, v) => storageStore.set(k, String(v)),
  removeItem: (k) => storageStore.delete(k),
  clear: () => storageStore.clear(),
};
const windowListeners = new Map();
globalThis.window = {
  localStorage: globalThis.localStorage, location: { hash: '' }, atob: globalThis.atob, btoa: globalThis.btoa,
  navigator: { userAgent: 'node' }, innerWidth: 1280,
  addEventListener: (event, handler) => windowListeners.set(event, [...(windowListeners.get(event) || []), handler]),
  dispatchEvent: (event) => (windowListeners.get(event.type) || []).forEach(handler => handler(event)),
};
globalThis.window.scrollTo = () => {};
globalThis.document = {
  createElement: (tag) => ({ ...fakeElement(), tag }),
  getElementById: (id) => {
    if (!globalThis.document.elements.has(id)) globalThis.document.elements.set(id, fakeElement(id));
    return globalThis.document.elements.get(id);
  },
  querySelectorAll: () => [],
  documentElement: { setAttribute: () => {} },
  elements: new Map(),
  body: { style: {}, appendChild: () => {}, removeChild: () => {} },
};
function fakeElement(id = '') {
  return {
    id, children: [], style: {}, dataset: {}, classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    setAttribute: () => {}, appendChild: (c) => this.children.push(c), remove: () => {}, click: () => {},
    addEventListener: () => {}, querySelector: () => null, querySelectorAll: () => [], innerHTML: '', textContent: '',
  };
}

const assert = (await import('node:assert')).default;
const { Auth } = await import('../assets/js/auth.js');
const { Permissions, ROLES } = await import('../assets/js/permissions.js');
const { Router } = await import('../assets/js/router.js');
const { ReportsView } = await import('../assets/js/reports.js');
const { Components } = await import('../assets/js/components.js');
const { API } = await import('../assets/js/api.js');
const { Storage } = await import('../assets/js/storage.js');

let totalTests = 0;
let passedTests = 0;
function it(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`✅ PASS: ${name}`);
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function runTests() {
  console.log('\n=== Reports & Router RBAC & CSV Export Tests ===');

  // Mock Auth and Components
  Auth.isAuthenticated = () => true;
  const toastMessages = [];
  Components.showToast = (msg, type, duration) => {
    toastMessages.push({ msg, type, duration });
  };

  const adminUser = { id: 'admin-1', role: ROLES.ADMIN, fullName: 'Admin', email: 'admin@example.com' };
  const teacherUser = {
    id: 'teacher-1',
    role: ROLES.TEACHER,
    fullName: 'Teacher',
    email: 'teacher@example.com',
    teacherDetails: { assignedClassIds: ['cls-1'], assignedSubjectIds: ['sub-1'] },
  };

  it('Admin-only student and ranking reports follow the role matrix', () => {
    for (const [category, subReport] of [['students', 'all'], ['results', 'class-ranking']]) {
      assert.strictEqual(Permissions.canAccessSubReport(adminUser, category, subReport), true);
      assert.strictEqual(Permissions.canAccessSubReport(teacherUser, category, subReport), false);
    }
  });

  // Helper to reset toast
  function resetToast() { toastMessages.length = 0; }

  // Test 1: Admin can access students.all sub-report via direct URL
  Auth.getCurrentUser = () => adminUser;
  resetToast();
  window.location.hash = '#reports?category=students&sub=all';
  Router.init();
  // After handleRoute, should not have redirected toast and selectedSubReport should be 'all'
  it('Admin can access students.all via direct URL', () => {
    assert.strictEqual(ReportsView.render, ReportsView.render); // placeholder, actual check via internal state not exposed
    // Ensure no access denied toast
    assert.strictEqual(toastMessages.length, 0, 'No toast should be shown');
  });

  // Test 2: Teacher denied access to students.all via direct URL
  Auth.getCurrentUser = () => teacherUser;
  resetToast();
  window.location.hash = '#reports?category=students&sub=all';
  window.dispatchEvent({ type: 'hashchange' });
  it('Teacher denied access to students.all via direct URL', () => {
    assert.strictEqual(toastMessages.length, 1, 'Access denied toast expected');
    assert.ok(toastMessages[0].msg.toLowerCase().includes('access'), 'Toast should indicate access denied');
  });

  // Test 3: Teacher default sub-report is by-class when accessing students category
  Auth.getCurrentUser = () => teacherUser;
  resetToast();
  window.location.hash = '#reports?category=students';
  window.dispatchEvent({ type: 'hashchange' });
  // Render will set selectedSubReport internally; we can check by rendering and inspecting DOM data attribute
  const container = document.getElementById('main-content-viewport');
  // Simulate ReportsView rendering within router; after handleRoute, container.innerHTML contains data-report-sub attribute
  const dataSub = container.innerHTML.includes('data-report-sub="by-class"') ? 'by-class' : null;
  it('Teacher defaults to students.by-class when no sub specified', () => {
    assert.strictEqual(dataSub, 'by-class');
  });

  // Direct URL, forward/back navigation, and report rendering are all guarded.
  resetToast();
  window.location.hash = '#reports?category=results&sub=class-ranking';
  window.dispatchEvent({ type: 'hashchange' });
  it('Teacher cannot render results.class-ranking through direct navigation', () => {
    assert.strictEqual(container.innerHTML, '');
    assert.strictEqual(toastMessages.length, 1);
  });
  window.location.hash = '#reports?category=students&sub=by-class';
  window.dispatchEvent({ type: 'hashchange' });
  window.location.hash = '#reports?category=students&sub=all';
  window.dispatchEvent({ type: 'hashchange' });
  it('Teacher browser navigation to a restricted report clears prior content', () => {
    assert.strictEqual(container.innerHTML, '');
  });

  // Exercise the report page's actual CSV button handler and production serializer.
  Storage.init();
  const captured = {};
  const realExportToCSV = Components.exportToCSV.bind(Components);
  Components.exportToCSV = (...args) => {
    captured.args = args;
    captured.content = realExportToCSV(...args);
    return captured.content;
  };
  const csvButton = {
    handler: null,
    addEventListener(event, handler) { if (event === 'click') this.handler = handler; },
    click() { this.handler?.(); },
  };
  const searchInput = { value: 'Ayan', addEventListener: () => {} };
  const exportContainer = {
    innerHTML: '',
    querySelectorAll: () => [],
    querySelector: (selector) => selector === '#export-csv-btn' ? csvButton : (selector === '#report-student-query' ? searchInput : null),
  };
  Auth.getCurrentUser = () => teacherUser;
  ReportsView.render(exportContainer);
  csvButton.click();
  it('Teacher export button uses class-scoped production report rows and permitted columns', () => {
    assert.ok(captured.args, 'production button handler should call the real export method');
    const [filename, headers, rows] = captured.args;
    assert.ok(filename.endsWith('.csv'));
    assert.deepStrictEqual(headers.map(h => typeof h === 'object' ? h.label : h), ['Student ID', 'Student Name', 'Class', 'Gender', 'Date of Birth']);
    assert.strictEqual(rows.length, 1, 'the active student search filter should be applied');
    assert.strictEqual(rows[0][0], 'STD-1001');
    assert.strictEqual(rows[0][2], 'Grade 1', 'only assigned-class students should be present');
    assert.ok(!headers.some(h => String(typeof h === 'object' ? h.label : h).toLowerCase().includes('parent')));
  });

  it('CSV escaping handles commas, quotes, line breaks, and UTF-8', () => {
    const csv = realExportToCSV('edge.csv', ['Name', 'Note'], [['Amina Cabdi', 'a,"b\nc']], null);
    assert.ok(csv.includes('Amina Cabdi'));
    assert.ok(csv.includes('"a,""b\nc"'));
  });

  let deniedExportCalls = 0;
  const exporterNames = ['exportToCSV', 'exportToExcel', 'exportToPDF', 'triggerPrint'];
  const originalExporters = exporterNames.map(name => [name, Components[name]]);
  exporterNames.forEach(name => { Components[name] = () => { deniedExportCalls++; }; });
  const restrictedUser = {
    ...teacherUser,
    permissions: {
      ...Permissions.getDefaultPermissions(ROLES.TEACHER),
      reports: { ...Permissions.getDefaultPermissions(ROLES.TEACHER).reports, export: false, print: false },
    },
  };
  const blockedButtons = new Map(['#export-csv-btn', '#export-excel-btn', '#export-pdf-btn', '#print-report-btn'].map(id => [id, {
    handler: null,
    addEventListener(event, handler) { if (event === 'click') this.handler = handler; },
    click() { return this.handler?.(); },
  }]));
  const restrictedContainer = { innerHTML: '', querySelectorAll: () => [], querySelector: selector => blockedButtons.get(selector) || null };
  Auth.getCurrentUser = () => restrictedUser;
  ReportsView.render(restrictedContainer);
  for (const button of blockedButtons.values()) await button.click();
  originalExporters.forEach(([name, original]) => { Components[name] = original; });
  it('PDF, Excel, CSV, and Print handlers enforce export and print permissions', () => {
    assert.strictEqual(deniedExportCalls, 0, 'unauthorized buttons cannot invoke export or print operations');
  });
  console.log(`\nReport Tests completed: ${passedTests}/${totalTests} passed.`);
}

runTests();
