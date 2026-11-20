# STUDENTLY — Phase 2 Final Targeted Resolution Report (`MEDIUM-02-A`, `MEDIUM-02-B` & Document Inventory)

**Document:** `PHASE_2_MEDIUM_02_FINAL_RESOLUTION_REPORT.md`  
**Phase:** Phase 2 — Final Database Architecture Validation  
**Roles:** Principal Database Architect, Senior Django Financial Systems Architect, Payment Ledger Security Engineer & Technical Documentation Auditor  
**Date:** November 19, 2026  
**Final Governance Status:** **CONDITIONALLY APPROVED — AWAITING INDEPENDENT EXTERNAL RE-VALIDATION**  

---

## 1. Executive Summary

Following an independent external review of the Phase 2 documentation package, two technical defects under `MEDIUM-02` and one documentation inventory count discrepancy were identified. This report documents the root causes, canonical technical decisions, exact specification corrections, cross-document consistency validation, remaining limitations, and strict verification status across all **18 Phase 2 Markdown documents**.

### Strict Architecture Freeze Preserved
- **20 canonical application domain tables** (no table added or removed).
- **32 ForeignKey relationships** (all with explicit `db_column`).
- **35 explicit `models.CheckConstraint` declarations**.
- **17 unique constraints** (6 single-column + 11 composite).
- **25 explicit application indexes** (18 `db_index=True` + 7 composite `Meta.indexes`); physical index count remains `NOT VERIFIED` pending Phase 3 schema introspection.
- Zero application source code, Django migrations, or frontend files modified. Phase 3 remains strictly locked.

---

## 2. Original Defects & Root Causes

### 2.1. Defect `MEDIUM-02-A` — Non-Durable & Conflicting Cash Payment Idempotency
- **Original Defect:**
  - Documentation contained three conflicting cash idempotency mechanisms across files: `CSH-<receipt_number>`, `CASH-<STUDENT_ID>-<YYYYMM>-<DAILY_SEQ>`, and a volatile 120-second Redis/Django cache key (`X-Idempotency-Key`).
  - `process_payment()` generated `receipt_number` separately during execution and accepted `transaction_ref` as a raw input without deriving a deterministic cash reference prior to duplicate checking.
- **Root Cause:**
  - Relying on a server-generated `receipt_number` cannot establish idempotency because each retry generates a brand-new receipt number.
  - Relying on Redis/Django cache (120-second TTL) as the idempotency source of truth fails under cache expiration, eviction, process restarts, or simultaneous concurrent requests — allowing duplicate cash payments and double-credited invoices.

### 2.2. Defect `MEDIUM-02-B` — Payment Allocation Contradiction & Unsupported Option B Claim
- **Original Defect:**
  - `PHASE_2_PAYMENT_POLICY_DECISION.md` proposed mutating an existing payment (`payment.invoice = new_invoice`) to allocate an unallocated advance deposit to a future invoice under Option B, and claimed Option B was 100% compatible with the frozen 20-table schema requiring zero DDL changes.
- **Root Cause:**
  - `StudentPayment` is an append-only immutable ledger protected by `StudentPayment.save()` (`PermissionDenied` on updates) and MySQL `BEFORE UPDATE` trigger `trg_studently_payments_no_update`. Executing `payment.invoice = new_invoice` is architecturally impossible without breaking ledger immutability.
  - The frozen 20-table schema contains no `PaymentAllocation`, `payment_allocation`, or `advance_credit` table capable of durably recording partial or multi-invoice allocations against an immutable advance payment.

### 2.3. Defect `DOC-INV-01` — Document Inventory Count Discrepancy
- **Original Defect:**
  - `PHASE_2_MEDIUM_SEVERITY_CORRECTIONS_REPORT.md` stated *"All 16 specification files in `documentation/phase-2/`"* while listing 17 files in its own table; `PHASE_2_FINAL_INDEPENDENT_AUDIT_REPORT.md` and `PHASE_2_FINAL_SCHEMA_CONSISTENCY_MATRIX.md` also contained legacy references to 12 or 17 files.
- **Root Cause:**
  - Incremental documentation passes appended new reports without re-synchronizing every prose counter across the suite.

---

## 3. Canonical Technical Decisions & Exact Corrections Made

