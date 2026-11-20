# STUDENTLY — MySQL Deadlock and Transaction Retry Policy

**Document:** `MYSQL_DEADLOCK_RETRY_POLICY.md`  
**Phase:** Phase 2 — Final Database Architecture Validation  
**Scope:** Payment Processing (`process_payment()`) Concurrency Resilience on MySQL 8.0.16+ InnoDB  
**Date:** November 19, 2026  
**Verification Status:** **ARCHITECTURE SPECIFIED (`VERIFIED` in documentation; `NOT VERIFIED` at runtime — deferred to Phase 3 MySQL staging tests)**  

---

## 1. Purpose & Architectural Scope

This document defines the authoritative **MySQL Deadlock and Transaction Retry Policy** for `process_payment()` in **STUDENTLY — School & Payment Management System**. It complements — and does **not** alter — the frozen Phase 2 concurrency protections:
- **Option A** (mandatory invoice for all new operational payments; Option B unsupported under the frozen 20-table schema).
- **Durable Cash & Mobile Money Idempotency (`MEDIUM-02-A`):** Deterministic `CASH-IDEM-<NORMALIZED_IDEMPOTENCY_KEY>` persisted in `StudentPayment.transaction_ref` and enforced globally per payment method by `UNIQUE(payment_method, transaction_ref)`.
- **Post-Invoice-Lock Duplicate Lookup (`CONC-01`):** Mandatory second duplicate lookup via current/locking read (`StudentPayment.objects.select_for_update()`) after acquiring the invoice lock and validating ownership, strictly before balance calculation or validation.
- **MySQL `REPEATABLE READ` Savepoint Race Recovery (`CONC-02`):** Nested savepoint `IntegrityError` handling strictly for `UNIQUE(payment_method, transaction_ref)` using a current/locking read.

---

## 2. MySQL Deadlock and Transaction Retry Policy

### 2.1. Error Classification: Deadlock (`1213`) vs. Lock Wait Timeout (`1205`)

Under MySQL 8.0.16+ InnoDB (`REPEATABLE READ`), concurrent locking reads (`SELECT ... FOR UPDATE`) and unique-index inserts (`UNIQUE(payment_method, transaction_ref)`) can occasionally encounter transactional lock conflicts. The service layer MUST distinguish MySQL error codes precisely rather than catching arbitrary `OperationalError` exceptions:

| MySQL Error Code | SQLSTATE / Symbol | Meaning in InnoDB | Automatically Retried by This Policy? | Required Handling |
| :---: | :--- | :--- | :---: | :--- |
| **`1213`** | `40001` (`ER_LOCK_DEADLOCK`) | Circular wait detected by InnoDB deadlock detector; InnoDB **automatically rolls back** the victim transaction. | **YES** (bounded full-transaction retry) | Exit the failed `transaction.atomic()` block completely, apply short jittered backoff, start a fresh transaction, and repeat the full operation including idempotency lookups. |
| **`1205`** | `HY000` (`ER_LOCK_WAIT_TIMEOUT`) | Transaction waited longer than `innodb_lock_wait_timeout` for a row/gap lock held by another long-running transaction. InnoDB rolls back only the timed-out statement by default (not necessarily the whole transaction unless rolled back by Django). | **NO** (do not blindly retry inside the request loop) | Exit `transaction.atomic()` so the entire transaction rolls back cleanly; log as a lock-contention incident; raise controlled `PaymentConcurrencyError` (`HTTP 503 Service Unavailable` with `Retry-After`) so the client may safely retry with the same `Idempotency-Key`. Retrying `1205` blindly in a tight server loop amplifies lock contention and thread exhaustion. |
| **Other `OperationalError`** | e.g., `2006`, `2013`, `1045`, `1146` | Connection loss, authentication error, missing table, syntax/schema error, or disk failure. | **NO** | Never treated as deadlock-retryable. Roll back and propagate immediately. |
| **`IntegrityError` on `UNIQUE(payment_method, transaction_ref)`** | `1062` (`ER_DUP_ENTRY`) | Concurrent insert race on the same idempotency reference. | **NO** (handled by `CONC-02`) | Strictly follows the documented **`CONC-02`** inner-savepoint + current-read (`select_for_update()`) recovery procedure — **never** routed through the deadlock retry loop. |
| **Unrelated `IntegrityError`** | e.g., `CHECK`, FK, `unique_receipt_number` | Data/constraint violation unrelated to idempotency key race. | **NO** | Never suppressed or retried; re-raised immediately per `CONC-02`. |

### 2.2. Mandatory Policy Rules

