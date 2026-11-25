/**
 * AL-IMAAMA — Stage 3.8 Payment Sync Engine: HTTP 409 Remediation Tests
 *
 * Validates that the HTTP 409 handler in PaymentSyncEngine:
 *  - Only marks a payment CONFIRMED when the backend returns a full, verified
 *    matching payment record with receipt_number and id.
 *  - Marks FAILED for empty, malformed, missing-field, or mismatched 409 responses.
 *  - Never downgrades an already-CONFIRMED payment.
 *  - Only CONFIRMED payments affect the financial ledger (getConfirmedPayments).
 *
 * Uses the same custom assert framework as frontend_api_integration.js.
 */

// ─── Node environment polyfills ──────────────────────────────────────────────
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

// ─── Mock API module ────────────────────────────────────────────────────────
// We need to intercept API.finances.payments.create since PaymentSyncEngine
// imports { API } from './api.js'. We dynamically patch it after import.
import { API } from '../assets/js/api.js';
import { PaymentSyncEngine, PAYMENT_SYNC_STATUS } from '../assets/js/payment_sync.js';

let passedTests = 0;
let failedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    failedTests++;
    console.error(`❌ FAIL: ${message}`);
    return false;
  }
  passedTests++;
  console.log(`✅ PASS: ${message}`);
  return true;
}

function resetPayments() {
  Storage.set(Storage.KEYS.PAYMENTS, []);
}

// ─── Standard test payment data ──────────────────────────────────────────────
function makeLocalPayment(overrides = {}) {
  return {
    id: `pay-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    studentId: 'STD-409',
    invoiceId: 'INV-409',
    feeCategory: 'Tuition',
    month: '2026-11',
    amountDue: 100,
    amountPaid: 100,
    paymentMethod: 'Cash',
    paymentDate: '2026-11-23',
    transactionRef: 'TXN-409-001',
    recordedBy: 'Administrator',
    notes: '',
    idempotencyKey: `idem-409-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    syncStatus: PAYMENT_SYNC_STATUS.PENDING,
    syncError: null,
    receiptNumber: null,
    backendId: null,
    createdAt: new Date().toISOString(),
    confirmedAt: null,
    ...overrides,
  };
}

// Full matching backend 409 response
function makeMatchingBackendData(localRecord) {
  return {
    id: 42,
    receipt_number: 'RCPT-BACKEND-409',
    student_id: localRecord.studentId,
    invoice_id: localRecord.invoiceId,
    fee_category: localRecord.feeCategory,
    month: localRecord.month,
    amount: localRecord.amountPaid,
    payment_method: localRecord.paymentMethod,
    transaction_ref: localRecord.transactionRef,
    idempotency_key: localRecord.idempotencyKey,
    amount_paid: localRecord.amountPaid,
  };
}

function make409Error(data) {
  const err = new Error('Conflict');
  err.status = 409;
  err.data = data;
  return err;
}

// ─── Save original API method and replace with mock ──────────────────────────
const originalCreate = API.finances.payments.create;
let mockCreateBehavior = null;

function mockApiCreate(behavior) {
  mockCreateBehavior = behavior;
  API.finances.payments.create = async (...args) => {
    if (typeof mockCreateBehavior === 'function') {
      return mockCreateBehavior(...args);
    }
    throw new Error('mockCreateBehavior not set');
  };
}

function restoreApiCreate() {
  API.finances.payments.create = originalCreate;
  mockCreateBehavior = null;
}

// Ensure API.hasToken() returns true for tests
const originalHasToken = API.hasToken;
API.hasToken = () => true;