### 3.1. `MEDIUM-02-A` — One Canonical Persistent Cash Idempotency Strategy
1. **Client Contract:** Every new `Cash` payment request MUST include an `Idempotency-Key` header (8–255 printable ASCII characters, e.g., UUIDv4 generated on operation start and reused across retries).
2. **Deterministic Reference Derivation (Before Duplicate Check & Insert):**
   - Canonical format: **`CASH-IDEM-<NORMALIZED_IDEMPOTENCY_KEY>`**
   - Exact normalization:
     - Trim whitespace (`raw = idempotency_key.strip()`).
     - If `raw` parses as a valid UUID (`uuid.UUID(raw)`), normalize to lowercase canonical UUID (36 chars) -> `CASH-IDEM-<uuid_lower>` (**46 characters**).
     - Otherwise, compute lowercase SHA-256 hex digest (64 chars) -> `CASH-IDEM-<sha256_hex>` (**74 characters**).
   - Fits comfortably within `StudentPayment.transaction_ref VARCHAR(100)` including `REV-` (max 78 chars) and `REF-...-999` (max 82 chars) suffixes.
   - Receipt numbers are **NEVER** used as the idempotency source.
3. **Database Durability as Source of Truth:**
   - Persisted in `StudentPayment.transaction_ref` and enforced by `UNIQUE(payment_method, transaction_ref)`.
   - Survives Redis/cache expiration, cache eviction, process restarts, and concurrent requests. Redis/Django cache may remain solely as an optional fast-path optimization, **NEVER** as the source of truth.
4. **Logical Payload Consistency Comparison:**
   - Logical tuple compared: `(student_id, invoice_id, amount_paid, payment_method, fee_category, month, transaction_type='Payment')`.
   - **Same key + same logical payload** -> Return original persisted `StudentPayment` and original `receipt_number` (`HTTP 200 OK`).
   - **Same key + different logical payload** -> Reject with `IdempotencyConflictError` (`HTTP 409 Conflict`).
   - **Different key + same amount** -> Treated as a separate logical operation, subject to remaining invoice balance validation.
5. **Concurrent Race Recovery (`process_payment()`):** *(Historical record — subsequently hardened by `PHASE_2_CONCURRENCY_CORRECTIONS_REPORT.md` / Amendment 36 (`CONC-01` & `CONC-02`))*
   - *(Superseded by Amendment 36)* Initially executed a single persistent pre-check before locking `StudentInvoice.objects.select_for_update()`, followed by an ordinary snapshot `SELECT` inside the `except IntegrityError` block.
   - **Active Specification (see `DJANGO_MODEL_SPECIFICATIONS.md` & `PHASE_2_CONCURRENCY_CORRECTIONS_REPORT.md`):** Now performs an initial lookup before locking, a **mandatory second current-read duplicate lookup** (`StudentPayment.objects.select_for_update()`) immediately after acquiring the invoice lock and validating ownership (strictly **before** balance validation), and verifies `UNIQUE(payment_method, transaction_ref)` before executing a **current/locking read** (`select_for_update()`) inside the post-savepoint `IntegrityError` recovery handler under MySQL InnoDB `REPEATABLE READ`.

### 3.2. `MEDIUM-02-B` — Formal Adoption of Option A & Explicit Option B Exclusion
1. **Adopted Policy:** **OPTION A — Invoice Required for New Operational Payments** is formally adopted across all Phase 2 specifications.
2. **Clear Layer Distinction:**
   - **Database Layer (`studently_student_payments.invoice_id`):** Remains `null=True, blank=True` **strictly for historical Phase 1 legacy data migration compatibility** (zero DDL changes to the 20-table schema).
   - **Application / API Layer (`PaymentSerializer` & `process_payment()`):** Enforces `invoice NOT NULL` unconditionally for all new operational payments.
3. **Immutability Preserved:** Existing `StudentPayment` records can NEVER be reassigned (`payment.invoice = new_invoice` is permanently retracted and blocked by ORM + MySQL triggers). Reversals and refunds preserve the original payment's `invoice_id`.
4. **Option B Status:** Explicitly documented as **NOT SUPPORTED UNDER THE CURRENT FROZEN 20-TABLE SCHEMA**. Documented solely as a future architectural blueprint requiring a separate formal ADR and schema revision adding a durable `PaymentAllocation` ledger table (immutable original payment, separate allocation rows, 1-to-N / N-to-1 support, unallocated & invoice balance caps, refund/reversal traceability, deterministic lock ordering, allocation-derived invoice balances, constraints, and indexes).

### 3.3. Document Inventory Reconciliation
- Reconciled actual contents of `documentation/phase-2/`: **18 Markdown documents** (the 17 existing Phase 2 documents + this mandated `PHASE_2_MEDIUM_02_FINAL_RESOLUTION_REPORT.md`).
- Corrected the erroneous "16" prose count in `PHASE_2_MEDIUM_SEVERITY_CORRECTIONS_REPORT.md` and synchronized all active counts across `PHASE_2_SIGNOFF_CHECKLIST.md`, `PHASE_2_FINAL_INDEPENDENT_AUDIT_REPORT.md`, and `PHASE_2_FINAL_SCHEMA_CONSISTENCY_MATRIX.md`.

