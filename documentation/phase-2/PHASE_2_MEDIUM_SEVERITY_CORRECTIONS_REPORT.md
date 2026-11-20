# STUDENTLY — Phase 2 Medium-Severity Corrections Report (MEDIUM-01 to MEDIUM-03)

**Document:** `PHASE_2_MEDIUM_SEVERITY_CORRECTIONS_REPORT.md`  
**Phase:** Phase 2 — Database Architecture & Design Final Validation  
**Role:** Senior Database Architect, Django Financial Systems Architect & Database Security Engineer  
**Date:** November 19, 2026  
**Status:** Verification Complete — Submitted for Independent Stakeholder Audit  

---

## 1. Executive Summary & Objective

Following the successful resolution and architectural hardening of the three HIGH-severity findings (HIGH-01, HIGH-02, HIGH-03), an independent audit identified three remaining **MEDIUM-severity findings**:
- **MEDIUM-01:** Database Index Inventory Accuracy (unsupported claim of "94 verified physical indexes" resulting from a raw arithmetic sum of index references).
- **MEDIUM-02:** Invoice-less Payment Policy & Financial Integrity (operational ambiguity regarding `StudentPayment.invoice` nullability, balance impact, cash idempotency, and advance fee allocation).
- **MEDIUM-03:** Database Credentials & Migration Security (use of literal passwords in migration SQL examples, lack of explicit 4-tier account separation, and undocumented ledger trigger boundaries).

This report details the root causes, architectural analyses, exact corrections, before-and-after comparisons, and verification statuses for all three MEDIUM findings.

### Strict Architecture Freeze Preservation
All corrections were performed strictly within the documentation and specification layers without altering the approved baseline:
- Exactly 20 canonical application domain tables.
- Exactly 32 ForeignKey relationships (all with explicit `db_column`).
- Exactly 35 explicit `models.CheckConstraint` declarations.
- Exactly 17 unique constraints.
- Exactly 25 explicit application indexes (18 single-column `db_index=True` + 7 composite `Meta.indexes`).
- Authoritative 14 functional RBAC modules.
- Two database roles: `ADMIN` and `TEACHER` (`chk_user_role`).
- Custom `User` model inheriting from `AbstractBaseUser` without `PermissionsMixin`.
- SQLite 3.35+ in development; MySQL 8.0.16+ InnoDB in production.
- Zero application source code, models, serializers, or migrations were implemented.
- Phase 3 remains locked.

---

## 2. MEDIUM-01 — Database Index Inventory Accuracy

### 2.1. Root Cause & Problem Analysis
Previous documentation asserted that the database contained "94 verified physical indexes," derived from a simple arithmetic sum:
$$20\text{ PK Indexes} + 17\text{ Unique Indexes} + 25\text{ Explicit Application Indexes} + 32\text{ Auto ForeignKey Indexes} = 94\text{ Indexes}$$

#### Architectural Defect:
1. **Conflating References with Physical Indexes:** This theoretical calculation treated every index declaration or expected engine behavior as a distinct physical B-Tree index on disk.
2. **Ignoring Leftmost-Prefix Overlaps:** In MySQL InnoDB, a composite index (e.g. `(user_id, module)` or `(class_id, status)`) automatically satisfies single-column lookups on its leading column (`user_id`, `class_id`). Creating a separate single-column index on that leading column creates a redundant duplicate index structure.
3. **Engine-Level Disparities:** SQLite does not automatically index ForeignKeys; Django ORM migration DDL emits explicit `CREATE INDEX` statements. In MySQL InnoDB, foreign key checks require an index, but an existing composite unique index satisfies this requirement without needing an extra single-column index.
4. **Unsubstantiated Verification Claim:** Claiming "94 verified physical indexes" before running migrations or executing database schema introspection (`SHOW INDEX FROM ...`) was technically inaccurate.

