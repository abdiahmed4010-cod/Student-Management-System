# STUDENTLY — Phase 2 Final Targeted Concurrency Corrections Report (`CONC-01` & `CONC-02`)

**Document:** `PHASE_2_CONCURRENCY_CORRECTIONS_REPORT.md`  
**Phase:** Phase 2 — Final Database Architecture Validation  
**Roles:** Principal Django Financial Systems Architect, Senior MySQL InnoDB Database Engineer, Payment Ledger Security Engineer & Technical Documentation Auditor  
**Date:** November 19, 2026  
**Final Governance Status:** **CONDITIONALLY APPROVED — AWAITING INDEPENDENT EXTERNAL RE-VALIDATION**  

---

## 1. Executive Summary

Following an independent external audit of the Phase 2 payment idempotency specification, exactly **two remaining payment idempotency concurrency defects** were identified in `process_payment()`:
1. **Defect A (`CONC-01`) — Missing Post-Invoice-Lock Duplicate Lookup Before Balance Validation:** A concurrent retry using the same `Idempotency-Key` could miss an uncommitted winning payment during the initial pre-lock lookup, wait on `StudentInvoice.objects.select_for_update()`, acquire the lock after the first request committed, observe a zero remaining balance, and erroneously fail with a `ValidationError` instead of returning the original payment and receipt.
2. **Defect B (`CONC-02`) — Unreliable Snapshot `SELECT` in MySQL `REPEATABLE READ` Race Recovery:** Inside the `except IntegrityError` handler, race recovery previously performed an ordinary consistent `SELECT` (`StudentPayment.objects.filter(...).first()`), which under MySQL InnoDB's default `REPEATABLE READ` isolation reads from the transaction's earlier MVCC snapshot and may fail to observe a concurrently committed winning payment.

This report documents the exact locations, root causes, corrected 12-step processing sequence, MySQL InnoDB `REPEATABLE READ` current-read recovery architecture, SQLite development limitations, cross-document updates across all affected Phase 2 specifications, and mandatory Phase 3 automated concurrency tests (Tests A–F).

### Strict Scope & Architecture Freeze Preserved
- **Documentation and architecture specification changes only.**
- **Zero application source code, Django migrations, or frontend files modified.**
- **Frozen 20-table schema unchanged** (20 tables, 32 ForeignKeys, 35 `CHECK` constraints, 17 unique constraints, 25 declared application indexes).
- **Adopted Option A policy unchanged** (invoice mandatory for all new operational payments; Option B remains unsupported under the frozen 20-table schema).
- **Payment immutability protections unchanged** (`save()`/`delete()` overrides + MySQL `BEFORE UPDATE`/`BEFORE DELETE` triggers).
- **Production isolation level unchanged** (MySQL InnoDB default `REPEATABLE READ` preserved; defects solved properly via current/locking reads rather than weakening isolation).
- **All historical audit reports and superseded findings preserved intact.**

---

## 2. Original Defects, Exact Locations & Root Causes

### 2.1. Defect A (`CONC-01`) — Missing Duplicate Lookup After Invoice Lock
- **Exact Locations (Pre-Correction):**
  - `DJANGO_MODEL_SPECIFICATIONS.md` — `process_payment()` (lines 1299–1333)
  - `PHASE_2_FINAL_SCHEMA_CONSISTENCY_MATRIX.md` — Section 8 `process_payment()` pseudocode (lines 252–279)
  - `PHASE_2_PAYMENT_POLICY_DECISION.md` — Section 6.4 Atomic Execution & Race Recovery Protocol (lines 181–190)
  - `PHASE_2_MEDIUM_02_FINAL_RESOLUTION_REPORT.md` — Section 3.1 item 5 (historical record; now annotated as superseded)
