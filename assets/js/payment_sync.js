/**
 * AL-IMAAMA - Payment Synchronization Engine (Stage 3.8 Remediation)
 *
 * Implements authoritative backend-confirmed payment state machine:
 *
 * States:
 *   PENDING   – written locally, backend request in-flight or not yet sent
 *   CONFIRMED – backend returned 200/201 with receipt_number
 *   FAILED    – backend rejected (4xx) or network error; will NOT be retried
 *
 * Contract:
 *   - Only CONFIRMED payments count toward ledger balances and are shown in receipts.
 *   - PENDING payments display a "Pending" badge; they never show as Paid.
 *   - FAILED payments display an error badge and are excluded from balance calculations.
 *   - The same idempotencyKey is preserved across retries of the same logical payment.
 *   - Duplicate submissions are blocked by checking for an existing PENDING record
 *     with the same (studentId, invoiceId, month, feeCategory, amountPaid, idempotencyKey).
 *   - On page refresh, PENDING payments are automatically retried via recoverPending().
 *
 * Error handling matrix:
 *   Network error (TypeError/fetch fail) → state stays PENDING, retry eligible
 *   HTTP 400 Bad Request                 → state → FAILED (validation error, no retry)
 *   HTTP 401 Unauthorized                → state stays PENDING (ApiClient handles token refresh)
 *   HTTP 403 Forbidden                   → state → FAILED (permission denied, no retry)
 *   HTTP 409 Conflict (idempotency)      → CONFIRMED only if backend returns verified matching
 *                                          payment with receipt; otherwise → FAILED
 *   HTTP 500 Server Error                → state stays PENDING (transient, retry eligible)
 */

import { Storage } from './storage.js';
import { API } from './api.js';

// ─── Payment Sync State Constants ────────────────────────────────────────────
export const PAYMENT_SYNC_STATUS = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  FAILED: 'FAILED',
};

// Non-retryable HTTP status codes (permanent backend rejection)
const NON_RETRYABLE_STATUSES = new Set([400, 403, 422]);

// In-memory lock: idempotency keys currently in-flight
const _inFlightKeys = new Set();

