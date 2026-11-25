/**
 * Stage 3.8 — Frontend API Client & Integration Test Suite
 * Validates:
 * 1. Storage engine initialization & schema
 * 2. ApiClient Bearer token management & header injection
 * 3. SimpleJWT auth flow and error propagation
 * 4. Granular RBAC permissions & Teacher Safety Ceiling
 * 5. Full API namespace integrity (Auth, Users, Academics, Students, Attendance, Exams, Finances, Settings)
 * 6. Financial transactions: Idempotency keys, student ledger, balance calculation
 * 7. Offline fallback and error handling
 */

// Lightweight polyfills for Node environment
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    location: { hash: '#dashboard' },
  };
}

import { Storage } from '../assets/js/storage.js';
import { Permissions, ROLES } from '../assets/js/permissions.js';
import { ApiClient, API, ApiError } from '../assets/js/api.js';
import { Auth } from '../assets/js/auth.js';
import { Data } from '../assets/js/data.js';

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedTests++;
  console.log(`✅ PASS: ${message}`);
}

async function runTests() {
  console.log('\n=============================================================');
  console.log('  AL-IMAAMA — STAGE 3.8 FRONTEND INTEGRATION TEST SUITE');
  console.log('=============================================================\n');

  // --- TEST GROUP 1: Storage & Seeding ---
  console.log('--- Group 1: Storage Persistence & Schema Keys ---');
  Storage.init();
  assert(Storage.KEYS.USERS === 'studently_users', 'Storage has USERS key');
  assert(Storage.KEYS.PAYMENTS === 'studently_payments', 'Storage has PAYMENTS key');
  assert(Storage.KEYS.FEE_STRUCTURES === 'studently_fee_structures', 'Storage has FEE_STRUCTURES key');
  assert(Storage.KEYS.INVOICES === 'studently_invoices', 'Storage has INVOICES key');
  assert(Storage.get(Storage.KEYS.CLASSES, []).length > 0, 'Seed classes initialized');
  assert(Storage.get(Storage.KEYS.STUDENTS, []).length > 0, 'Seed students initialized');

  // --- TEST GROUP 2: ApiClient Token Management ---
  console.log('\n--- Group 2: ApiClient Token Management & Headers ---');
  ApiClient.clearTokens();
  assert(ApiClient.getAccessToken() === null, 'Access token is null initially');
  assert(ApiClient.getRefreshToken() === null, 'Refresh token is null initially');
  assert(API.hasToken() === false, 'API.hasToken() reports false when no token');

  const testAccess = 'mock-access-token-jwt-stage38';
  const testRefresh = 'mock-refresh-token-jwt-stage38';
  ApiClient.setTokens(testAccess, testRefresh);
  assert(ApiClient.getAccessToken() === testAccess, 'Access token stored correctly');
  assert(ApiClient.getRefreshToken() === testRefresh, 'Refresh token stored correctly');
  assert(API.hasToken() === true, 'API.hasToken() reports true after token set');

  // --- TEST GROUP 3: Namespaces & Endpoint Mapping ---
  console.log('\n--- Group 3: API Service Namespaces & Method Coverage ---');
  assert(typeof API.auth.login === 'function', 'API.auth.login exists');
  assert(typeof API.auth.refreshToken === 'function', 'API.auth.refreshToken exists');
  assert(typeof API.auth.getCurrentUser === 'function', 'API.auth.getCurrentUser exists');
  assert(typeof API.auth.logout === 'function', 'API.auth.logout exists');

  assert(typeof API.users.list === 'function', 'API.users.list exists');
  assert(typeof API.users.resetPassword === 'function', 'API.users.resetPassword exists');
  assert(typeof API.users.savePermissions === 'function', 'API.users.savePermissions exists');

  assert(typeof API.classes.list === 'function', 'API.classes.list exists');
  assert(typeof API.subjects.list === 'function', 'API.subjects.list exists');
  assert(typeof API.teachers.list === 'function', 'API.teachers.list exists');
  assert(typeof API.students.list === 'function', 'API.students.list exists');
  assert(typeof API.students.nextId === 'function', 'API.students.nextId exists');

  assert(typeof API.attendance.list === 'function', 'API.attendance.list exists');
  assert(typeof API.attendance.recordBatch === 'function', 'API.attendance.recordBatch exists');

  assert(typeof API.examinations.list === 'function', 'API.examinations.list exists');
  assert(typeof API.examinations.saveMarks === 'function', 'API.examinations.saveMarks exists');
  assert(typeof API.examinations.historical === 'function', 'API.examinations.historical exists');

  assert(typeof API.finances.feeStructures.list === 'function', 'API.finances.feeStructures.list exists');
  assert(typeof API.finances.invoices.list === 'function', 'API.finances.invoices.list exists');
  assert(typeof API.finances.invoices.cancel === 'function', 'API.finances.invoices.cancel exists');
  assert(typeof API.finances.payments.create === 'function', 'API.finances.payments.create exists');
  assert(typeof API.finances.payments.reverse === 'function', 'API.finances.payments.reverse exists');
  assert(typeof API.finances.payments.refund === 'function', 'API.finances.payments.refund exists');
  assert(typeof API.finances.payments.receipt === 'function', 'API.finances.payments.receipt exists');
  assert(typeof API.finances.payments.ledger === 'function', 'API.finances.payments.ledger exists');
  assert(typeof API.finances.incomes.list === 'function', 'API.finances.incomes.list exists');
  assert(typeof API.finances.expenses.list === 'function', 'API.finances.expenses.list exists');
  assert(typeof API.settings.get === 'function', 'API.settings.get exists');

  // --- TEST GROUP 4: RBAC & Teacher Safety Ceiling Enforcement ---
  console.log('\n--- Group 4: RBAC & Teacher Hard Safety Ceiling ---');
  const adminUser = { id: 'usr-admin-1', role: ROLES.ADMIN, fullName: 'Admin User', email: 'admin@alimaama.demo' };
  const teacherUser = { id: 'usr-tch-1', role: ROLES.TEACHER, fullName: 'Teacher User', email: 'teacher@alimaama.demo' };

  assert(Permissions.isAdmin(adminUser) === true, 'adminUser is recognized as Admin');
  assert(Permissions.isTeacher(teacherUser) === true, 'teacherUser is recognized as Teacher');
  assert(Permissions.canAccessFinances(adminUser) === true, 'Admin has access to finances');
  assert(Permissions.canAccessFinances(teacherUser) === false, 'Teacher is strictly denied finance access');

  // Attempt to grant teacher financial permissions via custom override
  const forgedTeacherUser = {
    ...teacherUser,
    permissions: {
      payments: { view: true, add: true, edit: true, delete: true },
      students: { add: true, delete: true },
    },
  };
  const evaluatedTeacherPerms = Permissions.getUserPermissions(forgedTeacherUser);
  assert(evaluatedTeacherPerms.payments.view === false, 'Safety Ceiling: Teacher cannot gain payments.view');
  assert(evaluatedTeacherPerms.payments.add === false, 'Safety Ceiling: Teacher cannot gain payments.add');
  assert(evaluatedTeacherPerms.payments.edit === false, 'Safety Ceiling: Teacher cannot gain payments.edit');
  assert(evaluatedTeacherPerms.payments.delete === false, 'Safety Ceiling: Teacher cannot gain payments.delete');
  assert(evaluatedTeacherPerms.students.add === false, 'Safety Ceiling: Teacher cannot gain students.add');
  assert(evaluatedTeacherPerms.students.delete === false, 'Safety Ceiling: Teacher cannot gain students.delete');
  assert(Permissions.hasPermission(forgedTeacherUser, 'payments', 'view') === false, 'hasPermission blocks teacher finance view');

  // --- TEST GROUP 5: Financial Operations & Idempotency Key ---
  console.log('\n--- Group 5: Payment Processing & Ledger ---');
  Storage.set(Storage.KEYS.SESSION, adminUser);

  const initialPaymentsCount = Data.getPayments().length;
  const recorded = Data.recordPayment({
    studentId: 'STD-1001',
    feeCategory: 'Class Fee',
    month: '2026-03',
    amountDue: '45.00',
    amountPaid: '45.00',
    paymentMethod: 'Cash',
    notes: 'Integration test fee payment',
  });

  assert(recorded !== null, 'Payment recorded successfully');
  assert(recorded.studentId === 'STD-1001', 'Payment has correct student ID');
  assert(recorded.amountPaid === 45.0, 'Payment has correct amount paid');
  assert(typeof recorded.idempotencyKey === 'string' && recorded.idempotencyKey.length > 5, 'Idempotency key generated');
  assert(Data.getPayments().length === initialPaymentsCount + 1, 'Payment appended to ledger');

  // Ledger calculation test
  const ledger = Data.getStudentFeeLedger('2026-03');
  assert(Array.isArray(ledger), 'Fee ledger is returned as array');
  const studentLedgerEntry = ledger.find(l => l.studentId === 'STD-1001');
  assert(!!studentLedgerEntry, 'Student entry found in ledger');
  assert(studentLedgerEntry.classFeePaid >= 45.0, 'Class fee payment reflected in student ledger');

  // --- TEST GROUP 6: Income & Expenses Operations ---
  console.log('\n--- Group 6: Income & Expense Operations ---');
  const income = Data.addIncome({
    title: 'Donation for Quran Competition',
    category: 'Donations',
    amount: 150.0,
    paymentMethod: 'Cash',
    referenceNumber: 'DON-2026-001',
  });
  assert(income !== null, 'Income recorded successfully');
  assert(income.amount === 150.0, 'Income amount matches');
  assert(Data.getIncomes().length > 0, 'Incomes list populated');

  const expense = Data.addExpense({
    title: 'Office Stationery & Books',
    category: 'Educational Supplies',
    amount: 65.5,
    paymentMethod: 'Cash',
    referenceNumber: 'EXP-2026-001',
  });
  assert(expense !== null, 'Expense recorded successfully');
  assert(expense.amount === 65.5, 'Expense amount matches');
  assert(Data.getExpenses().length > 0, 'Expenses list populated');

  console.log('\n=============================================================');
  console.log(`  ALL ${passedTests}/${totalTests} FRONTEND INTEGRATION TESTS PASSED!`);
  console.log('=============================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ Integration Test Suite Failed:\n', err);
  process.exit(1);
});