- **Original Defective Sequence:**
  1. Initial duplicate payment lookup (`StudentPayment.objects.filter(...).first()`).
  2. Acquire invoice lock (`StudentInvoice.objects.select_for_update().get(id=invoice.id)`).
  3. Validate invoice ownership.
  4. Validate outstanding invoice balance (`remaining_balance <= 0` / `amount > remaining_balance`).
  5. Create payment.
- **Root Cause:**
  - Suppose Invoice `I` has a remaining balance of `$80.00`, and two concurrent requests (`Request 1` and `Request 2`) submit the same `Idempotency-Key` and identical `$80.00` payload.
  - `Request 1` acquires the `StudentInvoice` row lock and inserts the `$80.00` payment, but has not yet committed.
  - `Request 2` executes its initial duplicate lookup *before* `Request 1` commits, finds `None`, and then blocks waiting on `StudentInvoice.objects.select_for_update()`.
  - `Request 1` commits (setting `invoice.total_amount_paid = $80.00`, `remaining_balance = $0.00`, `status = 'Paid'`).
  - `Request 2` unblocks, acquires the invoice lock, sees `remaining_balance == $0.00`, and raises `ValidationError("This invoice has no remaining outstanding balance.")` instead of returning `Request 1`'s original payment and receipt (`HTTP 200 OK`).
  - This directly violates the idempotency guarantee for concurrent retries on fully paid (or partially paid) invoices.

### 2.2. Defect B (`CONC-02`) — Unreliable Snapshot `SELECT` in MySQL `REPEATABLE READ` Race Recovery
- **Exact Locations (Pre-Correction):**
  - `DJANGO_MODEL_SPECIFICATIONS.md` — `process_payment()` `except IntegrityError` block (lines 1354–1375)
  - `PHASE_2_FINAL_SCHEMA_CONSISTENCY_MATRIX.md` — Section 8 `except IntegrityError` block (lines 299–305)
  - `PHASE_2_PAYMENT_POLICY_DECISION.md` — Section 6.4 item 2 (lines 186–189)
- **Original Defective Code:**
  ```python
  except IntegrityError as exc:
      raced_existing = StudentPayment.objects.filter(
          payment_method=payment_method,
          transaction_ref=resolved_ref,
      ).first()
  ```
- **Root Cause:**
  - Under MySQL InnoDB's default `REPEATABLE READ` isolation level, an ordinary `SELECT` is a **consistent non-locking read** (MVCC snapshot read) that reads from the transaction's read view established at its first consistent read.
  - Even with Defect A corrected, two concurrent requests using the same `Idempotency-Key` against **different invoices** (e.g., Test B: same key, different `invoice_id`) lock *different* `StudentInvoice` rows and can both pass the post-lock duplicate lookup simultaneously, then collide on `UNIQUE(payment_method, transaction_ref)` during `INSERT`.
  - When the losing transaction catches `IntegrityError` and rolls back its inner savepoint, an ordinary `SELECT` using its earlier MVCC snapshot may fail to observe the winning payment row committed by the other transaction, returning `None` and causing the handler to erroneously re-raise `IntegrityError` (HTTP 500) instead of returning `HTTP 200 OK` (on payload match) or `HTTP 409 Conflict` (on payload mismatch).
  - Additionally, the prior handler did not explicitly verify that the caught `IntegrityError` corresponded specifically to `UNIQUE(payment_method, transaction_ref)` before attempting recovery.

---

## 3. Corrected 12-Step Processing Sequence & Pseudocode