1. **Full Transaction Rollback Required Before Retry:**
   - A deadlock exception MUST NEVER be caught *inside* `with transaction.atomic():` with continued queries on that broken transaction.
   - The `OperationalError` MUST unwind out of the `with transaction.atomic():` block so Django guarantees a complete transaction rollback before any retry begins.
2. **Whole-Transaction Retry Only:**
   - Every retry re-executes the **entire transaction** from the beginning — never only the individual SQL statement that encountered error `1213`.
3. **Bounded Retry Limit & Backoff:**
   - `MAX_DEADLOCK_RETRIES = 3` total attempts (**1 initial attempt + up to 2 retries**).
   - Between retry attempts, apply a brief bounded jittered exponential backoff (e.g., attempt 1 → 25–50 ms; attempt 2 → 75–150 ms) to desynchronize contending workers without holding database connections or locks during sleep.
4. **Fresh Transaction & Repeated Idempotency Lookups:**
   - Each retry opens a **brand-new** `transaction.atomic()` (and therefore a fresh InnoDB MVCC read view) and repeats the full `process_payment()` flow, including both the initial persistent duplicate lookup and the post-invoice-lock `CONC-01` current-read lookup using the exact same deterministic `resolved_ref` (`CASH-IDEM-<NORMALIZED_IDEMPOTENCY_KEY>` for Cash; external `transaction_ref` for ZAAD/eDahab).
   - If the contending request committed the same logical payment during the deadlock window, the retry cleanly observes it and returns `(existing, False)` (`HTTP 200 OK` with original receipt) — or `IdempotencyConflictError` (`HTTP 409 Conflict`) if payloads differ.
5. **Strict Separation from `CONC-02`:**
   - `IntegrityError` arising from `UNIQUE(payment_method, transaction_ref)` is handled exclusively inside the `CONC-02` nested-savepoint current-read recovery handler and is NEVER treated as a deadlock retry trigger.
6. **Controlled Failure on Retry Exhaustion:**
   - If all `MAX_DEADLOCK_RETRIES` (3) attempts fail with MySQL error `1213`, `process_payment()` raises a controlled domain exception (`PaymentConcurrencyError`), mapped at the API layer to `HTTP 503 Service Unavailable` (with `Retry-After` header).
   - Because every failed attempt rolled back atomically, retry exhaustion leaves **zero duplicate payments** and **zero corrupted invoice balances**. The client can safely retry later using the exact same `Idempotency-Key`.

### 2.3. Architectural Pseudocode Specification

```python
# apps/finances/services.py (Architectural Specification — Not Yet Implemented in Code)

import random
import time
from django.db import OperationalError, connection

MAX_DEADLOCK_RETRIES = 3  # 1 initial attempt + up to 2 full-transaction retries
MYSQL_ERR_LOCK_DEADLOCK = 1213
MYSQL_ERR_LOCK_WAIT_TIMEOUT = 1205


class PaymentConcurrencyError(Exception):
    """
    Raised when a payment cannot be completed due to MySQL lock wait timeout (1205)
    or exhausted deadlock retries (1213). Mapped to HTTP 503 Service Unavailable.
    Safe for the client to retry using the exact same Idempotency-Key.
    """


def _get_mysql_error_code(exc: OperationalError):
    """Extracts the numeric MySQL error code from a Django OperationalError if present."""
    if connection.vendor != 'mysql':
        return None
    orig = getattr(exc, '__cause__', None) or exc
    args = getattr(orig, 'args', ())
    if args and isinstance(args[0], int):
        return args[0]
    return None


def _is_mysql_deadlock_error(exc: OperationalError) -> bool:
    """Returns True strictly for MySQL InnoDB deadlock error 1213 (ER_LOCK_DEADLOCK)."""
    return _get_mysql_error_code(exc) == MYSQL_ERR_LOCK_DEADLOCK


def _is_mysql_lock_wait_timeout(exc: OperationalError) -> bool:
    """Returns True strictly for MySQL InnoDB lock wait timeout error 1205 (ER_LOCK_WAIT_TIMEOUT)."""
    return _get_mysql_error_code(exc) == MYSQL_ERR_LOCK_WAIT_TIMEOUT


def process_payment_with_deadlock_retry(**kwargs):
    """
    Executes process_payment() with bounded full-transaction retry strictly for
    MySQL InnoDB deadlock error 1213 (ER_LOCK_DEADLOCK).

    - Retries execute OUTSIDE the failed transaction.atomic() block after full rollback.
    - Each retry begins a fresh transaction and repeats all idempotency lookups (CONC-01).
    - IntegrityError races on UNIQUE(payment_method, transaction_ref) remain handled
      exclusively by CONC-02 inside process_payment().
    - Error 1205 (ER_LOCK_WAIT_TIMEOUT) is NOT retried blindly; it raises
      PaymentConcurrencyError (HTTP 503) cleanly after full rollback.
    - Unrelated OperationalError exceptions propagate unmodified.
    """
    base_delay_seconds = 0.025  # 25ms base backoff

    for attempt in range(1, MAX_DEADLOCK_RETRIES + 1):
        try:
            # Calls the CONC-01 & CONC-02 hardened process_payment()
            return process_payment(**kwargs)
        except OperationalError as exc:
            if _is_mysql_deadlock_error(exc):
                if attempt >= MAX_DEADLOCK_RETRIES:
                    raise PaymentConcurrencyError(
                        "Payment could not be completed due to repeated database deadlocks (MySQL 1213). "
                        "Please retry using the same Idempotency-Key."
                    ) from exc
                # Bounded jittered exponential backoff OUTSIDE any database transaction
                sleep_seconds = (base_delay_seconds * (2 ** (attempt - 1))) + random.uniform(0.0, 0.025)
                time.sleep(sleep_seconds)
                continue

            if _is_mysql_lock_wait_timeout(exc):
                raise PaymentConcurrencyError(
                    "Payment lock wait timed out (MySQL 1205). "
                    "Please retry using the same Idempotency-Key."
                ) from exc

            # Never retry unrelated OperationalError exceptions
            raise
```

