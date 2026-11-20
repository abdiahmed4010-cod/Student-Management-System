# STUDENTLY — Phase 2 Payment Allocation Policy & Cash Idempotency Architecture Decision

**Document:** `PHASE_2_PAYMENT_POLICY_DECISION.md`  
**Phase:** Phase 2 — Final Database Architecture Validation  
**Role:** Principal Database Architect, Senior Django Financial Systems Architect & Payment Ledger Security Engineer  
**Date:** November 19, 2026  
**Status:** **OPTION A FORMALLY ADOPTED** — Architecture Specification Complete (`MEDIUM-02-A`, `MEDIUM-02-B`, `CONC-01` & `CONC-02` Resolved; Runtime Implementation Not Yet Tested)  

---

## 1. Executive Summary & Architectural Decision

In the approved Phase 2 relational schema (20 canonical application tables), `studently_student_payments` defines `invoice_id` as a nullable foreign key:
```python
invoice = models.ForeignKey(
    'StudentInvoice',
    on_delete=models.RESTRICT,
    null=True,
    blank=True,
    related_name='payments',
    db_column='invoice_id'
)
```

An independent external review identified two critical defects in the prior draft of this policy (`MEDIUM-02`):
1. **MEDIUM-02-A (Cash Idempotency Defect):** Previous documentation contained conflicting cash reference formats (`CSH-<receipt_number>`, `CASH-<STUDENT_ID>-<YYYYMM>-<DAILY_SEQ>`) and relied on a volatile 120-second Redis/Django cache for `X-Idempotency-Key`. Because receipt numbers are generated during processing and caches can expire or evict, retries or concurrent requests could create duplicate cash payments.
2. **MEDIUM-02-B (Payment Allocation & Immutability Contradiction):** Previous documentation proposed mutating an existing payment (`payment.invoice = new_invoice`) to support Option B (unallocated advance deposits) and claimed Option B required zero DDL changes. This directly contradicted the immutable append-only `StudentPayment` ledger (enforced by `.save()` raising `PermissionDenied` and MySQL `BEFORE UPDATE` triggers) and overlooked the absence of a durable allocation ledger table in the frozen 20-table schema.

### Canonical Phase 2 Decisions Established Herein
1. **Payment Allocation Policy (`MEDIUM-02-B`):** **OPTION A — Invoice Required for New Operational Payments** is **FORMALLY ADOPTED**. Every new operational payment MUST reference an existing, active invoice belonging to the same student. The nullable database FK (`invoice_id NULL`) is retained **strictly for historical Phase 1 legacy data migration compatibility**. **Option B is explicitly NOT SUPPORTED under the current frozen 20-table schema** and is documented solely as a future architectural possibility requiring a separate formal ADR and schema revision introducing a `PaymentAllocation` ledger table.
2. **Cash Payment Idempotency (`MEDIUM-02-A`):** Exactly one canonical, durable cash idempotency strategy is established: clients supply an `Idempotency-Key`, the server deterministically derives `CASH-IDEM-<NORMALIZED_IDEMPOTENCY_KEY>` **before** duplicate checking and insertion, persists it in `StudentPayment.transaction_ref`, and enforces durability via the database constraint `UNIQUE(payment_method, transaction_ref)` with logical payload consistency checks and atomic savepoint race recovery.

---

## 2. Historical Context & Legacy Compatibility Boundary

### 2.1. Phase 1 LocalStorage Implementation
In the audited Phase 1 Vanilla JavaScript prototype (`assets/js/data.js:861-879, 1068-1134`), payments were logged without an invoice entity:
- Every payment voucher stored: `{ id, studentId, feeCategory, month, amountDue, amountPaid, paymentMethod, paymentDate, transactionRef, recordedBy, notes }`.
- Monthly obligations were dynamically computed at render time ($\text{Total Due} = \text{Class Fee} + \text{School Fee} = \$45 + \$35 = \$80$).

### 2.2. Database Nullable FK vs. Application Mandatory Invoice Rule
To preserve the approved 20-table schema while preventing unallocated floating balances, STUDENTLY enforces a strict architectural separation between **database schema nullability** and **operational API enforcement**:

| Layer | `invoice_id` Requirement | Purpose |
| :--- | :--- | :--- |
| **Database Schema (`studently_student_payments.invoice_id`)** | Nullable (`null=True, blank=True`, `ON DELETE RESTRICT`) | Retained **exclusively** for importing historical Phase 1 legacy migration records that predate materialized invoicing. |
| **Operational API & Service Layer (`PaymentSerializer` / `process_payment()`)** | **MANDATORY (`NOT NULL`)** | All new operational payments MUST reference a valid, non-cancelled `StudentInvoice` belonging to the student. Requests with `invoice=None` are strictly rejected (`HTTP 400 Bad Request` / `ValidationError`). |

> [!IMPORTANT]
> A nullable database foreign key does **NOT** authorize the operational payment API to accept invoice-less payments. New operational payments without an invoice are unconditionally rejected.

---

## 3. Adopted Policy: OPTION A — Invoice Required for New Operational Payments

**Governance Status:** **FORMALLY ADOPTED** (Mandatory for Phase 2 Architecture Freeze and Phase 3 Implementation)

### 3.1. Ten Mandatory Option A Rules
1. **Mandatory Invoice Association:** Every new operational payment MUST reference an existing `StudentInvoice` (`invoice` is required in both the DRF serializer and `process_payment()`).
2. **Cross-Entity Student Ownership:** The referenced invoice MUST belong to the exact same student as the payment (`str(invoice.student_id) == str(student.id)`).
3. **Active Outstanding Balance Required:** The invoice MUST have `status` in `('Unpaid', 'Partially Paid')` and `outstanding_balance > Decimal('0.00')`. Payments against `Paid` or `Cancelled` invoices are rejected.
4. **Outstanding Balance Ceiling:** `amount_paid` MUST NOT exceed `invoice.total_amount_due - invoice.total_amount_paid`. Overpayments are strictly rejected.
5. **Creation-Time Binding Only:** The payment's `invoice_id` association is established atomically when the payment record is created.
6. **Zero Reassignment Guarantee:** Existing `StudentPayment` records MUST NEVER be updated or reassigned to another invoice (`payment.invoice = new_invoice` is strictly prohibited and blocked at both ORM and SQL trigger layers).
7. **Legacy Migration Isolation:** Historical Phase 1 migrated payments may retain `invoice_id = NULL` solely for migration compatibility. They are never created through the operational payment endpoint.
8. **Strict API & Service Rejection:** Both the DRF `PaymentSerializer` (`invoice_id = UUIDField(required=True, allow_null=False)`) and `process_payment()` reject any new operational payment lacking an invoice.
9. **Reversal & Refund Continuity:** Reversal and refund vouchers MUST preserve the exact `invoice_id` of their `reversed_payment` (whether non-null for operational payments or `NULL` for historical legacy migrated records).
10. **Immutable Append-Only Ledger:** Original `StudentPayment` records remain strictly immutable. Corrections occur exclusively via compensatory `Reversal` or `Refund` records.

### 3.2. Operational Workflow Under Option A
1. Monthly invoices are generated in batch at the start of each billing cycle (or immediately upon student enrollment/registration for ad-hoc registration fees).
2. If a parent wishes to pay for a future month or an ad-hoc fee, the cashier generates the corresponding `StudentInvoice` first, then posts the payment against that invoice.
3. Every dollar collected in live operations directly reconciles against an explicit, auditable `StudentInvoice`.

---

## 4. Option B Treatment: Explicitly Unsupported Under Frozen 20-Table Schema

**Governance Status:** **NOT SUPPORTED UNDER THE CURRENT FROZEN 20-TABLE SCHEMA**

### 4.1. Why Option B Is Incompatible with the Current Schema
Any prior statement claiming Option B (unallocated advance deposits allocated to future invoices) was compatible with the 20-table schema or required zero DDL changes is **formally retracted and superseded**. Specifically:
1. **Violates Payment Immutability:** Allocating an existing `invoice=NULL` payment by executing `payment.invoice = new_invoice` mutates an existing ledger row, which is explicitly blocked by `StudentPayment.save()` (`PermissionDenied`) and MySQL `BEFORE UPDATE` trigger `trg_studently_payments_no_update`.
2. **Missing Allocation Ledger Table:** The frozen 20-table schema does not contain a `PaymentAllocation`, `payment_allocation`, or `advance_credit` table to durably record partial or multi-invoice allocations without mutating the original payment voucher.
3. **Cannot Split Advance Credits:** A single advance deposit (e.g., \$240 covering 3 months of \$80 invoices) cannot be represented by a single scalar `StudentPayment.invoice_id` foreign key.