### 3.1. Canonical 12-Step Sequence
1. Validate inputs (`invoice is not None` under Option A, `amount > Decimal('0.00')`, and validate `Idempotency-Key` for Cash or non-empty `transaction_ref` <= 100 chars for ZAAD/eDahab).
2. Deterministically resolve `resolved_ref` (`CASH-IDEM-<NORMALIZED_IDEMPOTENCY_KEY>` for Cash; trimmed external ref for ZAAD/eDahab) **before** any duplicate lookup or insert.
3. Compute the canonical logical payload fingerprint: `(student_id, invoice_id, amount_paid, payment_method, fee_category, month, 'Payment')`.
4. Perform the **initial persistent duplicate lookup** (non-locking `SELECT` prior to entering `transaction.atomic()` and acquiring the invoice lock).
5. If an existing payment is found:
   - Compare its logical payload against `payload_fingerprint`.
   - Return `(existing, False)` (`HTTP 200 OK` with original receipt) if identical.
   - Raise `IdempotencyConflictError` (`HTTP 409 Conflict`) if different.
6. Begin `with transaction.atomic():`.
7. Lock the target invoice row via `StudentInvoice.objects.select_for_update().get(id=invoice.id)`.
8. Validate cross-entity invoice ownership (`str(invoice_obj.student_id) == str(student.id)`).
9. Perform a **MANDATORY SECOND duplicate lookup** for `(payment_method, resolved_ref)` using a **current/locking read**:
   `StudentPayment.objects.select_for_update().filter(payment_method=payment_method, transaction_ref=resolved_ref).first()`.
10. This second lookup **MUST execute BEFORE** invoice status (`Cancelled`/`Paid`) or outstanding-balance calculation and validation.
11. If an existing payment is found:
    - Compare its logical payload against `payload_fingerprint`.
    - Return `(existing, False)` (`HTTP 200 OK` with original receipt) if identical.
    - Raise `IdempotencyConflictError` (`HTTP 409 Conflict`) if different.
12. Only if no existing payment is found:
    - Validate invoice is not `Cancelled`.
    - Calculate `remaining_balance = invoice_obj.total_amount_due - invoice_obj.total_amount_paid`.
    - Validate `remaining_balance > Decimal('0.00')` and `amount <= remaining_balance`.
    - Insert the new `StudentPayment` inside an inner `transaction.atomic()` savepoint (with current-read race recovery on `UNIQUE(payment_method, transaction_ref)`).
    - Reconcile `invoice_obj` (`total_amount_paid`, `status`) **only** for the single winning insert, and commit.

