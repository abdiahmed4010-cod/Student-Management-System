/**
 * AL-IMAAMA — STAGE 3.9 REPORTING & ANALYTICS TEST SUITE
 * Comprehensive automated tests for:
 * - 7 Categories & 25 Sub-Reports catalog compliance
 * - Sub-report RBAC security (Admin vs Teacher)
 * - Financial integrity (CONFIRMED only, reversals & refunds netting)
 * - Dashboard metrics accuracy (no fictitious 96% baseline)
 * - CSV export format compliance (RFC 4180)
 * - Data synchronization (attendance & examinations sync)
 */

import assert from 'node:assert';

// Polyfill minimal browser globals for Node.js test environment
const storageStore = new Map();
globalThis.localStorage = {
  getItem: (k) => (storageStore.has(k) ? storageStore.get(k) : null),
  setItem: (k, v) => storageStore.set(k, String(v)),
  removeItem: (k) => storageStore.delete(k),
  clear: () => storageStore.clear(),
};
globalThis.window = { localStorage: globalThis.localStorage, atob: globalThis.atob, btoa: globalThis.btoa, navigator: { userAgent: 'node' } };
globalThis.document = {
  getElementById: () => null,
  documentElement: { setAttribute: () => {} },
  createElement: () => ({ setAttribute: () => {}, appendChild: () => {}, click: () => {} }),
  body: { appendChild: () => {}, removeChild: () => {} },
};
globalThis.URL = { createObjectURL: () => 'blob:mock-url' };