// ─── Core Engine ─────────────────────────────────────────────────────────────
export const PaymentSyncEngine = {
  /**
   * Submit a new payment.
   * Returns a local payment record immediately with syncStatus=PENDING.
   * Calls the backend async and resolves to the CONFIRMED record on success.
   *
   * @param {Object} paymentData - Payment fields from the form
   * @returns {Promise<{localRecord: Object, confirmationPromise: Promise<Object>}>}
   */
  async submitPayment(paymentData) {
    if (!paymentData.idempotencyKey) {
      throw new Error('idempotencyKey is required');
    }

    // ── Duplicate submission guard ───────────────────────────────────────────
    if (_inFlightKeys.has(paymentData.idempotencyKey)) {
      throw new Error('A payment with this idempotency key is already in progress.');
    }

    // Check for existing PENDING record with same key (page reload scenario)
    const existing = this._findByIdempotencyKey(paymentData.idempotencyKey);
    if (existing && existing.syncStatus === PAYMENT_SYNC_STATUS.CONFIRMED) {
      return { localRecord: existing, confirmationPromise: Promise.resolve(existing) };
    }
    if (existing && existing.syncStatus === PAYMENT_SYNC_STATUS.PENDING) {
      // Resume existing pending record — do not create a new one
      return { localRecord: existing, confirmationPromise: this._sendToBackend(existing) };
    }

    // ── Build local record ───────────────────────────────────────────────────
    const localRecord = {
      id: Storage.uuid('pay'),
      studentId: paymentData.studentId,
      invoiceId: paymentData.invoiceId || null,
      feeCategory: paymentData.feeCategory,
      month: paymentData.month,
      amountDue: parseFloat(paymentData.amountDue) || 0,
      amountPaid: parseFloat(paymentData.amountPaid),
      paymentMethod: paymentData.paymentMethod,
      paymentDate: paymentData.paymentDate || new Date().toISOString().split('T')[0],
      transactionRef: (paymentData.transactionRef || '').trim() || `TXN-${Date.now().toString().slice(-6)}`,
      recordedBy: paymentData.recordedBy || 'Administrator',
      notes: paymentData.notes || '',
      idempotencyKey: paymentData.idempotencyKey,
      // State fields
      syncStatus: PAYMENT_SYNC_STATUS.PENDING,
      syncError: null,
      receiptNumber: null,
      backendId: null,
      createdAt: new Date().toISOString(),
      confirmedAt: null,
    };

    // Write PENDING record immediately
    this._upsertLocalRecord(localRecord);

    // ── Fire backend confirmation ────────────────────────────────────────────
    const confirmationPromise = this._sendToBackend(localRecord);

    return { localRecord, confirmationPromise };
  },

  /**
   * Retry all PENDING payments found in local storage.
   * Called on app startup if the user was previously logged in.
   */
  async recoverPending() {
    const pending = this._getPendingPayments();
    if (pending.length === 0) return [];

    const results = await Promise.allSettled(
      pending.map(p => this._sendToBackend(p))
    );

    return results.map((r, i) => ({
      idempotencyKey: pending[i].idempotencyKey,
      status: r.status === 'fulfilled' ? PAYMENT_SYNC_STATUS.CONFIRMED : PAYMENT_SYNC_STATUS.PENDING,
    }));
  },

  /**
   * Get only CONFIRMED payments for ledger/balance calculations.
   * PENDING and FAILED payments are excluded from financial totals.
   */
  getConfirmedPayments(filters = {}) {
    let payments = Storage.get(Storage.KEYS.PAYMENTS, [])
      .filter(p => p.syncStatus === PAYMENT_SYNC_STATUS.CONFIRMED);

    if (filters.studentId) payments = payments.filter(p => p.studentId === filters.studentId);
    if (filters.feeCategory) payments = payments.filter(p => p.feeCategory === filters.feeCategory);
    if (filters.month) payments = payments.filter(p => p.month === filters.month);
    if (filters.startDate) payments = payments.filter(p => p.paymentDate >= filters.startDate);
    if (filters.endDate) payments = payments.filter(p => p.paymentDate <= filters.endDate);
    return payments;
  },

  /**
   * Get ALL payments including PENDING and FAILED (for display in history table).
   */
  getAllPayments(filters = {}) {
    let payments = Storage.get(Storage.KEYS.PAYMENTS, []);
    if (filters.studentId) payments = payments.filter(p => p.studentId === filters.studentId);
    if (filters.feeCategory) payments = payments.filter(p => p.feeCategory === filters.feeCategory);
    if (filters.month) payments = payments.filter(p => p.month === filters.month);
    if (filters.startDate) payments = payments.filter(p => p.paymentDate >= filters.startDate);
    if (filters.endDate) payments = payments.filter(p => p.paymentDate <= filters.endDate);
    return payments;
  },

  /**
   * Whether a payment has been confirmed by the backend.
   */
  isConfirmed(payment) {
    return payment && payment.syncStatus === PAYMENT_SYNC_STATUS.CONFIRMED;
  },

  /**
   * Whether a payment is pending backend confirmation.
   */
  isPending(payment) {
    return payment && payment.syncStatus === PAYMENT_SYNC_STATUS.PENDING;
  },

  /**
   * Whether a payment has been permanently rejected by the backend.
   */
  isFailed(payment) {
    return payment && payment.syncStatus === PAYMENT_SYNC_STATUS.FAILED;
  },

  // ─── Internal Helpers ─────────────────────────────────────────────────────

  async _sendToBackend(localRecord) {
    if (!API.hasToken()) {
      // No auth token — leave as PENDING for recoverPending() after login
      return localRecord;
    }

    _inFlightKeys.add(localRecord.idempotencyKey);

    try {
      const response = await API.finances.payments.create(
        {
          student_id: localRecord.studentId,
          invoice_id: localRecord.invoiceId,
          fee_category: localRecord.feeCategory,
          month: localRecord.month,
          amount: localRecord.amountPaid,
          payment_method: localRecord.paymentMethod,
          payment_date: localRecord.paymentDate,
          transaction_ref: localRecord.transactionRef,
          notes: localRecord.notes,
          idempotency_key: localRecord.idempotencyKey,
        },
        localRecord.idempotencyKey
      );

      // Success (201 Created) or Idempotent match (200 OK)
      const confirmed = {
        ...localRecord,
        syncStatus: PAYMENT_SYNC_STATUS.CONFIRMED,
        syncError: null,
        receiptNumber: response.receipt_number || null,
        backendId: response.id || null,
        confirmedAt: new Date().toISOString(),
        // Merge any backend-authoritative fields
        amountPaid: parseFloat(response.amount_paid || localRecord.amountPaid),
        transactionRef: response.transaction_ref || localRecord.transactionRef,
        transactionType: response.transaction_type || 'PAYMENT',
      };

      this._upsertLocalRecord(confirmed);
      return confirmed;

    } catch (err) {
      const status = err.status || 0;

      if (status === 409) {
        // Idempotency conflict – verify backend data matches original payment
        // before confirming. Only mark CONFIRMED when the backend returns a
        // complete, authoritative payment record that matches our local payload.
        const backendData = err.data || {};

        // Guard: if the local record is already CONFIRMED, never downgrade it
        const currentLocal = this._findByIdempotencyKey(localRecord.idempotencyKey);
        if (currentLocal && currentLocal.syncStatus === PAYMENT_SYNC_STATUS.CONFIRMED) {
          return currentLocal;
        }

        const payloadMatches =
          backendData.id &&
          backendData.receipt_number &&
          backendData.student_id === localRecord.studentId &&
          backendData.invoice_id === localRecord.invoiceId &&
          Number(backendData.amount) === Number(localRecord.amountPaid) &&
          backendData.payment_method === localRecord.paymentMethod &&
          (backendData.transaction_ref === localRecord.transactionRef ||
           backendData.idempotency_key === localRecord.idempotencyKey);

        if (payloadMatches) {
          // Backend confirms the exact payment already exists
          const confirmed = {
            ...localRecord,
            syncStatus: PAYMENT_SYNC_STATUS.CONFIRMED,
            syncError: null,
            receiptNumber: backendData.receipt_number,
            backendId: backendData.id,
            confirmedAt: new Date().toISOString(),
          };
          this._upsertLocalRecord(confirmed);
          return confirmed;
        }

        // Missing data, mismatch, or malformed response – mark FAILED
        const failed = {
          ...localRecord,
          syncStatus: PAYMENT_SYNC_STATUS.FAILED,
          syncError: this._extractErrorMessage(err) + ' (idempotency conflict without matching payment)',
        };
        this._upsertLocalRecord(failed);
        throw err;
      }

      if (NON_RETRYABLE_STATUSES.has(status)) {
        // Permanent failure — mark as FAILED, exclude from balances
        const failed = {
          ...localRecord,
          syncStatus: PAYMENT_SYNC_STATUS.FAILED,
          syncError: this._extractErrorMessage(err),
        };
        this._upsertLocalRecord(failed);
        throw err; // Re-throw so the UI can display the specific error
      }

      // Transient failure (network, 401, 500) — stay PENDING, eligible for retry
      // 401 is handled by ApiClient (token refresh + retry); we don't mark as FAILED
      const stillPending = {
        ...localRecord,
        syncStatus: PAYMENT_SYNC_STATUS.PENDING,
        syncError: this._extractErrorMessage(err),
      };
      this._upsertLocalRecord(stillPending);
      throw err;

    } finally {
      _inFlightKeys.delete(localRecord.idempotencyKey);
    }
  },

  _upsertLocalRecord(record) {
    const payments = Storage.get(Storage.KEYS.PAYMENTS, []);
    const idx = payments.findIndex(p => p.id === record.id || p.idempotencyKey === record.idempotencyKey);
    if (idx !== -1) {
      payments[idx] = record;
    } else {
      payments.unshift(record);
    }
    Storage.set(Storage.KEYS.PAYMENTS, payments);
  },

  _findByIdempotencyKey(key) {
    const payments = Storage.get(Storage.KEYS.PAYMENTS, []);
    return payments.find(p => p.idempotencyKey === key) || null;
  },

  _getPendingPayments() {
    return Storage.get(Storage.KEYS.PAYMENTS, [])
      .filter(p => p.syncStatus === PAYMENT_SYNC_STATUS.PENDING);
  },

  _extractErrorMessage(err) {
    if (!err) return 'Unknown error';
    if (err.data) {
      if (err.data.detail) return err.data.detail;
      if (typeof err.data === 'object') {
        const msgs = Object.entries(err.data)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
          .join(' | ');
        if (msgs) return msgs;
      }
    }
    return err.message || 'Payment submission failed';
  },
};