// ─── Tests ──────────────────────────────────────────────────────────────────
async function runTests() {
  console.log('\n=============================================================');
  console.log('  AL-IMAAMA — HTTP 409 PAYMENT SYNC REMEDIATION TEST SUITE');
  console.log('=============================================================\n');

  Storage.init();

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: 409 with verified identical existing payment → CONFIRMED
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 1: 409 with verified identical existing payment → CONFIRMED ---');
  resetPayments();
  {
    const local = makeLocalPayment();
    Storage.set(Storage.KEYS.PAYMENTS, [local]);

    const backendData = makeMatchingBackendData(local);
    mockApiCreate(() => { throw make409Error(backendData); });

    const result = await PaymentSyncEngine._sendToBackend(local);
    assert(result.syncStatus === PAYMENT_SYNC_STATUS.CONFIRMED,
      '409 with matching payload → CONFIRMED');
    assert(result.receiptNumber === 'RCPT-BACKEND-409',
      'Receipt number comes from backend data');
    assert(result.backendId === 42,
      'Backend ID comes from backend data');
    assert(result.confirmedAt !== null,
      'confirmedAt timestamp is set');

    const stored = Storage.get(Storage.KEYS.PAYMENTS, []);
    assert(stored[0].syncStatus === PAYMENT_SYNC_STATUS.CONFIRMED,
      'Confirmed record persisted in storage');
  }
  restoreApiCreate();

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: 409 with conflicting payload (different amount) → FAILED
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 2: 409 with conflicting payload → FAILED ---');
  resetPayments();
  {
    const local = makeLocalPayment();
    Storage.set(Storage.KEYS.PAYMENTS, [local]);

    const backendData = makeMatchingBackendData(local);
    backendData.amount = 999; // Different amount!
    mockApiCreate(() => { throw make409Error(backendData); });

    try {
      await PaymentSyncEngine._sendToBackend(local);
      assert(false, 'Should have thrown for mismatched 409');
    } catch (err) {
      assert(err.status === 409, 'Error re-thrown is a 409');
    }

    const stored = Storage.get(Storage.KEYS.PAYMENTS, []);
    assert(stored[0].syncStatus === PAYMENT_SYNC_STATUS.FAILED,
      'Mismatched amount 409 → FAILED');
    assert(stored[0].receiptNumber === null,
      'No receipt number assigned for mismatched 409');
    assert(stored[0].backendId === null,
      'No backend ID assigned for mismatched 409');
  }
  restoreApiCreate();

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3: 409 with empty response → FAILED
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 3: 409 with empty response → FAILED ---');
  resetPayments();
  {
    const local = makeLocalPayment();
    Storage.set(Storage.KEYS.PAYMENTS, [local]);

    mockApiCreate(() => { throw make409Error({}); });

    try {
      await PaymentSyncEngine._sendToBackend(local);
      assert(false, 'Should have thrown for empty 409');
    } catch (err) {
      assert(err.status === 409, 'Error re-thrown for empty 409');
    }

    const stored = Storage.get(Storage.KEYS.PAYMENTS, []);
    assert(stored[0].syncStatus === PAYMENT_SYNC_STATUS.FAILED,
      'Empty 409 response → FAILED');
    assert(stored[0].receiptNumber === null,
      'No receipt from empty 409');
  }
  restoreApiCreate();

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 4: 409 with missing backend payment ID → FAILED
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 4: 409 with missing backend payment ID → FAILED ---');
  resetPayments();
  {
    const local = makeLocalPayment();
    Storage.set(Storage.KEYS.PAYMENTS, [local]);

    const backendData = makeMatchingBackendData(local);
    delete backendData.id; // No backend ID!
    mockApiCreate(() => { throw make409Error(backendData); });

    try {
      await PaymentSyncEngine._sendToBackend(local);
      assert(false, 'Should have thrown for 409 missing ID');
    } catch (err) {
      assert(err.status === 409, 'Error re-thrown for missing-ID 409');
    }

    const stored = Storage.get(Storage.KEYS.PAYMENTS, []);
    assert(stored[0].syncStatus === PAYMENT_SYNC_STATUS.FAILED,
      'Missing backend ID 409 → FAILED');
  }
  restoreApiCreate();

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 5: 409 with missing receipt number → FAILED
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 5: 409 with missing receipt number → FAILED ---');
  resetPayments();
  {
    const local = makeLocalPayment();
    Storage.set(Storage.KEYS.PAYMENTS, [local]);

    const backendData = makeMatchingBackendData(local);
    delete backendData.receipt_number; // No receipt!
    mockApiCreate(() => { throw make409Error(backendData); });

    try {
      await PaymentSyncEngine._sendToBackend(local);
      assert(false, 'Should have thrown for 409 missing receipt');
    } catch (err) {
      assert(err.status === 409, 'Error re-thrown for missing-receipt 409');
    }

    const stored = Storage.get(Storage.KEYS.PAYMENTS, []);
    assert(stored[0].syncStatus === PAYMENT_SYNC_STATUS.FAILED,
      'Missing receipt_number 409 → FAILED');
  }
  restoreApiCreate();

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 6: 409 with mismatched student ID → FAILED
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 6: 409 with mismatched student ID → FAILED ---');
  resetPayments();
  {
    const local = makeLocalPayment();
    Storage.set(Storage.KEYS.PAYMENTS, [local]);

    const backendData = makeMatchingBackendData(local);
    backendData.student_id = 'STD-WRONG'; // Wrong student!
    mockApiCreate(() => { throw make409Error(backendData); });

    try {
      await PaymentSyncEngine._sendToBackend(local);
      assert(false, 'Should have thrown for 409 wrong student');
    } catch (err) {
      assert(err.status === 409, 'Error re-thrown for wrong-student 409');
    }

    const stored = Storage.get(Storage.KEYS.PAYMENTS, []);
    assert(stored[0].syncStatus === PAYMENT_SYNC_STATUS.FAILED,
      'Mismatched student_id 409 → FAILED');
  }
  restoreApiCreate();

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 7: 409 with mismatched invoice ID → FAILED
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 7: 409 with mismatched invoice ID → FAILED ---');
  resetPayments();
  {
    const local = makeLocalPayment();
    Storage.set(Storage.KEYS.PAYMENTS, [local]);

    const backendData = makeMatchingBackendData(local);
    backendData.invoice_id = 'INV-WRONG'; // Wrong invoice!
    mockApiCreate(() => { throw make409Error(backendData); });

    try {
      await PaymentSyncEngine._sendToBackend(local);
      assert(false, 'Should have thrown for 409 wrong invoice');
    } catch (err) {
      assert(err.status === 409, 'Error re-thrown for wrong-invoice 409');
    }

    const stored = Storage.get(Storage.KEYS.PAYMENTS, []);
    assert(stored[0].syncStatus === PAYMENT_SYNC_STATUS.FAILED,
      'Mismatched invoice_id 409 → FAILED');
  }
  restoreApiCreate();

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 8: 409 with mismatched amount → FAILED
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 8: 409 with mismatched amount → FAILED ---');
  resetPayments();
  {
    const local = makeLocalPayment();
    Storage.set(Storage.KEYS.PAYMENTS, [local]);

    const backendData = makeMatchingBackendData(local);
    backendData.amount = 50; // Local was 100
    mockApiCreate(() => { throw make409Error(backendData); });

    try {
      await PaymentSyncEngine._sendToBackend(local);
      assert(false, 'Should have thrown for 409 wrong amount');
    } catch (err) {
      assert(err.status === 409, 'Error re-thrown for wrong-amount 409');
    }

    const stored = Storage.get(Storage.KEYS.PAYMENTS, []);
    assert(stored[0].syncStatus === PAYMENT_SYNC_STATUS.FAILED,
      'Mismatched amount 409 → FAILED');
  }
  restoreApiCreate();

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 9: 409 with mismatched payment method → FAILED
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 9: 409 with mismatched payment method → FAILED ---');
  resetPayments();
  {
    const local = makeLocalPayment();
    Storage.set(Storage.KEYS.PAYMENTS, [local]);

    const backendData = makeMatchingBackendData(local);
    backendData.payment_method = 'Mobile Money'; // Different method!
    mockApiCreate(() => { throw make409Error(backendData); });

    try {
      await PaymentSyncEngine._sendToBackend(local);
      assert(false, 'Should have thrown for 409 wrong method');
    } catch (err) {
      assert(err.status === 409, 'Error re-thrown for wrong-method 409');
    }

    const stored = Storage.get(Storage.KEYS.PAYMENTS, []);
    assert(stored[0].syncStatus === PAYMENT_SYNC_STATUS.FAILED,
      'Mismatched payment_method 409 → FAILED');
  }
  restoreApiCreate();

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 10: 409 with malformed JSON (data is a string) → FAILED
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 10: 409 with malformed JSON (data is string) → FAILED ---');
  resetPayments();
  {
    const local = makeLocalPayment();
    Storage.set(Storage.KEYS.PAYMENTS, [local]);

    mockApiCreate(() => { throw make409Error('not a valid json object'); });

    try {
      await PaymentSyncEngine._sendToBackend(local);
      assert(false, 'Should have thrown for malformed 409');
    } catch (err) {
      assert(err.status === 409, 'Error re-thrown for malformed 409');
    }

    const stored = Storage.get(Storage.KEYS.PAYMENTS, []);
    assert(stored[0].syncStatus === PAYMENT_SYNC_STATUS.FAILED,
      'Malformed (string) 409 response → FAILED');
  }
  restoreApiCreate();

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 11: 409 with null data → FAILED
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 11: 409 with null data → FAILED ---');
  resetPayments();
  {
    const local = makeLocalPayment();
    Storage.set(Storage.KEYS.PAYMENTS, [local]);

    mockApiCreate(() => { throw make409Error(null); });

    try {
      await PaymentSyncEngine._sendToBackend(local);
      assert(false, 'Should have thrown for null 409');
    } catch (err) {
      assert(err.status === 409, 'Error re-thrown for null 409');
    }

    const stored = Storage.get(Storage.KEYS.PAYMENTS, []);
    assert(stored[0].syncStatus === PAYMENT_SYNC_STATUS.FAILED,
      'Null 409 data → FAILED');
  }
  restoreApiCreate();

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 12: Successful 200/201 authoritative response → CONFIRMED
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 12: Successful 200/201 → CONFIRMED ---');
  resetPayments();
  {
    const local = makeLocalPayment();
    Storage.set(Storage.KEYS.PAYMENTS, [local]);

    const successResp = {
      id: 99,
      receipt_number: 'RCPT-SUCCESS-001',
      amount_paid: 100,
      transaction_ref: local.transactionRef,
      transaction_type: 'PAYMENT',
    };
    mockApiCreate(() => Promise.resolve(successResp));

    const result = await PaymentSyncEngine._sendToBackend(local);
    assert(result.syncStatus === PAYMENT_SYNC_STATUS.CONFIRMED,
      'Successful 201 → CONFIRMED');
    assert(result.receiptNumber === 'RCPT-SUCCESS-001',
      'Receipt from successful response');
    assert(result.backendId === 99,
      'Backend ID from successful response');
  }
  restoreApiCreate();

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 13: Confirmed payment cannot be downgraded by later retry
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 13: Confirmed payment cannot be downgraded ---');
  resetPayments();
  {
    // Pre-seed a CONFIRMED record
    const local = makeLocalPayment({
      syncStatus: PAYMENT_SYNC_STATUS.CONFIRMED,
      receiptNumber: 'RCPT-ORIGINAL',
      backendId: 77,
      confirmedAt: '2026-11-23T01:00:00Z',
    });
    Storage.set(Storage.KEYS.PAYMENTS, [local]);

    // Now simulate a 409 with EMPTY data (no match) — should NOT downgrade
    mockApiCreate(() => { throw make409Error({}); });

    const result = await PaymentSyncEngine._sendToBackend(local);
    // The guard should detect it's already confirmed and return it
    assert(result.syncStatus === PAYMENT_SYNC_STATUS.CONFIRMED,
      'Already-confirmed record stays CONFIRMED after empty 409');
    assert(result.receiptNumber === 'RCPT-ORIGINAL',
      'Original receipt preserved after retry');
    assert(result.backendId === 77,
      'Original backend ID preserved after retry');
  }
  restoreApiCreate();

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 14: Confirmed payment cannot be downgraded by mismatched 409
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 14: Confirmed payment not downgraded by mismatched 409 ---');
  resetPayments();
  {
    const local = makeLocalPayment({
      syncStatus: PAYMENT_SYNC_STATUS.CONFIRMED,
      receiptNumber: 'RCPT-SAFE',
      backendId: 88,
      confirmedAt: '2026-11-23T02:00:00Z',
    });
    Storage.set(Storage.KEYS.PAYMENTS, [local]);

    const backendData = makeMatchingBackendData(local);
    backendData.amount = 999; // Mismatched
    mockApiCreate(() => { throw make409Error(backendData); });

    const result = await PaymentSyncEngine._sendToBackend(local);
    assert(result.syncStatus === PAYMENT_SYNC_STATUS.CONFIRMED,
      'Confirmed payment survives mismatched 409 retry');
    assert(result.receiptNumber === 'RCPT-SAFE',
      'Receipt preserved through mismatched 409');

    const stored = Storage.get(Storage.KEYS.PAYMENTS, []);
    assert(stored[0].syncStatus === PAYMENT_SYNC_STATUS.CONFIRMED,
      'Storage still shows CONFIRMED after mismatched 409 retry');
  }
  restoreApiCreate();

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 15: Only CONFIRMED payments in getConfirmedPayments (ledger)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 15: Ledger excludes PENDING and FAILED ---');
  resetPayments();
  {
    const confirmed = makeLocalPayment({
      idempotencyKey: 'ledger-confirmed',
      syncStatus: PAYMENT_SYNC_STATUS.CONFIRMED,
      receiptNumber: 'RCPT-LED-1',
      backendId: 10,
    });
    const pending = makeLocalPayment({
      id: 'pay-pending-ledger',
      idempotencyKey: 'ledger-pending',
      syncStatus: PAYMENT_SYNC_STATUS.PENDING,
    });
    const failed = makeLocalPayment({
      id: 'pay-failed-ledger',
      idempotencyKey: 'ledger-failed',
      syncStatus: PAYMENT_SYNC_STATUS.FAILED,
      syncError: 'Conflict without matching payment',
    });
    Storage.set(Storage.KEYS.PAYMENTS, [confirmed, pending, failed]);

    const ledgerPayments = PaymentSyncEngine.getConfirmedPayments();
    assert(ledgerPayments.length === 1,
      'Ledger contains exactly 1 CONFIRMED payment');
    assert(ledgerPayments[0].idempotencyKey === 'ledger-confirmed',
      'Ledger contains only the confirmed payment');

    const allPayments = PaymentSyncEngine.getAllPayments();
    assert(allPayments.length === 3,
      'getAllPayments returns all 3 records');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 16: Unverified 409 does NOT put payment into getConfirmedPayments
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 16: Unverified 409 excluded from ledger ---');
  resetPayments();
  {
    const local = makeLocalPayment();
    Storage.set(Storage.KEYS.PAYMENTS, [local]);

    // 409 with empty data → should become FAILED
    mockApiCreate(() => { throw make409Error({}); });

    try {
      await PaymentSyncEngine._sendToBackend(local);
    } catch (_) { /* expected */ }

    const ledgerPayments = PaymentSyncEngine.getConfirmedPayments();
    assert(ledgerPayments.length === 0,
      'No unverified 409 payments in ledger');
  }
  restoreApiCreate();

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 17: 409 with matching idempotency_key but wrong transaction_ref → CONFIRMED
  // (identity match via idempotency_key is sufficient per OR condition)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 17: 409 matching via idempotency_key (different txn_ref) → CONFIRMED ---');
  resetPayments();
  {
    const local = makeLocalPayment();
    Storage.set(Storage.KEYS.PAYMENTS, [local]);

    const backendData = makeMatchingBackendData(local);
    backendData.transaction_ref = 'TXN-DIFFERENT'; // Different ref, but idempotency_key matches
    mockApiCreate(() => { throw make409Error(backendData); });

    const result = await PaymentSyncEngine._sendToBackend(local);
    assert(result.syncStatus === PAYMENT_SYNC_STATUS.CONFIRMED,
      '409 matching by idempotency_key (different txn_ref) → CONFIRMED');
  }
  restoreApiCreate();

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 18: Network failure stays PENDING
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 18: Network failure → PENDING ---');
  resetPayments();
  {
    const local = makeLocalPayment();
    Storage.set(Storage.KEYS.PAYMENTS, [local]);

    const networkErr = new TypeError('Failed to fetch');
    networkErr.status = 0;
    mockApiCreate(() => { throw networkErr; });

    try {
      await PaymentSyncEngine._sendToBackend(local);
      assert(false, 'Should have thrown for network error');
    } catch (err) {
      // Expected
    }

    const stored = Storage.get(Storage.KEYS.PAYMENTS, []);
    assert(stored[0].syncStatus === PAYMENT_SYNC_STATUS.PENDING,
      'Network failure leaves payment PENDING');
  }
  restoreApiCreate();

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 19: recoverPending retries PENDING and confirms with valid response
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 19: recoverPending confirms with valid backend response ---');
  resetPayments();
  {
    const local = makeLocalPayment();
    Storage.set(Storage.KEYS.PAYMENTS, [local]);

    mockApiCreate(() => Promise.resolve({
      id: 200,
      receipt_number: 'RCPT-RECOVER',
      amount_paid: 100,
      transaction_ref: local.transactionRef,
    }));

    const results = await PaymentSyncEngine.recoverPending();
    assert(results.length === 1, 'recoverPending found 1 pending payment');
    assert(results[0].status === PAYMENT_SYNC_STATUS.CONFIRMED,
      'recoverPending result reports CONFIRMED');

    const stored = Storage.get(Storage.KEYS.PAYMENTS, []);
    assert(stored[0].syncStatus === PAYMENT_SYNC_STATUS.CONFIRMED,
      'Recovered payment is now CONFIRMED in storage');
    assert(stored[0].receiptNumber === 'RCPT-RECOVER',
      'Recovered payment has backend receipt');
  }
  restoreApiCreate();

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 20: No receipt fabrication — FAILED 409 has null receipt
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 20: FAILED 409 never fabricates receipt number ---');
  resetPayments();
  {
    const local = makeLocalPayment();
    Storage.set(Storage.KEYS.PAYMENTS, [local]);

    // 409 with partial data but missing receipt
    const backendData = makeMatchingBackendData(local);
    delete backendData.receipt_number;
    mockApiCreate(() => { throw make409Error(backendData); });

    try {
      await PaymentSyncEngine._sendToBackend(local);
    } catch (_) { /* expected */ }

    const stored = Storage.get(Storage.KEYS.PAYMENTS, []);
    assert(stored[0].receiptNumber === null,
      'FAILED 409 preserves null receipt (no fabrication)');
    assert(stored[0].backendId === null,
      'FAILED 409 preserves null backendId (no fabrication)');
    assert(stored[0].confirmedAt === null,
      'FAILED 409 preserves null confirmedAt (no fabrication)');
  }
  restoreApiCreate();

  // ─────────────────────────────────────────────────────────────────────────
  // Restore and Summary
  // ─────────────────────────────────────────────────────────────────────────
  API.hasToken = originalHasToken;

  console.log('\n=============================================================');
  if (failedTests === 0) {
    console.log(`  ALL ${passedTests}/${totalTests} HTTP 409 REMEDIATION TESTS PASSED!`);
  } else {
    console.log(`  RESULTS: ${passedTests} passed, ${failedTests} failed out of ${totalTests} total`);
  }
  console.log('=============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('\n❌ 409 Remediation Test Suite Failed:\n', err);
  process.exit(1);
});