---

## 3. SQLite Development Limitations

- **No Row-Level Locking or InnoDB Error `1213`:** SQLite (v3.35+ in local development) does **not** support `SELECT ... FOR UPDATE` row-level locking or InnoDB deadlock detection. Django's SQLite backend compiles `select_for_update()` as a plain `SELECT`.
- **Database-Wide File Locking:** SQLite serializes writes using a database-wide file lock (`BEGIN IMMEDIATE` / `BEGIN EXCLUSIVE`) with `busy_timeout = 5000`. Contention in SQLite surfaces as `OperationalError: database is locked`, which is **not** equivalent to MySQL InnoDB row-level deadlock error `1213`.
- **Certification Boundary:** SQLite development tests MUST NEVER be used to claim or certify MySQL deadlock retry safety. Deadlock retry behavior (`1213`), lock wait timeout distinction (`1205`), and `CONC-01`/`CONC-02` concurrency guarantees MUST be verified against **MySQL 8.0.16+ InnoDB** in Phase 3 staging.

---

## 4. Mandatory Phase 3 Runtime Verification Scenarios *(Specification Only — NOT Executed)*

| Test ID | Scenario | Expected Verification Outcome | Target Backend |
| :---: | :--- | :--- | :---: |
| **Test DL-1** | **MySQL `1213` deadlock recovery** | Simulate or trigger InnoDB error `1213` inside `process_payment()`. Verify complete transaction rollback, fresh transaction retry outside `transaction.atomic()`, repeated idempotency lookup, single `StudentPayment` created, and exact invoice reconciliation. | MySQL 8.0.16+ InnoDB |
| **Test DL-2** | **MySQL `1213` retry exhaustion** | Force error `1213` across all 3 attempts (`MAX_DEADLOCK_RETRIES = 3`). Verify `PaymentConcurrencyError` (`HTTP 503`) is returned, zero duplicate payments exist, and invoice balance is unchanged. | MySQL 8.0.16+ InnoDB |
| **Test DL-3** | **MySQL `1205` lock wait timeout distinction** | Trigger error `1205` (`ER_LOCK_WAIT_TIMEOUT`). Verify it is NOT retried by the deadlock retry loop, rolls back cleanly, and raises controlled `PaymentConcurrencyError` (`HTTP 503`). | MySQL 8.0.16+ InnoDB |
| **Test DL-4** | **Unrelated `OperationalError` propagation** | Trigger an unrelated `OperationalError` (e.g., connection/syntax error). Verify zero retries occur and the original exception propagates immediately. | MySQL 8.0.16+ / Unit |
| **Test DL-5** | **Separation from `CONC-02` `IntegrityError`** | Trigger `UNIQUE(payment_method, transaction_ref)` `IntegrityError`. Verify it is recovered strictly via `CONC-02` savepoint + current read and does NOT invoke the deadlock retry loop. | MySQL 8.0.16+ InnoDB |

---

**Verification Status:** Documentation & Architecture Specification Complete (`VERIFIED` in documentation; runtime implementation and MySQL concurrency tests `NOT VERIFIED` — deferred to Phase 3).