### 3.2. Adapted Architectural Pseudocode (`DJANGO_MODEL_SPECIFICATIONS.md`)
```python
def process_payment(
    *, student, invoice, fee_category, month, amount, payment_method,
    user, idempotency_key=None, transaction_ref=None, notes=None,
):
    # 1. Option A & Positive Amount Validation
    if invoice is None:
        raise ValidationError("An active invoice is required for all new operational payments (Option A).")
    amount = Decimal(amount)
    if amount <= Decimal('0.00'):
        raise ValidationError("Payment amount must be strictly positive.")

    # 2. Validate Idempotency-Key & Resolve Canonical transaction_ref
    resolved_ref = (
        derive_cash_transaction_ref(idempotency_key)
        if payment_method == 'Cash'
        else _validate_external_transaction_ref(payment_method, transaction_ref)
    )

    # 3. Compute Canonical Logical Payload Fingerprint
    payload_fingerprint = _build_logical_payment_fingerprint(
        student=student, invoice=invoice, fee_category=fee_category,
        month=month, amount=amount, payment_method=payment_method,
    )

    # 4. Initial Persistent Duplicate Lookup (Before acquiring invoice lock)
    existing = _find_existing_payment(
        payment_method=payment_method,
        transaction_ref=resolved_ref,
    )
    if existing is not None:
        return _validate_and_return_existing(existing, payload_fingerprint)

    # 5. Begin Atomic Transaction & Lock Invoice Row
    with transaction.atomic():
        invoice_obj = StudentInvoice.objects.select_for_update().get(id=invoice.id)

        # 6. Validate Cross-Entity Invoice Ownership
        if str(invoice_obj.student_id) != str(student.id):
            raise ValidationError("The selected invoice does not belong to this student.")

        # 7. MANDATORY SECOND DUPLICATE LOOKUP (Current/Locking Read)
        # MUST happen after invoice lock & ownership check, and BEFORE balance validation.
        existing = _find_existing_payment_current_read(
            payment_method=payment_method,
            transaction_ref=resolved_ref,
        )
        if existing is not None:
            return _validate_and_return_existing(existing, payload_fingerprint)

        # 8. Validate Invoice Status & Outstanding Balance Ceiling
        if invoice_obj.status == 'Cancelled':
            raise ValidationError("Cannot post payment to a Cancelled invoice.")
        remaining_balance = invoice_obj.total_amount_due - invoice_obj.total_amount_paid
        if remaining_balance <= Decimal('0.00'):
            raise ValidationError("This invoice has no remaining outstanding balance.")
        if amount > remaining_balance:
            raise ValidationError(
                f"Payment amount (${amount}) exceeds remaining invoice balance (${remaining_balance})."
            )

        # 9. Atomic Insert inside Nested Savepoint + MySQL REPEATABLE READ Current-Read Recovery
        payment = StudentPayment(
            receipt_number=generate_receipt_number(),
            invoice=invoice_obj,
            student=student,
            fee_category=fee_category,
            month=month,
            amount_due=invoice_obj.total_amount_due,
            amount_paid=amount,
            payment_method=payment_method,
            payment_date=timezone.now().date(),
            transaction_ref=resolved_ref,
            recorded_by=user,
            transaction_type='Payment',
            is_reversal=False,
            notes=notes,
        )
        try:
            with transaction.atomic():  # Inner savepoint isolates failed insert
                payment.save()
        except IntegrityError as exc:
            if not _is_payment_ref_unique_violation(exc):
                raise  # Never suppress unrelated IntegrityError
            raced_existing = _find_existing_payment_current_read(
                payment_method=payment_method,
                transaction_ref=resolved_ref,
            )
            if raced_existing is not None:
                return _validate_and_return_existing(
                    raced_existing, payload_fingerprint, cause=exc
                )
            raise

        # 10. Reconcile Invoice ONLY for the Single Winning Insert
        invoice_obj.total_amount_paid += amount
        invoice_obj.reconcile_status()
        invoice_obj.save(update_fields=['total_amount_paid', 'status', 'updated_at'])
        return payment, True
```

---

## 4. MySQL InnoDB `REPEATABLE READ` Current-Read Strategy & Nested Savepoint Protocol

### 4.1. Consistent Read vs. Current/Locking Read Under `REPEATABLE READ`
| Read Type | Django ORM / SQL | InnoDB `REPEATABLE READ` Behavior | Safe for Idempotency Concurrency? |
| :--- | :--- | :--- | :---: |
| **Ordinary Consistent Read (Snapshot Read)** | `StudentPayment.objects.filter(...).first()` (`SELECT ...`) | Reads from the transaction's MVCC snapshot established at its first consistent read. **May NOT observe** rows committed concurrently by other transactions after snapshot creation. | **NO** (unreliable for post-lock lookup & race recovery) |
| **Current / Locking Read** | `StudentPayment.objects.select_for_update().filter(...).first()` (`SELECT ... FOR UPDATE`) | Bypasses the MVCC snapshot and reads the **latest committed** index record on `(payment_method, transaction_ref)`, blocking if an uncommitted lock is held until that transaction commits or rolls back. | **YES** (authoritative under `REPEATABLE READ`) |

