/**
 * AL-IMAAMA — Stage 3.8 Payment UI State Tests
 *
 * Verifies correct handling of the { localRecord, confirmationPromise } wrapper
 * returned by Data.recordPayment():
 *
 *  - PENDING state: modal closes, "awaiting" notice shown — no success toast.
 *  - CONFIRMED (200/201): success toast + receipt shown AFTER backend confirmation.
 *  - FAILED: error toast shown — no receipt, no success toast.
 *  - Network failure: warning toast — payment stays PENDING.
 *  - Receipt receives a flat payment object, NOT the wrapper.
 *  - Duplicate submission guard still blocks in-flight re-submissions.
 *  - Ledger only includes CONFIRMED payments; PENDING/FAILED are excluded.
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
  globalThis.window = { location: { hash: '#payments' } };
}

import { Storage } from '../assets/js/storage.js';
import { API } from '../assets/js/api.js';
import { PaymentSyncEngine, PAYMENT_SYNC_STATUS } from '../assets/js/payment_sync.js';

let passed = 0;
let failed = 0;
let total = 0;

function assert(condition, message) {
  total++;
  if (!condition) {
    failed++;
    console.error(`❌ FAIL: ${message}`);
  } else {
    passed++;
    console.log(`✅ PASS: ${message}`);
  }
}

function resetPayments() {
  Storage.set(Storage.KEYS.PAYMENTS, []);
}

// ─── Mock API ─────────────────────────────────────────────────────────────────
const originalCreate = API.finances.payments.create;
const originalHasToken = API.hasToken;
API.hasToken = () => true;

function mockCreate(behavior) {
  API.finances.payments.create = async (...args) => behavior(...args);
}
function restoreCreate() {
  API.finances.payments.create = originalCreate;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function makePaymentData(overrides = {}) {
  return {
    studentId: 'STD-UI-01',
    invoiceId: 'INV-UI-01',
    feeCategory: 'Class Fee',
    month: '2026-11',
    amountDue: 50,
    amountPaid: 50,
    paymentMethod: 'Cash',
    paymentDate: '2026-11-23',
    transactionRef: 'TXN-UI-001',
    recordedBy: 'Admin',
    idempotencyKey: `ui-idem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    notes: '',
    ...overrides,
  };
}

function successResponse(localRecord) {
  return {
    id: 100,
    receipt_number: 'RCPT-UI-SUCCESS',
    amount_paid: localRecord.amountPaid,
    transaction_ref: localRecord.transactionRef,
    transaction_type: 'PAYMENT',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION A: Return value structure from submitPayment
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== A: submitPayment return value structure ===');
resetPayments();
{
  mockCreate(() => new Promise(() => {})); // Never resolves — stays in-flight
  const pd = makePaymentData();
  const result = await PaymentSyncEngine.submitPayment(pd);

  // The wrapper must have exactly these two properties
  assert(typeof result === 'object' && result !== null,
    'submitPayment returns an object');
  assert('localRecord' in result,
    'Return value has localRecord property');
  assert('confirmationPromise' in result,
    'Return value has confirmationPromise property');
  assert(result.confirmationPromise instanceof Promise,
    'confirmationPromise is a Promise');

  // localRecord must be the payment object — NOT the wrapper itself
  assert(result.localRecord.syncStatus === PAYMENT_SYNC_STATUS.PENDING,
    'localRecord.syncStatus is PENDING immediately after submitPayment');
  assert(typeof result.localRecord.idempotencyKey === 'string',
    'localRecord has idempotencyKey');
  assert(result.localRecord.receiptNumber === null,
    'localRecord.receiptNumber is null while PENDING');
  assert(result.localRecord.backendId === null,
    'localRecord.backendId is null while PENDING');
  assert(result.localRecord.confirmedAt === null,
    'localRecord.confirmedAt is null while PENDING');

  // The wrapper is NOT a flat payment record — receipt modal must not receive it
  assert(!('syncStatus' in result),
    'Wrapper does not have syncStatus (it is not a flat payment record)');
  assert(!('receiptNumber' in result),
    'Wrapper does not have receiptNumber (it is not a flat payment record)');
}
restoreCreate();

// ─────────────────────────────────────────────────────────────────────────────
// SECTION B: PENDING state — no success, no receipt
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== B: PENDING state — no premature success ===');
resetPayments();
{
  // Simulate network delay (never resolves during this check)
  let resolveBackend;
  mockCreate(() => new Promise(res => { resolveBackend = res; }));

  const pd = makePaymentData();
  const { localRecord, confirmationPromise } = await PaymentSyncEngine.submitPayment(pd);

  // Immediately after submitPayment(), record must be PENDING — not CONFIRMED
  assert(localRecord.syncStatus === PAYMENT_SYNC_STATUS.PENDING,
    'B1: Payment is PENDING immediately after submission');

  // PENDING payment must NOT be in confirmed ledger
  const ledger = PaymentSyncEngine.getConfirmedPayments();
  assert(!ledger.find(p => p.idempotencyKey === pd.idempotencyKey),
    'B2: PENDING payment is NOT in the confirmed ledger');

  // Stored record must still be PENDING
  const stored = Storage.get(Storage.KEYS.PAYMENTS, []);
  const storedPayment = stored.find(p => p.idempotencyKey === pd.idempotencyKey);
  assert(storedPayment && storedPayment.syncStatus === PAYMENT_SYNC_STATUS.PENDING,
    'B3: Storage shows PENDING, not CONFIRMED');
  assert(storedPayment.receiptNumber === null,
    'B4: No receipt number while PENDING');
}
restoreCreate();

// ─────────────────────────────────────────────────────────────────────────────
// SECTION C: HTTP 201 confirmation → CONFIRMED with correct data
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== C: HTTP 201 — confirmationPromise resolves with CONFIRMED record ===');
resetPayments();
{
  const pd = makePaymentData();
  const mockResp = {
    id: 201,
    receipt_number: 'RCPT-201',
    amount_paid: pd.amountPaid,
    transaction_ref: pd.transactionRef,
    transaction_type: 'PAYMENT',
  };
  mockCreate(() => Promise.resolve(mockResp));

  const { localRecord, confirmationPromise } = await PaymentSyncEngine.submitPayment(pd);
  assert(localRecord.syncStatus === PAYMENT_SYNC_STATUS.PENDING,
    'C1: Initially PENDING');

  const confirmed = await confirmationPromise;

  assert(confirmed.syncStatus === PAYMENT_SYNC_STATUS.CONFIRMED,
    'C2: confirmationPromise resolves with CONFIRMED status');
  assert(confirmed.receiptNumber === 'RCPT-201',
    'C3: Confirmed record has authoritative receipt number');
  assert(confirmed.backendId === 201,
    'C4: Confirmed record has backend payment ID');
  assert(confirmed.confirmedAt !== null,
    'C5: confirmedAt timestamp is set');

  // Confirmed record is a flat payment object, not a wrapper
  assert(!('confirmationPromise' in confirmed),
    'C6: Confirmed payment is flat record (no confirmationPromise property)');
  assert(!('localRecord' in confirmed),
    'C7: Confirmed payment is flat record (no localRecord property)');

  // Confirmed payment enters the ledger
  const ledger = PaymentSyncEngine.getConfirmedPayments();
  assert(!!ledger.find(p => p.idempotencyKey === pd.idempotencyKey),
    'C8: CONFIRMED payment is in the ledger');

  // The receipt modal would receive confirmedPayment — it must have required fields
  assert(typeof confirmed.transactionRef === 'string',
    'C9: Confirmed record has transactionRef for receipt');
  assert(typeof confirmed.amountPaid === 'number',
    'C10: Confirmed record has numeric amountPaid');
  assert(typeof confirmed.feeCategory === 'string',
    'C11: Confirmed record has feeCategory');
  assert(typeof confirmed.paymentMethod === 'string',
    'C12: Confirmed record has paymentMethod');
}
restoreCreate();

// ─────────────────────────────────────────────────────────────────────────────
// SECTION D: HTTP 200 idempotent replay → CONFIRMED
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== D: HTTP 200 idempotent replay → CONFIRMED ===');
resetPayments();
{
  const pd = makePaymentData();
  const mockResp = {
    id: 200,
    receipt_number: 'RCPT-200-REPLAY',
    amount_paid: pd.amountPaid,
    transaction_ref: pd.transactionRef,
    transaction_type: 'PAYMENT',
  };
  // HTTP 200 (idempotent replay) is a successful resolve — same path as 201
  mockCreate(() => Promise.resolve(mockResp));

  const { confirmationPromise } = await PaymentSyncEngine.submitPayment(pd);
  const confirmed = await confirmationPromise;

  assert(confirmed.syncStatus === PAYMENT_SYNC_STATUS.CONFIRMED,
    'D1: HTTP 200 replay → CONFIRMED');
  assert(confirmed.receiptNumber === 'RCPT-200-REPLAY',
    'D2: Receipt number from 200 replay response');
  assert(confirmed.backendId === 200,
    'D3: Backend ID from 200 replay response');

  const ledger = PaymentSyncEngine.getConfirmedPayments();
  assert(!!ledger.find(p => p.idempotencyKey === pd.idempotencyKey),
    'D4: 200-confirmed payment in ledger');
}
restoreCreate();

// ─────────────────────────────────────────────────────────────────────────────
// SECTION E: HTTP 400 failure → FAILED, no receipt, no success
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== E: HTTP 400 → FAILED, no success, no receipt ===');
resetPayments();
{
  const pd = makePaymentData();
  const err400 = new Error('Invalid payment amount');
  err400.status = 400;
  err400.data = { detail: 'Invalid payment amount' };
  mockCreate(() => Promise.reject(err400));

  const { localRecord, confirmationPromise } = await PaymentSyncEngine.submitPayment(pd);
  assert(localRecord.syncStatus === PAYMENT_SYNC_STATUS.PENDING,
    'E1: Initially PENDING before backend responds');

  let caughtError = null;
  try {
    await confirmationPromise;
    assert(false, 'E2: Should have thrown for 400');
  } catch (e) {
    caughtError = e;
  }

  assert(caughtError !== null, 'E2: confirmationPromise rejects on 400');
  assert(caughtError.status === 400, 'E3: Rejection carries HTTP 400 status');

  const stored = Storage.get(Storage.KEYS.PAYMENTS, []);
  const storedPay = stored.find(p => p.idempotencyKey === pd.idempotencyKey);
  assert(storedPay && storedPay.syncStatus === PAYMENT_SYNC_STATUS.FAILED,
    'E4: Payment stored as FAILED after 400');
  assert(storedPay.receiptNumber === null,
    'E5: No receipt number on FAILED payment');
  assert(storedPay.backendId === null,
    'E6: No backend ID on FAILED payment');
  assert(storedPay.confirmedAt === null,
    'E7: No confirmedAt timestamp on FAILED payment');

  // FAILED payment must NOT appear in the ledger
  const ledger = PaymentSyncEngine.getConfirmedPayments();
  assert(!ledger.find(p => p.idempotencyKey === pd.idempotencyKey),
    'E8: FAILED payment excluded from confirmed ledger');
}
restoreCreate();

// ─────────────────────────────────────────────────────────────────────────────
// SECTION F: Network failure → PENDING (not FAILED), no success, no receipt
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== F: Network failure → PENDING, no success, no receipt ===');
resetPayments();
{
  const pd = makePaymentData();
  const netErr = new TypeError('Failed to fetch');
  netErr.status = 0;
  mockCreate(() => Promise.reject(netErr));

  const { localRecord, confirmationPromise } = await PaymentSyncEngine.submitPayment(pd);
  assert(localRecord.syncStatus === PAYMENT_SYNC_STATUS.PENDING,
    'F1: Initially PENDING');

  let caughtError = null;
  try {
    await confirmationPromise;
  } catch (e) {
    caughtError = e;
  }

  assert(caughtError !== null, 'F2: confirmationPromise rejects on network error');

  const stored = Storage.get(Storage.KEYS.PAYMENTS, []);
  const storedPay = stored.find(p => p.idempotencyKey === pd.idempotencyKey);
  assert(storedPay && storedPay.syncStatus === PAYMENT_SYNC_STATUS.PENDING,
    'F3: Network failure leaves payment PENDING (not FAILED)');
  assert(storedPay.receiptNumber === null,
    'F4: No receipt number after network failure');

  // PENDING payment excluded from ledger
  const ledger = PaymentSyncEngine.getConfirmedPayments();
  assert(!ledger.find(p => p.idempotencyKey === pd.idempotencyKey),
    'F5: PENDING payment excluded from confirmed ledger after network failure');
}
restoreCreate();

// ─────────────────────────────────────────────────────────────────────────────
// SECTION G: 409 without matching payload → FAILED (409 remediation intact)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== G: 409 unverified conflict → FAILED (409 remediation intact) ===');
resetPayments();
{
  const pd = makePaymentData();
  const err409 = new Error('Conflict');
  err409.status = 409;
  err409.data = { detail: 'Idempotency conflict', code: 'idempotency_conflict' };
  mockCreate(() => Promise.reject(err409));

  const { confirmationPromise } = await PaymentSyncEngine.submitPayment(pd);

  let caught = null;
  try { await confirmationPromise; } catch (e) { caught = e; }

  assert(caught !== null && caught.status === 409,
    'G1: confirmationPromise rejects with 409 for unverified conflict');

  const stored = Storage.get(Storage.KEYS.PAYMENTS, []);
  const storedPay = stored.find(p => p.idempotencyKey === pd.idempotencyKey);
  assert(storedPay && storedPay.syncStatus === PAYMENT_SYNC_STATUS.FAILED,
    'G2: Unverified 409 → FAILED (not CONFIRMED)');
  assert(storedPay.receiptNumber === null,
    'G3: No receipt from unverified 409');

  const ledger = PaymentSyncEngine.getConfirmedPayments();
  assert(!ledger.find(p => p.idempotencyKey === pd.idempotencyKey),
    'G4: Unverified 409 excluded from confirmed ledger');
}
restoreCreate();

// ─────────────────────────────────────────────────────────────────────────────
// SECTION H: Duplicate in-flight submission guard
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== H: Duplicate in-flight submission guard ===');
resetPayments();
{
  let resolveFirst;
  mockCreate(() => new Promise(res => { resolveFirst = res; }));

  const pd = makePaymentData();

  // First submission — in-flight (backend not yet resolved)
  const firstResult = await PaymentSyncEngine.submitPayment(pd);
  assert(firstResult.localRecord.syncStatus === PAYMENT_SYNC_STATUS.PENDING,
    'H1: First submission creates PENDING record');

  // Second attempt with same key while in-flight must throw the in-flight guard
  let inFlightError = null;
  try {
    await PaymentSyncEngine.submitPayment(pd);
  } catch (e) {
    inFlightError = e;
  }
  assert(inFlightError !== null && inFlightError.message.includes('already in progress'),
    'H2: Second in-flight submission with same key is blocked by guard');

  // Now resolve the backend for the first submission
  resolveFirst({ id: 99, receipt_number: 'RCPT-DUP', amount_paid: pd.amountPaid, transaction_ref: pd.transactionRef });
  const confirmed = await firstResult.confirmationPromise;
  assert(confirmed.syncStatus === PAYMENT_SYNC_STATUS.CONFIRMED,
    'H3: First payment confirmed successfully after de-dup');

  // Once confirmed, re-submitting same key returns the existing CONFIRMED record (not a new one)
  mockCreate(() => Promise.resolve({ id: 99, receipt_number: 'RCPT-DUP', amount_paid: pd.amountPaid, transaction_ref: pd.transactionRef }));
  const thirdResult = await PaymentSyncEngine.submitPayment(pd);
  assert(thirdResult.localRecord.id === firstResult.localRecord.id,
    'H4: Post-confirmation re-submit returns existing CONFIRMED record');
  assert(thirdResult.localRecord.syncStatus === PAYMENT_SYNC_STATUS.CONFIRMED,
    'H5: Post-confirmation re-submit record is CONFIRMED');

  // Only one payment in storage
  const stored = Storage.get(Storage.KEYS.PAYMENTS, []);
  const matches = stored.filter(p => p.idempotencyKey === pd.idempotencyKey);
  assert(matches.length === 1,
    'H6: Only one payment record stored (no duplicates)');
}
restoreCreate();

// ─────────────────────────────────────────────────────────────────────────────
// SECTION I: Confirmed payment cannot be downgraded
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== I: Confirmed payment immutability ===');
resetPayments();
{
  const pd = makePaymentData();
  const mockResp = { id: 77, receipt_number: 'RCPT-IMUT', amount_paid: pd.amountPaid, transaction_ref: pd.transactionRef };
  mockCreate(() => Promise.resolve(mockResp));

  const { confirmationPromise } = await PaymentSyncEngine.submitPayment(pd);
  const confirmed = await confirmationPromise;
  assert(confirmed.syncStatus === PAYMENT_SYNC_STATUS.CONFIRMED, 'I1: Payment confirmed');

  // Try to call _sendToBackend again with an error — should not downgrade
  const failErr = new Error('Conflict');
  failErr.status = 409;
  failErr.data = {};
  mockCreate(() => Promise.reject(failErr));

  const result = await PaymentSyncEngine._sendToBackend(confirmed);
  assert(result.syncStatus === PAYMENT_SYNC_STATUS.CONFIRMED,
    'I2: Retry on confirmed payment returns CONFIRMED record unchanged');
  assert(result.receiptNumber === 'RCPT-IMUT',
    'I3: Receipt number preserved after retry');
}
restoreCreate();

// ─────────────────────────────────────────────────────────────────────────────
// SECTION J: Ledger totals — CONFIRMED counted, PENDING/FAILED excluded
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== J: Ledger exclusion of PENDING and FAILED ===');
resetPayments();
{
  const confirmed = {
    id: 'pay-confirmed-J',
    studentId: 'STD-J',
    invoiceId: 'INV-J',
    feeCategory: 'Class Fee',
    month: '2026-11',
    amountPaid: 100,
    paymentMethod: 'Cash',
    paymentDate: '2026-11-23',
    transactionRef: 'TXN-J-1',
    idempotencyKey: 'J-confirmed',
    syncStatus: PAYMENT_SYNC_STATUS.CONFIRMED,
    receiptNumber: 'RCPT-J-1',
    backendId: 1,
    confirmedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
  const pending = {
    ...confirmed,
    id: 'pay-pending-J',
    idempotencyKey: 'J-pending',
    syncStatus: PAYMENT_SYNC_STATUS.PENDING,
    receiptNumber: null,
    backendId: null,
    confirmedAt: null,
  };
  const failedPay = {
    ...confirmed,
    id: 'pay-failed-J',
    idempotencyKey: 'J-failed',
    syncStatus: PAYMENT_SYNC_STATUS.FAILED,
    receiptNumber: null,
    backendId: null,
    confirmedAt: null,
    syncError: 'Validation error',
  };
  Storage.set(Storage.KEYS.PAYMENTS, [confirmed, pending, failedPay]);

  const all = PaymentSyncEngine.getAllPayments();
  assert(all.length === 3, 'J1: getAllPayments returns all 3 records');

  const ledger = PaymentSyncEngine.getConfirmedPayments();
  assert(ledger.length === 1, 'J2: Ledger contains exactly 1 CONFIRMED payment');
  assert(ledger[0].idempotencyKey === 'J-confirmed',
    'J3: Only the CONFIRMED payment is in the ledger');
  assert(!ledger.find(p => p.syncStatus !== PAYMENT_SYNC_STATUS.CONFIRMED),
    'J4: No PENDING or FAILED payments in the ledger');

  // Financial totals use getConfirmedPayments only
  const totalConfirmed = ledger.reduce((sum, p) => sum + p.amountPaid, 0);
  assert(totalConfirmed === 100,
    'J5: Ledger total counts only CONFIRMED amount (100, not 300)');
}

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup and results
// ─────────────────────────────────────────────────────────────────────────────
API.hasToken = originalHasToken;

console.log('\n=============================================================');
if (failed === 0) {
  console.log(`  ALL ${passed}/${total} PAYMENT UI STATE TESTS PASSED!`);
} else {
  console.log(`  RESULTS: ${passed} passed, ${failed} failed out of ${total} total`);
}
console.log('=============================================================\n');

if (failed > 0) process.exit(1);