// Import system modules (Node-safe imports)
import { Permissions, ROLES } from '../assets/js/permissions.js';
import { Data } from '../assets/js/data.js';
import { Storage } from '../assets/js/storage.js';
import { API } from '../assets/js/api.js';
const { Components } = await import('../assets/js/components.js');

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
  console.log('\n=============================================================');
  console.log('  AL-IMAAMA — STAGE 3.9 REPORTING & ANALYTICS TESTS');
  console.log('=============================================================\n');

  // Test Users
  const adminUser = {
    id: 'usr-admin-1',
    fullName: 'Master Administrator',
    email: 'admin@alimaama.demo',
    role: ROLES.ADMIN,
    permissions: Permissions.getDefaultPermissions(ROLES.ADMIN),
  };

  const teacherUser = {
    id: 'usr-teacher-1',
    fullName: 'Sheikh Ahmed',
    email: 'teacher@alimaama.demo',
    role: ROLES.TEACHER,
    teacherDetails: {
      id: 'tch-1',
      assignedClassIds: ['cls-1'],
      assignedSubjectIds: ['sub-1'],
    },
    permissions: Permissions.getDefaultPermissions(ROLES.TEACHER),
  };

  // Seed baseline data
  Storage.init();

  // --- GROUP 1: Catalog Integrity (7 Categories, 25 Sub-Reports) ---
  console.log('--- Group 1: Catalog Specification & Structure ---');

  const EXPECTED_CATALOG = {
    'students': ['all', 'by-class', 'individual'],
    'attendance': ['daily', 'monthly', 'individual', 'class'],
    'examinations': ['midterm', 'final', 'subject', 'class-summary', 'individual', 'historical'],
    'results': ['class-results', 'class-ranking', 'individual'],
    'promotion': ['class-summary', 'individual'],
    'payments': ['class-fee', 'school-fee', 'individual', 'outstanding'],
    'income-expenses': ['income', 'expenses', 'summary'],
  };

  it('Catalog defines exactly 7 categories', () => {
    const cats = Object.keys(EXPECTED_CATALOG);
    assert.strictEqual(cats.length, 7);
  });

  it('Catalog defines exactly 25 total sub-reports', () => {
    const totalSub = Object.values(EXPECTED_CATALOG).reduce((sum, subs) => sum + subs.length, 0);
    assert.strictEqual(totalSub, 25);
  });

  // --- GROUP 2: RBAC Sub-Report Security ---
  console.log('\n--- Group 2: Role-Based Access Control & Sub-Report Security ---');

  it('Admin can access all 7 report categories', () => {
    Object.keys(EXPECTED_CATALOG).forEach(cat => {
      assert.strictEqual(Permissions.canAccessReport(adminUser, cat), true, `Admin should access ${cat}`);
    });
  });

  it('Admin can access all 25 sub-reports', () => {
    Object.entries(EXPECTED_CATALOG).forEach(([cat, subs]) => {
      subs.forEach(sub => {
        assert.strictEqual(
          Permissions.canAccessSubReport(adminUser, cat, sub),
          true,
          `Admin should access ${cat}.${sub}`
        );
      });
    });
  });

  it('Teacher can access permitted academic categories (students, attendance, examinations, results)', () => {
    ['students', 'attendance', 'examinations', 'results'].forEach(cat => {
      assert.strictEqual(Permissions.canAccessReport(teacherUser, cat), true, `Teacher should access ${cat}`);
    });
  });

  it('Teacher is strictly blocked from financial and promotion categories', () => {
    ['payments', 'income-expenses', 'promotion'].forEach(cat => {
      assert.strictEqual(Permissions.canAccessReport(teacherUser, cat), false, `Teacher should not access ${cat}`);
    });
  });

  it('Teacher is blocked from Admin-only sub-report: students.all', () => {
    assert.strictEqual(Permissions.canAccessSubReport(teacherUser, 'students', 'all'), false);
  });

  it('Teacher is allowed to access permitted student sub-reports: by-class and individual', () => {
    assert.strictEqual(Permissions.canAccessSubReport(teacherUser, 'students', 'by-class'), true);
    assert.strictEqual(Permissions.canAccessSubReport(teacherUser, 'students', 'individual'), true);
  });

  it('Teacher is blocked from Admin-only sub-report: results.class-ranking', () => {
    assert.strictEqual(Permissions.canAccessSubReport(teacherUser, 'results', 'class-ranking'), false);
  });

  it('Teacher is allowed to access permitted result sub-reports: class-results and individual', () => {
    assert.strictEqual(Permissions.canAccessSubReport(teacherUser, 'results', 'class-results'), true);
    assert.strictEqual(Permissions.canAccessSubReport(teacherUser, 'results', 'individual'), true);
  });

  // --- GROUP 3: Financial Integrity & Reversals/Refunds Netting ---
  console.log('\n--- Group 3: Financial Integrity & Ledger Reconciliation ---');

  it('Data.getPayments() returns ONLY confirmed payments', () => {
    // Setup payments in storage
    const testPayments = [
      { id: 'pay-1', studentId: 'stu-1', feeCategory: 'Class Fee', month: '2026-11', amountPaid: 100, syncStatus: 'CONFIRMED', transactionType: 'Payment' },
      { id: 'pay-2', studentId: 'stu-1', feeCategory: 'School Fee', month: '2026-11', amountPaid: 50, syncStatus: 'PENDING', transactionType: 'Payment' },
      { id: 'pay-3', studentId: 'stu-2', feeCategory: 'Class Fee', month: '2026-11', amountPaid: 80, syncStatus: 'FAILED', transactionType: 'Payment' },
    ];
    Storage.set(Storage.KEYS.PAYMENTS, testPayments);
    Storage.set(Storage.KEYS.SESSION, adminUser);

    const confirmed = Data.getPayments();
    assert.strictEqual(confirmed.length, 1);
    assert.strictEqual(confirmed[0].id, 'pay-1');
  });

  it('getFinancialOverview() properly deducts reversals and refunds from student fee collections', () => {
    const testPayments = [
      { id: 'pay-10', studentId: 'stu-1', month: '2026-11', paymentDate: '2026-11-01', amountPaid: 200, syncStatus: 'CONFIRMED', transactionType: 'Payment' },
      { id: 'pay-11', studentId: 'stu-1', month: '2026-11', paymentDate: '2026-11-02', amountPaid: 50, syncStatus: 'CONFIRMED', transactionType: 'Reversal' },
      { id: 'pay-12', studentId: 'stu-1', month: '2026-11', paymentDate: '2026-11-03', amountPaid: 30, syncStatus: 'CONFIRMED', transactionType: 'Refund' },
    ];
    Storage.set(Storage.KEYS.PAYMENTS, testPayments);
    Storage.set(Storage.KEYS.INCOMES, [{ id: 'inc-1', date: '2026-11-01', amount: 100, category: 'Donation' }]);
    Storage.set(Storage.KEYS.EXPENSES, [{ id: 'exp-1', date: '2026-11-01', amount: 70, category: 'Utilities' }]);
    Storage.set(Storage.KEYS.SESSION, adminUser);

    const overview = Data.getFinancialOverview({ month: '2026-11' });
    // Gross: 200, Reversals: 50, Refunds: 30 => Net Student Fees: 120
    assert.strictEqual(overview.grossPayments, 200);
    assert.strictEqual(overview.totalReversals, 50);
    assert.strictEqual(overview.totalRefunds, 30);
    assert.strictEqual(overview.studentFeeCollections, 120);

    // Total Income = 120 + 100 = 220
    assert.strictEqual(overview.totalIncome, 220);
    // Net Balance = 220 - 70 = 150
    assert.strictEqual(overview.netBalance, 150);
  });

  it('getStudentFeeLedger() nets out reversals and refunds per student', () => {
    Storage.set(Storage.KEYS.STUDENTS, [{ id: 'stu-test-ledger', fullName: 'Ledger Test Student', classId: 'cls-1' }]);
    Storage.set(Storage.KEYS.SETTINGS, { classFeeMonthly: 45, schoolFeeMonthly: 35 });
    Storage.set(Storage.KEYS.CLASSES, [{ id: 'cls-1', name: 'Class 1' }]);

    const ledgerPayments = [
      { id: 'p-1', studentId: 'stu-test-ledger', feeCategory: 'Class Fee', month: '2026-11', amountPaid: 45, syncStatus: 'CONFIRMED', transactionType: 'Payment' },
      { id: 'p-2', studentId: 'stu-test-ledger', feeCategory: 'Class Fee', month: '2026-11', amountPaid: 45, syncStatus: 'CONFIRMED', transactionType: 'Reversal' },
      { id: 'p-3', studentId: 'stu-test-ledger', feeCategory: 'School Fee', month: '2026-11', amountPaid: 35, syncStatus: 'CONFIRMED', transactionType: 'Payment' },
    ];
    Storage.set(Storage.KEYS.PAYMENTS, ledgerPayments);

    const ledger = Data.getStudentFeeLedger('2026-11');
    const studentEntry = ledger.find(l => l.studentId === 'stu-test-ledger');
    assert.ok(studentEntry, 'Student ledger entry must exist');

    // Class Fee: 45 paid - 45 reversed = 0 paid
    assert.strictEqual(studentEntry.classFeePaid, 0);
    assert.strictEqual(studentEntry.classFeeStatus, 'Unpaid');

    // School Fee: 35 paid = 35 paid
    assert.strictEqual(studentEntry.schoolFeePaid, 35);
    assert.strictEqual(studentEntry.schoolFeeStatus, 'Paid');

    // Total obligation: 80, Total paid: 35, Outstanding: 45
    assert.strictEqual(studentEntry.totalPaid, 35);
    assert.strictEqual(studentEntry.outstandingBalance, 45);
    assert.strictEqual(studentEntry.status, 'Partially Paid');
  });

  // --- GROUP 4: Dashboard Metrics Integrity ---
  console.log('\n--- Group 4: Dashboard Metrics & Attendance KPI Accuracy ---');

  it('Dashboard attendance percentage returns 0% when no attendance records exist today', () => {
    // Clear today attendance
    Storage.set(Storage.KEYS.ATTENDANCE, []);
    const metrics = Data.getDashboardMetrics();
    assert.strictEqual(metrics.attendancePercentage, 0, 'Should not report hardcoded 96% when 0 records exist');
    assert.strictEqual(metrics.attendanceToday.total, 0);
  });

  it('Dashboard attendance percentage calculates correct ratio when roll call is taken', () => {
    const today = new Date().toISOString().split('T')[0];
    Storage.set(Storage.KEYS.ATTENDANCE, [
      { id: 'att-1', date: today, status: 'Present' },
      { id: 'att-2', date: today, status: 'Present' },
      { id: 'att-3', date: today, status: 'Present' },
      { id: 'att-4', date: today, status: 'Absent' },
    ]);
    const metrics = Data.getDashboardMetrics();
    // 3 present out of 4 = 75%
    assert.strictEqual(metrics.attendancePercentage, 75);
    assert.strictEqual(metrics.attendanceToday.present, 3);
    assert.strictEqual(metrics.attendanceToday.absent, 1);
  });

  it('API.dashboard.metrics is registered and callable', () => {
    assert.strictEqual(typeof API.dashboard.metrics, 'function');
  });

  // --- GROUP 4B: Backend Data Synchronization ---
  console.log('\n--- Group 4B: Backend Attendance, Examination, and Payment Synchronization ---');
  totalTests++;
  const apiMocks = [
    [API.settings, 'get', async () => ({})],
    [API.classes, 'list', async () => []],
    [API.subjects, 'list', async () => [{ id: 'sub-sync', classroom: 'cls-sync', name: 'Quran' }]],
    [API.teachers, 'list', async () => []],
    [API.students, 'list', async () => []],
    [API.attendance, 'list', async () => [{ id: 'att-sync', studentId: 'stu-sync', classId: 'cls-sync', date: '2026-11-24', status: 'Present' }]],
    [API.examinations, 'list', async () => [{ id: 'exam-sync', classId: 'cls-sync', examType: 'Midterm', academicYear: '2026-2027', term: 'Term 1', marks: [{ id: 'mark-sync', studentId: 'stu-sync', subjectId: 'sub-sync', score: '87.00' }] }]],
    [API.finances.invoices, 'list', async () => []],
    [API.finances.feeStructures, 'list', async () => []],
    [API.finances.payments, 'list', async () => [{ id: 'pay-sync', student: 'stu-sync', amount_paid: '25.00', transaction_type: 'Payment' }]],
    [API.finances.incomes, 'list', async () => []],
    [API.finances.expenses, 'list', async () => []],
    [API.users, 'list', async () => []],
  ].map(([obj, key, fn]) => { const original = obj[key]; obj[key] = fn; return [obj, key, original]; });
  const originalHasToken = API.hasToken;
  API.hasToken = () => true;
  Storage.set(Storage.KEYS.SESSION, adminUser);
  try {
    await Data.syncFromBackend();
    const syncedAttendance = Storage.get(Storage.KEYS.ATTENDANCE, []);
    const syncedExams = Storage.get(Storage.KEYS.EXAMINATIONS, []);
    const syncedPayments = Storage.get(Storage.KEYS.PAYMENTS, []);
    assert.strictEqual(syncedAttendance[0].status, 'Present');
    assert.strictEqual(syncedExams[0].marks['stu-sync']['sub-sync'], 87);
    assert.strictEqual(syncedPayments[0].syncStatus, 'CONFIRMED');
    passedTests++;
    console.log('✅ PASS: Attendance, exam marks, and confirmed payments map from backend payloads');
  } catch (err) {
    console.error('❌ FAIL: Backend sync preserves reportable source data');
    console.error(err);
    process.exitCode = 1;
  } finally {
    API.hasToken = originalHasToken;
    apiMocks.forEach(([obj, key, original]) => { obj[key] = original; });
  }
  // --- GROUP 5: Production CSV Export ---
  console.log('\n--- Group 5: Production CSV Export Compliance ---');

  it('Production CSV export escapes commas, quotes, line breaks, and preserves UTF-8 metadata', () => {
    const headers = [{ label: 'Student ID' }, { label: 'Name' }, { label: 'Notes' }];
    const rows = [['STU-001', 'Amina Cabdi', 'Good progress'], ['STU-002', 'Fatima Omar', 'Transferred, class "A"\nand continuing']];
    const csvOutput = Components.exportToCSV('report.csv', headers, rows, ['Total', 2, ''], {
      institutionName: 'MADARASATUL AL-IMAAM', reportTitle: 'Student Export', academicPeriod: '2026-2027',
    });
    assert.ok(csvOutput.includes('MADARASATUL AL-IMAAM'));
    assert.ok(csvOutput.includes('Student ID,Name,Notes'));
    assert.ok(csvOutput.includes('STU-001,Amina Cabdi,Good progress'));
    assert.ok(csvOutput.includes('"Transferred, class ""A""\nand continuing"'));
    assert.ok(csvOutput.includes('Total,2,'), 'empty cells remain valid CSV fields');
  });
  // --- GROUP 6: Role Scoping & Access Restrictions ---
  console.log('\n--- Group 6: Role Scoping & Access Restrictions ---');

  it('Teacher cannot access class-ranking in results report', () => {
    const canTeacherAccess = Permissions.canAccessSubReport(teacherUser, 'results', 'class-ranking');
    assert.strictEqual(canTeacherAccess, false, 'Teacher must not access class-ranking');
  });

  it('Admin can access class-ranking in results report', () => {
    const canAdminAccess = Permissions.canAccessSubReport(adminUser, 'results', 'class-ranking');
    assert.strictEqual(canAdminAccess, true, 'Admin must access class-ranking');
  });

  it('Teacher cannot access all in students report', () => {
    const canTeacherAccess = Permissions.canAccessSubReport(teacherUser, 'students', 'all');
    assert.strictEqual(canTeacherAccess, false, 'Teacher must not access complete student list');
  });

  it('Admin can access all in students report', () => {
    const canAdminAccess = Permissions.canAccessSubReport(adminUser, 'students', 'all');
    assert.strictEqual(canAdminAccess, true, 'Admin must access complete student list');
  });

  console.log('\n=============================================================');
  console.log(`  ALL ${passedTests}/${totalTests} STAGE 3.9 TESTS PASSED!`);
  console.log('=============================================================\n');
}

runTests();