### 4.2. Ten-Point Race Recovery Protocol
1. Execute payment insertion inside an outer `with transaction.atomic():` block.
2. Wrap `payment.save()` in an inner `with transaction.atomic():` **savepoint**.
3. Catch `IntegrityError as exc` **outside** the inner savepoint block so Django automatically rolls back the failed savepoint (`ROLLBACK TO SAVEPOINT`) and keeps the outer transaction clean and usable.
4. Confirm via `_is_payment_ref_unique_violation(exc)` that the exception corresponds specifically to `UNIQUE(payment_method, transaction_ref)` (`unique_payment_method_transaction_ref`).
5. If it does **not** match that constraint, **re-raise `exc` immediately** (never suppress unrelated integrity errors such as `CHECK` constraint violations, FK errors, or `unique_receipt_number` collisions).
6. Perform a **current/locking read** (`StudentPayment.objects.select_for_update().filter(payment_method=payment_method, transaction_ref=resolved_ref).first()`) to retrieve the committed winning payment.
7. Compare the winning payment's canonical logical payload against the incoming `payload_fingerprint`.
8. If identical, return `(raced_existing, False)` (`HTTP 200 OK` with original receipt).
9. If different, raise `IdempotencyConflictError` (`HTTP 409 Conflict`) `from exc`.
10. If no matching payment exists (e.g., transient or unexpected failure), re-raise the original `IntegrityError`.

### 4.3. Backend-Specific Behavior & SQLite Limitations
- **MySQL 8.0.16+ (InnoDB, Production & Staging):**
  - Preserves MySQL's default `REPEATABLE READ` isolation level (no isolation downgrade required).
  - `select_for_update()` issues native `SELECT ... FOR UPDATE` acquiring exclusive `X` locks on index records for both `StudentInvoice` and `StudentPayment`.
  - `UNIQUE(payment_method, transaction_ref)` remains the ultimate database-level integrity guarantee.
- **SQLite (v3.35+, Local Development Only):**
  - SQLite does **NOT** support row-level locks or `SELECT ... FOR UPDATE`; Django compiles `select_for_update()` as a plain `SELECT`.
  - Write concurrency in SQLite is serialized via database-wide file locks (`BEGIN IMMEDIATE` / `BEGIN EXCLUSIVE` with `busy_timeout`).
  - SQLite does **NOT** provide MySQL-equivalent row locking or InnoDB `REPEATABLE READ` MVCC snapshot semantics.
  - Development tests on SQLite validate functional idempotency logic and single-process constraint enforcement only; **they MUST NOT be used to certify MySQL production concurrency safety**.

---

## 5. Preserved Idempotency Policy & Key Scope

All previously approved Phase 2 idempotency and allocation decisions remain 100% intact:
- Client supplies `Idempotency-Key` header for Cash payments.
- Valid UUID keys normalize to lowercase canonical 36-char UUID (`CASH-IDEM-<uuid>`, 46 chars).
- Other valid printable ASCII keys (8–255 chars) normalize via lowercase SHA-256 hex digest (`CASH-IDEM-<sha256>`, 74 chars).
- Canonical reference remains well within `StudentPayment.transaction_ref VARCHAR(100)` (including `REV-` and `REF-...-999` suffixes).
- `UNIQUE(payment_method, transaction_ref)` remains the sole database uniqueness constraint and enforces a **global scope per payment method** across `studently_student_payments` (no new uniqueness constraint or narrower per-user/per-student scope is introduced).
- Same key + same payload returns original payment/receipt (`HTTP 200 OK`); same key + different payload returns `HTTP 409 Conflict`.
- Redis/Django cache remains optional optimization only, never the source of truth.
- `receipt_number` is never the source of idempotency.

---

## 6. Files Changed

The following **10 Phase 2 Markdown documents** were updated or created in `documentation/phase-2/`:

1. [`DJANGO_MODEL_SPECIFICATIONS.md`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/DJANGO_MODEL_SPECIFICATIONS.md) — Updated `process_payment()` and added `_build_logical_payment_fingerprint()`, `_find_existing_payment()`, `_find_existing_payment_current_read()`, `_validate_and_return_existing()`, and `_is_payment_ref_unique_violation()` implementing the 12-step sequence, post-lock current-read lookup (`CONC-01`), and MySQL `REPEATABLE READ` current-read savepoint recovery (`CONC-02`).
2. [`PHASE_2_PAYMENT_POLICY_DECISION.md`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/PHASE_2_PAYMENT_POLICY_DECISION.md) — Documented global key scope per payment method, updated Section 6.3–6.4 with the 12-step sequence, MySQL vs SQLite semantics, and added Section 6.5 (Mandatory Phase 3 Tests A–F).
3. [`DATABASE_ARCHITECTURE.md`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/DATABASE_ARCHITECTURE.md) — Synchronized Section 3.8 item 3 and Section 5 item 1 with `CONC-01`, `CONC-02`, MySQL `REPEATABLE READ` current reads, and SQLite limitations.
4. [`DATABASE_CONSTRAINTS_AND_INDEXES.md`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/DATABASE_CONSTRAINTS_AND_INDEXES.md) — Synchronized Section 7.1 storage engine concurrency disparity and Rule 9 with `CONC-01`, `CONC-02`, global key scope, and SQLite non-equivalence.
5. [`PHASE_2_FINAL_SCHEMA_CONSISTENCY_MATRIX.md`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/PHASE_2_FINAL_SCHEMA_CONSISTENCY_MATRIX.md) — Synchronized Section 8 `process_payment()` pseudocode, Section 10 dual-engine concurrency, Section 11 compliance row, and Section 12 19-document status.
6. [`PHASE_2_FINAL_INDEPENDENT_AUDIT_REPORT.md`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/PHASE_2_FINAL_INDEPENDENT_AUDIT_REPORT.md) — Added Findings `CONC-01` and `CONC-02`, updated Document Inventory to 19 files, and updated Acceptance Criteria & Final Recommendation.
7. [`PHASE_2_SIGNOFF_CHECKLIST.md`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/PHASE_2_SIGNOFF_CHECKLIST.md) — Updated Categories 4 and 5, updated Complete Documentation Suite to 19 files, and preserved `CONDITIONALLY APPROVED — AWAITING INDEPENDENT EXTERNAL RE-VALIDATION`.
8. [`PHASE_2_MEDIUM_02_FINAL_RESOLUTION_REPORT.md`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/PHASE_2_MEDIUM_02_FINAL_RESOLUTION_REPORT.md) — Preserved historical report intact while adding explicit superseded annotation on Section 3.1 item 5 pointing to Amendment 36 / `CONC-01` & `CONC-02`.
9. [`PHASE_2_CORRECTIONS.md`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/PHASE_2_CORRECTIONS.md) — Annotated Amendment 35 and appended **Amendment 36** documenting `CONC-01`, `CONC-02`, MySQL/SQLite behavior, Phase 3 Tests A–F, and the 19-document inventory.
10. [`PHASE_2_CONCURRENCY_CORRECTIONS_REPORT.md`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/PHASE_2_CONCURRENCY_CORRECTIONS_REPORT.md) — *(New Deliverable)* This targeted concurrency corrections report.

*(All other 9 historical Phase 2 documents were preserved unmodified.)*

---

## 7. Mandatory Phase 3 Automated Test Scenarios *(Specification Only — NOT Executed)*

> [!IMPORTANT]
> **Runtime Implementation & Automated Tests Deferred to Phase 3:** None of the tests below have been implemented or executed in Phase 2. They are mandatory acceptance gates for Phase 3 staging validation against **MySQL 8.0.16+ InnoDB**.

