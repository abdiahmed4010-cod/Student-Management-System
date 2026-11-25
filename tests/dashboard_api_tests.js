// Dashboard API client tests
// Polyfill minimal browser globals for Node.js test environment
const storageStore = new Map();
globalThis.localStorage = {
  getItem: (k) => (storageStore.has(k) ? storageStore.get(k) : null),
  setItem: (k, v) => storageStore.set(k, String(v)),
  removeItem: (k) => storageStore.delete(k),
  clear: () => storageStore.clear(),
};
globalThis.window = { localStorage: globalThis.localStorage, location: { hash: '#dashboard' }, atob: globalThis.atob, btoa: globalThis.btoa, navigator: { userAgent: 'node' } };
globalThis.document = { documentElement: { setAttribute: () => {} }, getElementById: () => null };

import assert from 'node:assert';
import { API, ApiClient, ApiError } from '../assets/js/api.js';
const { DashboardView } = await import('../assets/js/dashboard.js');
const { Auth } = await import('../assets/js/auth.js');
const { Storage } = await import('../assets/js/storage.js');

let totalTests = 0;
let passedTests = 0;
async function it(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`✅ PASS: ${name}`);
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function runTests() {
  console.log('\n=== Dashboard API Tests ===');

  // Mock token for auth
  localStorage.setItem('alimaama_access_token', 'mock-access-token');
  localStorage.setItem('alimaama_refresh_token', 'mock-refresh-token');

  // Capture endpoint used by ApiClient.get
  let capturedEndpoint = null;
  const originalGet = ApiClient.get;
  ApiClient.get = (endpoint, params = {}, options = {}) => {
    capturedEndpoint = endpoint;
    // Simulate a successful JSON response
    return Promise.resolve({ metrics: { students: 10, classes: 3 } });
  };

  await it('API.dashboard.metrics calls correct endpoint', async () => {
    const data = await API.dashboard.metrics();
    assert.strictEqual(capturedEndpoint, '/dashboard/metrics/');
    assert.deepStrictEqual(data, { metrics: { students: 10, classes: 3 } });
  });

  // Test error propagation
  ApiClient.get = () => {
    throw new ApiError('Unauthorized', 401, { detail: 'Invalid token' });
  };

  await it('API.dashboard.metrics propagates ApiError', async () => {
    let thrown = false;
    try {
      await API.dashboard.metrics();
    } catch (e) {
      thrown = true;
      assert(e instanceof ApiError);
      assert.strictEqual(e.status, 401);
    }
    assert.strictEqual(thrown, true, 'Expected ApiError to be thrown');
  });

  // The dashboard must render backend metrics rather than the local fallback calculation.
  Storage.init();
  const payload = {
    totalStudents: 23, totalTeachers: 4, totalClasses: 2, attendancePercentage: 77,
    attendanceToday: { present: 10, absent: 2, excused: 1, total: 13 },
    monthlyFeesCollected: 125.5, outstandingFees: 80, totalFeeObligation: 205.5,
    classDistribution: [], recentStudents: [], recentTransactions: [],
  };
  Auth.getCurrentUser = () => ({ id: 'admin-metrics', role: 'ADMIN', fullName: 'Admin', email: 'admin@test' });
  ApiClient.get = (endpoint) => {
    capturedEndpoint = endpoint;
    return Promise.resolve(payload);
  };
  const dashboardContainer = {
    innerHTML: '',
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  await it('DashboardView renders server metrics from the dashboard API', async () => {
    DashboardView.render(dashboardContainer);
    await new Promise(resolve => setImmediate(resolve));
    assert.strictEqual(capturedEndpoint, '/dashboard/metrics/');
    assert.ok(dashboardContainer.innerHTML.includes('125.50'), `backend reconciled collection appears in the dashboard: ${dashboardContainer.innerHTML.slice(0, 250)}`);
    assert.ok(dashboardContainer.innerHTML.includes('77%'), 'backend attendance KPI appears in the dashboard');
  });

  // Restore original method
  ApiClient.get = originalGet;

  console.log(`\nDashboard API Tests completed: ${passedTests}/${totalTests} passed.`);
}

runTests();