### 4.2. Future Option B Architecture (Requires Separate Formal ADR & Schema Revision)
If school leadership subsequently mandates unallocated advance payments and multi-invoice credit allocation in a future release (post-Phase 2 freeze), it MUST be introduced via a formal Architectural Decision Record (ADR) and a schema revision adding a durable **Allocation Ledger Table** (e.g., `studently_payment_allocations` / `PaymentAllocation`).

> [!NOTE]
> `PaymentAllocation` is **NOT** added to the current 20-table Phase 2 schema. The following blueprint defines the mandatory engineering requirements for any future ADR.

#### Mandatory Architectural Requirements for a Future `PaymentAllocation` Ledger
1. **Immutable Original Payment:** `StudentPayment` remains 100% append-only (`invoice_id` never mutated). Advance payments record `invoice_id = NULL` on creation.
2. **Separate Allocation Records:** Each allocation creates an immutable row in `studently_payment_allocations`:
   - `id` (`UUIDField`, PK)
   - `payment_id` (FK -> `studently_student_payments`, `ON DELETE RESTRICT`)
   - `invoice_id` (FK -> `studently_student_invoices`, `ON DELETE RESTRICT`)
   - `allocated_amount` (`DecimalField(10, 2)`, `CHECK (allocated_amount > 0.00)`)
   - `allocation_type` (`'Allocation'`, `'Deallocation'`) or append-only reversal linkage
   - `allocated_by_user_id` (FK -> `studently_users`, `ON DELETE RESTRICT`)
   - `created_at` (`DateTimeField`)
3. **Many-to-Many Support:** Supports splitting one advance payment across multiple monthly invoices (1-to-N) and combining multiple partial payments toward a single invoice (N-to-1).
4. **Unallocated Payment Ceiling:**
   $$\sum \text{Allocations}(\text{payment } P) \le P.\text{amount\_paid} - \sum \text{Refunds}(P) - \text{Reversal}(P)$$
5. **Invoice Outstanding Balance Ceiling:**
   $$\sum \text{Allocations}(\text{invoice } I) \le I.\text{total\_amount\_due}$$
6. **Cross-Entity Ownership:** Allocation service enforces `payment.student_id == invoice.student_id`.
7. **Refund & Reversal Traceability:** Reversing or refunding an advance payment must verify sufficient *unallocated* credit remains, or atomically post compensatory de-allocation records and recalculate affected invoices.
8. **Transactional Locking & Concurrency:** Allocation transactions must acquire deterministic row locks (`select_for_update()` ordered by entity type: `Student` -> `StudentPayment` -> `StudentInvoice`) inside `transaction.atomic()` to prevent deadlocks and double-allocation races.
9. **Invoice Balance Calculation:** `StudentInvoice.total_amount_paid` is reconciled strictly from net active `PaymentAllocation` records (plus legacy direct invoice payments).
10. **Required Constraints & Indexes:** `CHECK (allocated_amount > 0.00)`, `idx_alloc_payment (payment_id, created_at)`, `idx_alloc_invoice (invoice_id, created_at)`, and MySQL `BEFORE UPDATE` / `BEFORE DELETE` immutability triggers on `studently_payment_allocations`.

---

## 5. Universal Financial Integrity Invariants

The following 10 financial integrity invariants are enforced across all payment operations under Option A:

1. **Mandatory Invoice Presence (Option A):** `if invoice is None: raise ValidationError("An active invoice is required for all new operational payments.")`
2. **Mandatory Cross-Entity Student Ownership:** `if str(invoice.student_id) != str(student.id): raise ValidationError("The selected invoice does not belong to this student.")`
3. **Mandatory Student Association:** `student_id NOT NULL`, `ON DELETE RESTRICT`.
4. **Outstanding Balance Ceiling:** `if amount > (invoice.total_amount_due - invoice.total_amount_paid): raise ValidationError(...)`
5. **Pessimistic Row-Level Locking:** All payment creation, reversal, and refund operations execute inside `transaction.atomic()` using `select_for_update()` on target invoice/payment rows.
6. **Strict Positive Magnitude:** SQL `CHECK (amount_paid > 0.00)` across `Payment`, `Reversal`, and `Refund` records.
7. **Append-Only Immutability:** Updates and deletions on `studently_student_payments` are blocked by ORM `.save()`/`.delete()` overrides (`PermissionDenied`) and MySQL `BEFORE UPDATE`/`BEFORE DELETE` triggers.
8. **100% Full Reversals Only:** Reversals must match `orig.amount_paid` exactly; partial reversals are prohibited.
9. **Mathematical Refund Ceiling:** $\sum \text{Refunds}(P) \le P.\text{amount\_paid} - \text{Reversals}(P)$.
10. **Cancelled Invoice Protection & State Mutex:** Cancelled invoices reject all transactions; `chk_payment_reversal_state` enforces mutually exclusive `transaction_type`, `is_reversal`, and `reversed_payment_id` combinations.

---

## 6. Canonical Persistent Cash Idempotency Strategy (`MEDIUM-02-A`)

### 6.1. Architectural Defect Eliminated
In SQL standard semantics (SQLite and MySQL InnoDB), `NULL != NULL`, so `UNIQUE(payment_method, transaction_ref)` does not prevent duplicate rows if `transaction_ref` is `NULL`. Prior drafts attempted to solve this with conflicting formats (`CSH-<receipt_number>`, `CASH-<STUDENT_ID>-<YYYYMM>-<DAILY_SEQ>`) and a temporary 120-second Redis cache. Those approaches are **permanently retired**:
- A receipt number cannot serve as an idempotency source because it is generated *during* processing (each retry would generate a new receipt number).
- A volatile cache cannot serve as the source of truth because cache expiry, eviction, or process restart breaks idempotency.

### 6.2. Canonical Durable Cash Reference Format
For every new `Cash` payment operation:
1. **Client Supplies `Idempotency-Key`:** The client MUST send an `Idempotency-Key` HTTP header (e.g., a UUIDv4 generated when the payment form/operation is initiated, reused across all retries of that logical submission).
2. **Server Validates `Idempotency-Key`:**
   - Must be present, non-empty after trimming whitespace, between 8 and 255 printable ASCII characters.
   - Missing or malformed keys are rejected with `HTTP 400 Bad Request`.
3. **Server Deterministically Derives `transaction_ref` BEFORE Duplicate Check & Insert:**
   - **Canonical Format:** `CASH-IDEM-<NORMALIZED_IDEMPOTENCY_KEY>`
   - **Exact Normalization Rule:**
     - Strip leading/trailing whitespace: `raw = idempotency_key.strip()`.
     - If `raw` parses as a valid canonical UUID (`uuid.UUID(raw)`), normalize to lowercase hyphenated UUID string (36 chars):
       `CASH-IDEM-<uuid_lower>` -> **46 characters** (e.g., `CASH-IDEM-550e8400-e29b-41d4-a716-446655440000`).
     - For any other valid non-UUID key (8–255 printable ASCII chars), compute lowercase SHA-256 hex digest (64 chars):
       `CASH-IDEM-<sha256_hex>` -> **74 characters**.
   - **Length & Constraint Safety:**
     - Fits comfortably within `StudentPayment.transaction_ref` (`VARCHAR(100)`): max 74 chars for payments, max 78 chars for reversals (`REV-CASH-IDEM-<64>`), and max 82 chars for refunds (`REF-CASH-IDEM-<64>-999`).
     - Deterministic: identical `Idempotency-Key` always produces the exact same `transaction_ref`.
     - Collision-resistant: bijective for UUIDs, 256-bit SHA-256 for arbitrary keys.
     - Payment method remains part of the database uniqueness constraint: `UNIQUE(payment_method, transaction_ref)`.
     - **Key Uniqueness Scope:** `UNIQUE(payment_method, transaction_ref)` enforces a **global scope per payment method** across `studently_student_payments` (not per-user or per-student). No new uniqueness constraint or narrower key scope is introduced under the frozen 20-table schema.