| Test ID | Scenario | Mandatory Verification Assertions | Target Backend |
| :---: | :--- | :--- | :---: |
| **Test A** | **Concurrent same-key invoice payment** | Two concurrent requests submit the same `Idempotency-Key` and identical payload for the same invoice. First commits (`201 Created`); second returns the first payment (`200 OK`). Exactly 1 `StudentPayment` row exists; both responses identify the exact same `receipt_number`; invoice credited once. | MySQL 8.0.16+ InnoDB |
| **Test B** | **Concurrent same-key, different payload** | Two concurrent requests submit the same `Idempotency-Key` with different amounts or different `invoice_id`s. Exactly one logical payment succeeds (`201 Created`); the other receives `HTTP 409 Conflict` (`IdempotencyConflictError`); no second payment is created. | MySQL 8.0.16+ InnoDB |
| **Test C** | **Fully paid invoice retry** | First request pays the entire remaining invoice balance (`remaining_balance -> $0.00`, `status -> 'Paid'`). Second request retries the same key and payload (both concurrently while waiting on the invoice lock and sequentially after commit). Second request returns the original payment and receipt (`200 OK`) and MUST NOT fail due to zero remaining balance. | MySQL 8.0.16+ InnoDB |
| **Test D** | **MySQL `REPEATABLE READ` unique race** | Two MySQL `REPEATABLE READ` transactions attempt to insert the same `(payment_method, transaction_ref)`. One commits; the other hits `UNIQUE(payment_method, transaction_ref)`, rolls back its inner savepoint, executes a current/locking read (`select_for_update()`), observes the committed winning row, and returns the original receipt on identical payload (or `HTTP 409` on mismatch). | MySQL 8.0.16+ InnoDB |
| **Test E** | **Unrelated `IntegrityError`** | Trigger an unrelated integrity failure (e.g., `CHECK` constraint violation, invalid FK, or `unique_receipt_number` collision) inside `process_payment()`. Verify it is NOT mistaken for an idempotency duplicate and that the original `IntegrityError` is re-raised. | MySQL 8.0.16+ & SQLite |
| **Test F** | **SQLite development behavior** | Verify functional idempotency and unique constraint enforcement on SQLite while explicitly documenting and gating row-locking / `REPEATABLE READ` tests so SQLite never falsely certifies MySQL production concurrency behavior. | SQLite 3.35+ (Dev Only) |

---

## 8. Remaining Limitations & Verification Status Distinction

### Remaining Limitations
1. **Runtime Implementation Not Yet Built:** `process_payment()` and helper functions exist strictly as Phase 2 architectural specifications; no Django code or migrations have been written.
2. **Concurrency Tests Not Yet Executed:** Tests A–F require a live Django runtime and MySQL 8.0.16+ InnoDB test instance in Phase 3.
3. **Physical Database Index Count (`MEDIUM-01`):** Remains `NOT VERIFIED` until Phase 3 migrations and `SHOW INDEX` introspection are run.
4. **Future Option B (Advance Deposits):** Remains unsupported under the frozen 20-table schema (requires a future ADR introducing `PaymentAllocation`).
5. **Non-Blocking Business Decisions:** 3 institutional business decisions remain open in `PHASE_2_SIGNOFF_CHECKLIST.md` (scholarship accounting, electronic voucher expiration window, academic year archival strategy).

### Verification Status Distinction
| Dimension | Status | Evidence / Scope |
| :--- | :---: | :--- |
| **Documentation Corrected** | **COMPLETE** | All 10 affected Phase 2 Markdown documents updated and cross-checked; historical reports preserved with superseded annotations. |
| **Architecture Specified** | **COMPLETE** | 12-step `process_payment()` sequence, post-lock current-read lookup (`CONC-01`), MySQL `REPEATABLE READ` current-read savepoint recovery (`CONC-02`), SQLite limitations, and Phase 3 Tests A–F fully codified. |
| **Runtime Implementation & Automated Concurrency Testing** | **NOT YET EXECUTED** | Strictly deferred to Phase 3 per Phase 2 no-code governance boundary. |

---

**FINAL GOVERNANCE STATUS: CONDITIONALLY APPROVED — AWAITING INDEPENDENT EXTERNAL RE-VALIDATION**  
*(No self-certification is claimed. Phase 3 remains strictly locked pending fresh independent external re-validation of `STUDENTLY_PHASE_2_CONCURRENCY_CORRECTED.zip`.)*