### 2.2. Exact Correction Applied
In [DATABASE_CONSTRAINTS_AND_INDEXES.md](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/DATABASE_CONSTRAINTS_AND_INDEXES.md#L160-L245), Section 6 was completely re-architected into three distinct inventories:

1. **Inventory A — Declared ORM Application Indexes:** Exactly **25 application indexes** explicitly declared in Python model specifications (18 single-column `db_index=True` + 7 composite `class Meta.indexes`).
2. **Inventory B — Database-Generated Indexes (Constraints & ForeignKeys):**
   - 20 Primary Key Indexes (19 UUID + 1 Integer singleton).
   - 17 Unique Constraint Indexes (6 single-column + 11 composite).
   - 32 Theoretical Auto-Generated ForeignKey single-column indexes.
3. **Inventory C — Physical Index Verification & Overlap Analysis:**
   - Identified 13 specific overlapping index locations across tables (such as `user_id` in `UserPermission`, `teacher_id` in assignment tables, `class_id` in `Subject`, `Attendance`, and `Examination`, and `student_id` in `Invoice` and `Payment`).
   - Documented the write-amplification performance cost of redundant indexes on high-throughput tables.
   - Formally updated the governance status of physical indexes to **`NOT VERIFIED`** pending Phase 3 migration generation and database introspection.

---

## 3. MEDIUM-02 — Invoice-less Payment Policy & Financial Integrity

### 3.1. Root Cause & Problem Analysis
In `DJANGO_MODEL_SPECIFICATIONS.md`, `StudentPayment.invoice` is declared as:
```python
invoice = models.ForeignKey(
    StudentInvoice,
    on_delete=models.RESTRICT,
    null=True,
    blank=True,
    related_name='payments',
    db_column='invoice_id'
)
```
While the database schema permitted `NULL`, existing documentation did not establish:
1. Whether invoice-less payments are permitted in operational workflows or exist solely for legacy data migration.
2. How unallocated payments affect invoice balances.
3. How duplicate Cash payments are prevented given that MySQL `UNIQUE(payment_method, transaction_ref)` allows multiple `NULL` values.
4. How reversals and refunds behave when no invoice is attached.

### 3.2. Exact Correction & Deliverables *(Finalized via `PHASE_2_MEDIUM_02_FINAL_RESOLUTION_REPORT.md`)*
> [!NOTE]
> An initial draft of this section classified Option A vs Option B as `PENDING BUSINESS DECISION` and proposed `X-Idempotency-Key` (120s cache) plus `"CSH-" + receipt_number`. Those draft proposals were **superseded** following independent external review (`MEDIUM-02-A` and `MEDIUM-02-B`). The authoritative final resolutions codified across all Phase 2 specifications are summarized below and detailed in [PHASE_2_MEDIUM_02_FINAL_RESOLUTION_REPORT.md](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/PHASE_2_MEDIUM_02_FINAL_RESOLUTION_REPORT.md):

1. **Formal Adoption of Option A (`MEDIUM-02-B`):** [PHASE_2_PAYMENT_POLICY_DECISION.md](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/PHASE_2_PAYMENT_POLICY_DECISION.md) formally adopts **Option A — Invoice Required for New Operational Payments**:
   - Every new operational payment MUST reference an active `StudentInvoice` (`invoice_id NOT NULL` enforced at the DRF serializer and `process_payment()` service layer).
   - `StudentPayment.invoice_id` remains DB-nullable **strictly for historical Phase 1 legacy data migration compatibility**.
   - Existing payments are immutable and MUST NEVER be reassigned (`payment.invoice = new_invoice` is strictly prohibited).
   - **Option B (Unallocated Advance Deposits) is explicitly NOT SUPPORTED under the current frozen 20-table schema** and is documented solely as a future architectural possibility requiring a separate formal ADR and schema revision introducing a durable `PaymentAllocation` ledger table.
2. **Universal Financial Invariants Codified:**
   - Mandatory invoice presence (`if invoice is None: raise ValidationError(...)`).
   - Cross-entity ownership check: `if str(invoice.student_id) != str(student.id): raise ValidationError(...)`.
   - Outstanding balance ceiling: Payment cannot exceed invoice remaining balance.
   - Pessimistic locking: `select_for_update()` inside `transaction.atomic()`.
   - Append-only ledger immutability: Updates/deletions blocked at ORM and SQL trigger levels.
3. **Canonical Persistent Cash Idempotency (`MEDIUM-02-A` — Zero Schema Changes):**
   - **Mobile Money (`ZAAD`, `eDahab`):** Enforced by SQL `UNIQUE(payment_method, transaction_ref)` with mandatory non-null external reference codes.
   - **Cash Remittances (`Cash`):**
     * Client supplies an `Idempotency-Key` header for every new payment operation.
     * Server validates the key and deterministically derives `CASH-IDEM-<NORMALIZED_IDEMPOTENCY_KEY>` (46 chars for UUID; 74 chars SHA-256 hex for arbitrary keys) **before** duplicate checking and insertion, persisting it in `StudentPayment.transaction_ref`.
     * Enforced durably by `UNIQUE(payment_method, transaction_ref)` — survives Redis/cache expiration, eviction, server restarts, and concurrent requests. Receipt numbers are NEVER used as the idempotency source. Redis/Django cache is optional optimization only, never the source of truth.
     * Logical payload comparison returns the original payment/receipt on matching replay (`HTTP 200 OK`) and rejects mismatched payload reuse with `HTTP 409 Conflict`. Concurrent races recover via nested savepoint without suppressing unrelated `IntegrityError` exceptions.

---

## 4. MEDIUM-03 — Database Credentials & Migration Security

### 4.1. Root Cause & Problem Analysis
Previous revisions of `SQLITE_TO_MYSQL_MIGRATION_PLAN.md` contained hardcoded mock credentials in SQL scripts (`'StrongAppRuntimeSecret#2026'`, `'StrongMigratorSecret#2026'`, `'StrongBackupSecret#2026'`) and in bash export commands (`export DB_PASSWORD=StrongMigratorSecret#2026`). Furthermore, the backup account was granted global privileges (`RELOAD`, `REPLICATION CLIENT`) that exceeded least-privilege requirements for standard logical dumps, and the operational boundaries of database triggers were not fully documented.

### 4.2. Exact Correction Applied
1. **Eliminated All Literal Passwords:**
   Replaced all mock credentials with unmistakable uppercase placeholders in [SQLITE_TO_MYSQL_MIGRATION_PLAN.md](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/SQLITE_TO_MYSQL_MIGRATION_PLAN.md#L95-L160):
   ```sql
   CREATE USER 'studently_app'@'<APP_HOST>' IDENTIFIED BY '<RUNTIME_PASSWORD>';
   CREATE USER 'studently_migrator'@'<MIGRATOR_HOST>' IDENTIFIED BY '<MIGRATOR_PASSWORD>';
   CREATE USER 'studently_backup'@'<BACKUP_HOST>' IDENTIFIED BY '<BACKUP_PASSWORD>';
   ```
   and updated bash execution examples to `export DB_PASSWORD="<MIGRATOR_PASSWORD>"`.
2. **Strict Least-Privilege Account Segregation:**
   - `studently_app`: DML only (`SELECT, INSERT, UPDATE, DELETE`) on `studently_db.*`. Strictly no DDL, no GRANT OPTION.
   - `studently_migrator`: DDL + DML on `studently_db.*`. Restricted to CI/CD and deployment maintenance windows.
   - `studently_backup`: Granted strictly database-scoped read privileges: `GRANT SELECT, LOCK TABLES, SHOW VIEW ON studently_db.*`. Removed unnecessary global replication grants.
   - Human Database Administrator (`dba_<username>`): Distinct named human accounts with MFA and audit logging.
3. **Credential Management Standards:**
   - Documented runtime secret injection via Key Vaults (HashiCorp Vault, AWS Secrets Manager, Azure Key Vault).
   - Documented dev/staging/prod credential isolation.
   - Documented 90-day dual-user rotation protocol.
   - Documented private VPC CIDR host bindings (`<APP_HOST>`, `<MIGRATOR_HOST>`).
   - Documented connection string masking in Django logging and error trackers.
4. **Financial Ledger Trigger Architecture & Realistic Limitations:**
   - Detailed `trg_studently_payments_no_update` and `trg_studently_payments_no_delete` intercepting SQL `UPDATE`/`DELETE` on `studently_student_payments` with `SQLSTATE '45000'`.
   - Documented migration deployment via Django `migrations.RunSQL`.
   - Documented emergency maintenance procedures requiring elevated audited DBA sessions.
   - Documented SQLite development equivalents (ORM `.save()` and `.delete()` overrides).
   - Documented relational protection via `on_delete=models.RESTRICT` preventing cascade deletes.
   - Formally acknowledged that **triggers do NOT provide absolute protection against root/privileged database administrators** (`SUPER` / `SYSTEM_USER`).

---

## 5. Documents Inspected & Synchronized

All **18 Phase 2 Markdown documents** in `documentation/phase-2/` (the 17 documents present at the conclusion of the MEDIUM-01 to MEDIUM-03 pass plus Deliverable #18, `PHASE_2_MEDIUM_02_FINAL_RESOLUTION_REPORT.md`, added during final targeted reconciliation — correcting an earlier prose typo that stated "16") were reviewed, updated, and cross-reconciled:

| # | Document | Modifications Made | Status |
| :-: | :--- | :--- | :---: |
| 1 | `DATABASE_ARCHITECTURE.md` | Reconciled index inventory to 25 application indexes; clarified physical index verification status; codified Option A and durable `CASH-IDEM-<NORMALIZED_IDEMPOTENCY_KEY>` idempotency. | **SYNCHRONIZED** |
| 2 | `DATABASE_CONSTRAINTS_AND_INDEXES.md` | Re-architected Section 6 into 3-tier index classification; added index overlap matrix; marked physical index count as `NOT VERIFIED`; codified Option A and durable cash idempotency. | **SYNCHRONIZED** |
| 3 | `DATABASE_ERD.md` | Verified 20 entities, 32 FKs, and `invoice_id` DB-nullable legacy compatibility vs Option A operational requirement. | **SYNCHRONIZED** |
| 4 | `DATA_DICTIONARY.md` | Verified 20 tables, `char(32)` UUID storage, Option A mandatory operational invoice rule, and `CASH-IDEM-<NORMALIZED_IDEMPOTENCY_KEY>` format. | **SYNCHRONIZED** |
| 5 | `DJANGO_MODEL_SPECIFICATIONS.md` | Verified fail-closed RBAC, `StudentPayment` model, and updated `process_payment()` with Option A mandatory invoice, `derive_cash_transaction_ref()`, payload comparison, and savepoint race recovery. | **SYNCHRONIZED** |
| 6 | `PHASE_2_CORRECTIONS.md` | Appended Amendments 32 (MEDIUM-01), 33 (MEDIUM-02, superseded notes marked), 34 (MEDIUM-03), and 35 (MEDIUM-02-A, MEDIUM-02-B, and 18-document inventory reconciliation). | **SYNCHRONIZED** |
| 7 | `PHASE_2_FINAL_CORRECTION_REPORT.md` | Preserved baseline; cross-referenced index and payment items. | **SYNCHRONIZED** |
| 8 | `PHASE_2_FINAL_REVIEW.md` | Reconciled index inventory counts; updated physical verification status. | **SYNCHRONIZED** |
| 9 | `PHASE_2_FINAL_SCHEMA_CONSISTENCY_MATRIX.md` | Updated index matrix (25 declared / physical `NOT VERIFIED`), `process_payment()` pseudocode (Option A + durable cash idempotency), and 18-document inventory status. | **SYNCHRONIZED** |
| 10 | `PHASE_2_INDEPENDENT_AUDIT_CORRECTIONS.md` | Synchronized least-privilege credentials and ledger trigger boundaries. | **SYNCHRONIZED** |
| 11 | `PHASE_2_SIGNOFF_CHECKLIST.md` | Updated Categories 4, 5, 8, and 9 with MEDIUM-01/02-A/02-B/03 resolutions; updated complete documentation suite to 18 Markdown documents. | **SYNCHRONIZED** |
| 12 | `SQLITE_TO_MYSQL_MIGRATION_PLAN.md` | Replaced mock passwords with placeholders; refined least-privilege backup grants; documented trigger boundaries. | **SYNCHRONIZED** |
| 13 | `PHASE_2_TARGETED_CORRECTIONS_REPORT.md` | Preserved historical audit trace. | **SYNCHRONIZED** |
| 14 | `PHASE_2_FINAL_INDEPENDENT_AUDIT_REPORT.md` | Updated audit findings register with MEDIUM-01, MEDIUM-02-A, MEDIUM-02-B, and MEDIUM-03 resolutions; updated document inventory to 18 Markdown documents. | **SYNCHRONIZED** |
| 15 | `PHASE_2_HIGH_SEVERITY_CORRECTIONS_REPORT.md` | Preserved complete HIGH-01, HIGH-02, and HIGH-03 audit records. | **SYNCHRONIZED** |
| 16 | `PHASE_2_PAYMENT_POLICY_DECISION.md` | Formally adopted **Option A**; explicitly documented **Option B as NOT SUPPORTED** under frozen 20-table schema (+ future `PaymentAllocation` ADR blueprint); codified canonical `CASH-IDEM-<NORMALIZED_IDEMPOTENCY_KEY>` idempotency. | **SYNCHRONIZED** |
| 17 | `PHASE_2_MEDIUM_SEVERITY_CORRECTIONS_REPORT.md` | Comprehensive resolution report for MEDIUM-01, MEDIUM-02, and MEDIUM-03 (inventory count corrected and superseded MEDIUM-02 draft details reconciled). | **SYNCHRONIZED** |
| 18 | `PHASE_2_MEDIUM_02_FINAL_RESOLUTION_REPORT.md` | **New Deliverable:** Final targeted resolution report closing MEDIUM-02-A (durable cash idempotency), MEDIUM-02-B (Option A adoption & Option B exclusion), and document inventory count reconciliation. | **SYNCHRONIZED** |

---

## 6. Verification Status & Remaining Business Decisions

### 6.1. Verification Status Summary
- **MEDIUM-01 (Index Inventory Accuracy):** **`DOCUMENTATION CORRECTED / ARCHITECTURE SPECIFIED`** (3-tier index classification; 25 declared application indexes) / **`NOT VERIFIED`** (Physical index count on disk pending Phase 3 schema introspection).
- **MEDIUM-02 (Cash Idempotency & Payment Allocation):** **`DOCUMENTATION CORRECTED / ARCHITECTURE SPECIFIED`** (Option A formally adopted; Option B explicitly unsupported under frozen 20-table schema; canonical `CASH-IDEM-<NORMALIZED_IDEMPOTENCY_KEY>` durable idempotency codified) / **`RUNTIME IMPLEMENTATION NOT YET TESTED`** (deferred to Phase 3).
- **MEDIUM-03 (Database Credentials & Migration Security):** **`DOCUMENTATION CORRECTED / ARCHITECTURE SPECIFIED`** (All literal passwords replaced with placeholders; 4-tier account model codified; trigger boundaries documented).

### 6.2. Remaining Open Institutional Business Decisions (3 Items)
*(Note: Invoice-less Payment Operational Workflow is NO LONGER pending — **Option A** has been formally adopted to preserve the frozen 20-table immutable ledger.)*
1. **Tuition Discount & Scholarship Accounting Treatment:** Direct invoice deduction vs. institutional scholarship credit vouchers.
2. **Electronic Voucher Re-submission Window:** Strict prohibition against reusing transaction references vs. privileged administrative reassignment.
3. **Historical Academic Year Archival Strategy:** In-place soft retention vs. cold table partitioning after 5 years.

---

## 7. Conclusion

All three MEDIUM findings — including the follow-up external review corrections `MEDIUM-02-A`, `MEDIUM-02-B`, and the document inventory reconciliation — have been resolved with architectural rigor while preserving the frozen 20-table schema.

**Governance Status:** **CONDITIONALLY APPROVED — AWAITING INDEPENDENT EXTERNAL RE-VALIDATION** (Phase 3 remains locked).