4. **Mobile Money Channels (`ZAAD`, `eDahab`):**
   - External gateway transaction reference (`transaction_ref`, e.g., `ZAAD-884129`) is mandatory (`NOT NULL`, non-blank) and enforced by the same `UNIQUE(payment_method, transaction_ref)` constraint.

### 6.3. Logical Payload Consistency Strategy
When an incoming request matches an existing persisted `StudentPayment` on `(payment_method, transaction_ref)`, the server compares the incoming logical payment tuple against the persisted record:

$$\text{Logical Payload} = (\text{student\_id},\ \text{invoice\_id},\ \text{amount\_paid},\ \text{payment\_method},\ \text{fee\_category},\ \text{month},\ \text{transaction\_type='Payment'})$$

*(Note: STUDENTLY operates in single-currency USD per `SystemSetting`; if multi-currency is introduced in a future phase, `currency` must be added to this comparison tuple.)*

| Scenario | Required System Behavior | HTTP Status |
| :--- | :--- | :---: |
| **Same key + same logical payload** | Return the original persisted `StudentPayment` and original `receipt_number`. Do NOT create a second row or re-credit the invoice. | `200 OK` |
| **Same key + different logical payload** | Reject the request as an idempotency key misuse / conflict. Do NOT create or modify any record. | `409 Conflict` |
| **Different key + same amount** | Treat as a separate logical payment operation, subject to all business validations (including invoice remaining balance ceiling). | `201 Created` (or `400` if exceeds balance) |
| **Concurrent requests with same key** | Only ONE payment row is created; the losing concurrent request observes the committed winning row via the post-invoice-lock current-read duplicate lookup (or recovers from the `UNIQUE(payment_method, transaction_ref)` race via current-read recovery), verifies payload match, and returns the original payment (or `409 Conflict` on mismatch). | `201 Created` (winner) / `200 OK` (loser if match) |
| **Fully paid invoice retry (same key + same payload)** | Even when the first request reduces `remaining_balance` to `$0.00` (`status = 'Paid'`), the retry returns the original payment and receipt because both the initial lookup and the post-invoice-lock current-read lookup execute **before** outstanding-balance validation. | `200 OK` |
| **Retry after cache expiration / eviction** | Persistent database lookup finds the existing `transaction_ref`; returns original payment and original `receipt_number`. | `200 OK` |
| **Retry after server / process restart** | Persistent database lookup finds the existing `transaction_ref`; returns original payment and original `receipt_number`. | `200 OK` |

### 6.4. Concurrency, Post-Lock Current-Read Lookup & MySQL `REPEATABLE READ` Race Recovery
1. **Database Is the Sole Source of Truth:** `UNIQUE(payment_method, transaction_ref)` in `studently_student_payments` is the authoritative durability boundary. Redis/Django cache may optionally be used as a fast-path read optimization, but **MUST NOT** be relied upon for correctness or durability.
2. **Corrected 12-Step Atomic Processing Sequence (`CONC-01` & `CONC-02`):**
   1. Validate inputs (`invoice is not None`, `amount > 0.00`, and validate `Idempotency-Key` for Cash or non-empty `transaction_ref` for ZAAD/eDahab).
   2. Deterministically resolve `resolved_ref` (`CASH-IDEM-<NORMALIZED_IDEMPOTENCY_KEY>` for Cash; trimmed external ref for ZAAD/eDahab) **before** any duplicate lookup or insert.
   3. Compute the canonical logical payload fingerprint `(student_id, invoice_id, amount_paid, payment_method, fee_category, month, 'Payment')`.
   4. Perform the **initial persistent duplicate lookup** (non-locking `SELECT` prior to acquiring the invoice lock).
   5. If an existing payment is found: compare its logical payload with the incoming fingerprint — return `(existing, False)` (`HTTP 200 OK`) if identical, or raise `IdempotencyConflictError` (`HTTP 409 Conflict`) if different.
   6. Begin `with transaction.atomic():`.
   7. Lock the target invoice row using `StudentInvoice.objects.select_for_update().get(id=invoice.id)`.
   8. Validate cross-entity invoice ownership (`str(invoice_obj.student_id) == str(student.id)`).
   9. Perform a **MANDATORY SECOND duplicate lookup** for `(payment_method, resolved_ref)` using a **current/locking read** (`StudentPayment.objects.select_for_update().filter(payment_method=payment_method, transaction_ref=resolved_ref).first()`).
   10. This second lookup **MUST execute BEFORE** invoice status (`Cancelled`/`Paid`) or outstanding-balance calculation and validation. This eliminates the race where a concurrent retry waits on the invoice lock, acquires it after the winning request commits a full payment, observes `remaining_balance == 0`, and erroneously raises a balance `ValidationError` instead of returning the original receipt.
   11. If an existing payment is found in the second lookup: verify the logical payload — return `(existing, False)` (`HTTP 200 OK`) if identical, or raise `IdempotencyConflictError` (`HTTP 409 Conflict`) if different.
   12. Only if no existing payment is found: validate invoice is not `Cancelled`, calculate `remaining_balance`, validate `amount <= remaining_balance`, insert the new `StudentPayment` inside a nested savepoint (`with transaction.atomic():`), reconcile the invoice, and commit the transaction.