---

## 4. Before-and-After Policy Comparison

| Dimension | Before Correction (Defective Draft) | After Correction (Canonical Phase 2 Spec) |
| :--- | :--- | :--- |
| **Cash Reference Format** | Conflicting: `CSH-<receipt_number>` vs `CASH-<STUDENT_ID>-<YYYYMM>-<DAILY_SEQ>` | Single canonical format: `CASH-IDEM-<NORMALIZED_IDEMPOTENCY_KEY>` (46 or 74 chars <= 100) |
| **Idempotency Source of Truth** | Volatile 120-second Redis/Django cache (`X-Idempotency-Key`) + post-hoc receipt number | Durable database constraint `UNIQUE(payment_method, transaction_ref)`; cache optional only |
| **Derivation Timing** | Receipt number generated during insert; `transaction_ref` passed as raw input | Deterministic reference derived from `Idempotency-Key` **before** duplicate lookup & insert |
| **Key Reuse w/ Different Payload** | Undefined | Rejected with `IdempotencyConflictError` (`HTTP 409 Conflict`) |
| **Concurrent Race Handling** | Unhandled unique collision / potential double credit | Nested savepoint (`transaction.atomic()`) catches race, verifies payload, re-raises unrelated `IntegrityError` |
| **Operational Invoice Policy** | `PENDING BUSINESS DECISION` (Option A vs Option B) | **OPTION A FORMALLY ADOPTED** (invoice mandatory for all new operational payments) |
| **Nullable `invoice_id` Role** | Ambiguous (legacy + live unallocated payments) | Strictly reserved for historical Phase 1 legacy migration compatibility only |
| **Option B Support** | Claimed 100% compatible with zero DDL via `payment.invoice = new_invoice` | **NOT SUPPORTED under frozen 20-table schema**; requires future ADR + `PaymentAllocation` table |
| **Document Inventory Count** | Inconsistent (12, 16, and 17 across reports) | Reconciled to exact on-disk count: **18 Phase 2 Markdown documents** |

---

## 5. Files Changed

The following 11 Phase 2 Markdown documents were updated or created in this targeted resolution:

1. [`PHASE_2_PAYMENT_POLICY_DECISION.md`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/PHASE_2_PAYMENT_POLICY_DECISION.md) — Adopted Option A, excluded Option B under frozen schema (+ future `PaymentAllocation` ADR blueprint), codified `CASH-IDEM-<NORMALIZED_IDEMPOTENCY_KEY>` durable idempotency & 6-scenario consistency matrix.
2. [`DJANGO_MODEL_SPECIFICATIONS.md`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/DJANGO_MODEL_SPECIFICATIONS.md) — Clarified `StudentPayment.invoice` & `transaction_ref`; rewrote `process_payment()` with Option A validation, `derive_cash_transaction_ref()`, `_matches_logical_payment_payload()`, `IdempotencyConflictError`, and savepoint race recovery.
3. [`DATABASE_ARCHITECTURE.md`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/DATABASE_ARCHITECTURE.md) — Synchronized Section 3.8 payment rules with Option A and durable cash idempotency.
4. [`DATA_DICTIONARY.md`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/DATA_DICTIONARY.md) — Updated Table 2.17 `invoice_id`, `transaction_ref`, and financial invariants bullets.
5. [`DATABASE_CONSTRAINTS_AND_INDEXES.md`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/DATABASE_CONSTRAINTS_AND_INDEXES.md) — Updated Section 7.1 rules 4 and 9 for Option A and canonical cash idempotency.
6. [`DATABASE_ERD.md`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/DATABASE_ERD.md) — Clarified Relationship #27 (`studently_student_payments.invoice_id`) legacy DB-nullability vs Option A operational enforcement.
7. [`PHASE_2_CORRECTIONS.md`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/PHASE_2_CORRECTIONS.md) — Labelled historical superseded notes in Amendments 6 & 33; appended Amendment 35.
8. [`PHASE_2_FINAL_SCHEMA_CONSISTENCY_MATRIX.md`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/PHASE_2_FINAL_SCHEMA_CONSISTENCY_MATRIX.md) — Synchronized `process_payment()` pseudocode, index/payment summary rows, and 18-document status.
9. [`PHASE_2_MEDIUM_SEVERITY_CORRECTIONS_REPORT.md`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/PHASE_2_MEDIUM_SEVERITY_CORRECTIONS_REPORT.md) — Fixed "16" inventory count defect, reconciled superseded MEDIUM-02 draft statements, updated inventory table to 18 documents.
10. [`PHASE_2_FINAL_INDEPENDENT_AUDIT_REPORT.md`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/PHASE_2_FINAL_INDEPENDENT_AUDIT_REPORT.md) — Updated Document Inventory (18 files), Finding MEDIUM-02 (`MEDIUM-02-A`/`B`), Section 7 open decisions (3 remaining), and Section 8 status.
11. [`PHASE_2_SIGNOFF_CHECKLIST.md`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/PHASE_2_SIGNOFF_CHECKLIST.md) — Updated Categories 5 & 9, complete documentation suite (18 files), and sign-off status.
12. [`PHASE_2_MEDIUM_02_FINAL_RESOLUTION_REPORT.md`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/PHASE_2_MEDIUM_02_FINAL_RESOLUTION_REPORT.md) — *(New Deliverable)* This resolution report.