3. **MySQL InnoDB `REPEATABLE READ` Current-Read Race Recovery Protocol (`CONC-02`):**
   - **Consistent Read vs. Current/Locking Read:** Under MySQL InnoDB's default `REPEATABLE READ` isolation level (which is preserved unchanged in production), an ordinary `SELECT` is a *consistent non-locking read* that reads from the transaction's earlier MVCC snapshot. If another transaction commits a winning `StudentPayment` row concurrently (for example, two concurrent requests using the same `Idempotency-Key` targeting *different* invoices so they lock different invoice rows), an ordinary `SELECT` inside the losing transaction's `IntegrityError` handler may fail to observe the newly committed winning row.
   - **Nested Savepoint & Current-Read Recovery:**
     1. Wrap `payment.save()` inside an inner `with transaction.atomic():` savepoint.
     2. Catch `IntegrityError as exc` **outside** the failed savepoint so the savepoint rolls back cleanly and the outer transaction remains usable.
     3. Verify that `exc` corresponds specifically to `UNIQUE(payment_method, transaction_ref)` (`unique_payment_method_transaction_ref`). If it does not, **re-raise `exc` immediately**.
     4. Execute a **current/locking read**: `StudentPayment.objects.select_for_update().filter(payment_method=payment_method, transaction_ref=resolved_ref).first()`. Under InnoDB `REPEATABLE READ`, `SELECT ... FOR UPDATE` bypasses the MVCC snapshot and reads the latest committed index record.
     5. Compare the retrieved winning payment's canonical logical payload against the incoming fingerprint: return `(raced_existing, False)` (`HTTP 200 OK`) if identical; raise `IdempotencyConflictError` (`HTTP 409 Conflict`) `from exc` if different.
     6. If no matching payment exists, **re-raise the original `IntegrityError`**. Unrelated database integrity failures (CHECK constraints, FK violations, `unique_receipt_number` collisions) are **never** suppressed.
   - **Invoice Reconciliation Guard:** Increment `invoice.total_amount_paid` and call `reconcile_status()` **only** when the insert succeeds (the single winning request).
4. **Backend-Specific Concurrency Behavior (MySQL InnoDB vs. SQLite):**
   - **MySQL 8.0.16+ (InnoDB, Production & Staging):** Maintains default `REPEATABLE READ` isolation. Both `StudentInvoice.objects.select_for_update()` and `StudentPayment.objects.select_for_update()` emit native `SELECT ... FOR UPDATE` current/locking reads acquiring exclusive `X` index-record locks. `UNIQUE(payment_method, transaction_ref)` remains the ultimate database-level integrity guarantee.
   - **SQLite (v3.35+, Local Development Only):** SQLite does **NOT** support row-level locks or `SELECT ... FOR UPDATE`; Django's SQLite backend compiles `select_for_update()` as a plain `SELECT`. Concurrency in SQLite is serialized via database-wide file locks on writes (`BEGIN IMMEDIATE` / `BEGIN EXCLUSIVE` with `busy_timeout`). SQLite development tests verify functional logic and single-process constraint enforcement, but **do NOT provide MySQL-equivalent row locking or InnoDB `REPEATABLE READ` snapshot semantics** and must NEVER be used to certify MySQL concurrency safety.