*(Historical reports `PHASE_2_FINAL_CORRECTION_REPORT.md`, `PHASE_2_FINAL_REVIEW.md`, `PHASE_2_INDEPENDENT_AUDIT_CORRECTIONS.md`, `PHASE_2_TARGETED_CORRECTIONS_REPORT.md`, `PHASE_2_HIGH_SEVERITY_CORRECTIONS_REPORT.md`, and `SQLITE_TO_MYSQL_MIGRATION_PLAN.md` were preserved intact without removing historical audit records.)*

---

## 6. Cross-Document Consistency Validation Results

Automated cross-document auditing across all **18 Markdown files** in `documentation/phase-2/` confirmed:
- **Cash Idempotency:** Exactly ONE active canonical cash reference format (`CASH-IDEM-<NORMALIZED_IDEMPOTENCY_KEY>`) exists across all active specifications. All legacy references to `CSH-<receipt_number>`, `CSH-REC-XXXX`, or `DAILY_SEQ` are either removed from active specs or explicitly labelled as superseded historical notes.
- **Payment Allocation:** Option A is uniformly adopted across all active specifications; Option B is uniformly documented as unsupported under the frozen 20-table schema; zero active claims of `payment.invoice = new_invoice` or "Option B requires zero DDL" remain.
- **Schema Freeze:** Canonical table count remains strictly **20 application tables** across ERD, Data Dictionary, Django Model Specifications, Constraints & Indexes, and Consistency Matrix.
- **Documentation Inventory:** Exactly **18 Markdown files** exist on disk under `documentation/phase-2/` and inside `STUDENTLY_PHASE_2_MEDIUM_02_CORRECTED.zip`, matching every active inventory table.

---

## 7. Remaining Limitations & Deferred Items

1. **Future Advance Payments (Option B):** Unallocated advance deposits spanning multiple future invoices are not supported under the current 20-table schema. Supporting them in the future requires a formal ADR and schema migration adding a `PaymentAllocation` ledger table.
2. **Physical Database Indexes (`MEDIUM-01`):** Exact physical on-disk index count remains `NOT VERIFIED` until Django migrations are generated and `SHOW INDEX` introspection is run in Phase 3.
3. **Runtime & Concurrency Verification:** Unit tests, integration tests, concurrent idempotency race tests, and MySQL trigger enforcement tests have **NOT** been executed in Phase 2 due to the strict no-code-implementation boundary.
4. **Remaining Open Institutional Business Decisions (3 Non-Blocking Items):**
   - Tuition scholarship accounting treatment (direct invoice deduction vs. scholarship credit vouchers).
   - Electronic payment voucher re-submission / expiration window policy.
   - Historical academic year archival strategy (in-place soft retention vs. cold partitioning).

---

## 8. Verification Status Distinction

| Verification Dimension | Status | Scope & Evidence |
| :--- | :---: | :--- |
| **Documentation Corrected** | **COMPLETE** | All conflicting active statements removed or labelled historical across all 18 Markdown files; inventory counts reconciled. |
| **Architecture Specified** | **COMPLETE** | Deterministic `CASH-IDEM-<NORMALIZED_IDEMPOTENCY_KEY>` idempotency, savepoint race recovery, Option A enforcement, and future `PaymentAllocation` ADR blueprint fully specified. |
| **Runtime Implementation Tested** | **NOT YET TESTED** | No Django source code, migrations, or test suites were created or executed (deferred to Phase 3 per governance boundary). |

---

**FINAL STATUS: CONDITIONALLY APPROVED — AWAITING INDEPENDENT EXTERNAL RE-VALIDATION**  
*(No self-certification is claimed. Phase 3 remains strictly locked pending fresh independent external review.)*