### 6.5. Mandatory Phase 3 Automated Concurrency Test Scenarios *(Specification Only — Not Yet Executed)*
The following six automated test scenarios are mandatory for Phase 3 implementation and staging validation against **MySQL 8.0.16+ InnoDB** (not certified by SQLite alone):

- **Test A — Concurrent same-key invoice payment:** Two concurrent requests submit the same `Idempotency-Key` and identical payload for the same invoice. The first commits; the second returns the first payment (`HTTP 200 OK`). Exactly one `StudentPayment` row exists, and both responses return the identical `receipt_number`.
- **Test B — Concurrent same-key, different payload:** Two concurrent requests submit the same `Idempotency-Key` with different amounts or different `invoice_id`s. Exactly one logical payment succeeds; the other receives `HTTP 409 Conflict` (`IdempotencyConflictError`), and no second payment is created.
- **Test C — Fully paid invoice retry:** First request pays the entire remaining invoice balance (reducing balance to `$0.00`, `status = 'Paid'`). Second request retries with the same key and payload (both concurrently while waiting on the invoice lock and sequentially after commit). The second request MUST return the original payment and receipt (`HTTP 200 OK`) and MUST NOT fail with a zero-balance validation error.
- **Test D — MySQL `REPEATABLE READ` unique race:** Two MySQL `REPEATABLE READ` transactions race to insert the same `(payment_method, transaction_ref)`. One commits; the other hits `UNIQUE(payment_method, transaction_ref)` `IntegrityError`, rolls back its inner savepoint, performs a current/locking read (`select_for_update()`), observes the committed winning row, and returns the original receipt on payload match (or `HTTP 409` on mismatch).
- **Test E — Unrelated `IntegrityError`:** Trigger an unrelated integrity failure (e.g., `CHECK` constraint violation, invalid FK, or `unique_receipt_number` collision) inside `process_payment()`. Verify it is NOT mistaken for an idempotency duplicate and that the original `IntegrityError` is re-raised.
- **Test F — SQLite development behavior:** Verify functional idempotency and constraint enforcement in SQLite while explicitly marking MySQL row-locking / `REPEATABLE READ` concurrency tests as MySQL-required so SQLite never falsely certifies MySQL production concurrency behavior.

---

## 7. Reversal and Refund Behavior Matrix (Option A)

| Transaction Type | New & Active Operational Payments (`invoice_id NOT NULL`) | Historical Legacy Migrated Payments Only (`invoice_id = NULL`) |
| :--- | :--- | :--- |
| **Payment** | **Mandatory under Option A.** Increments `invoice.total_amount_paid` and updates `invoice.status` (`Partially Paid` / `Paid`). | **Prohibited for new operational creation.** Exists exclusively from Phase 1 legacy data migration. |
| **Reversal (100% Void)** | Preserves `orig.invoice_id`. Decrements `invoice.total_amount_paid` and recalculates `invoice.status`. `is_reversal=True`, `reversed_payment=orig`. | Preserves `invoice_id = NULL`. Recorded in ledger with `is_reversal=True`, `reversed_payment=orig`. No invoice adjustment. |
| **Refund (Full / Partial)** | Preserves `orig.invoice_id`. Decrements `invoice.total_amount_paid` up to `max_refundable`. `is_reversal=False`, `reversed_payment=orig`. | Preserves `invoice_id = NULL`. Recorded in ledger up to `max_refundable` with `is_reversal=False`, `reversed_payment=orig`. No invoice adjustment. |

---

## 8. Governance Summary

- **Schema Preservation:** Frozen 20-table schema, 32 FKs, 35 CHECK constraints, 17 unique constraints, and 25 declared application indexes remain 100% unchanged.
- **Adopted Policy:** **Option A** (Mandatory Invoice for New Operational Payments) + **Canonical Persistent Cash Idempotency** (`CASH-IDEM-<NORMALIZED_IDEMPOTENCY_KEY>`).
- **Verification Status:** Documentation Corrected & Architecture Specified; Runtime Implementation Not Yet Tested (deferred to Phase 3).
