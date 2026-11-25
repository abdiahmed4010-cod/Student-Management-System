# AL-IMAAMA — Stage 3.10 Pre-Implementation Audit

**Audit date:** 2026-11-24  
**Mode:** Read-only repository and environment audit  
**Disposition:** Stage 3.10 implementation is not authorized by this audit. Stage 3.9 remains pending independent approval.

## 1. Current repository state

- Branch: `main`, tracking `origin/main`.
- The working tree was already extensively modified and had untracked files when this audit began, including the Stage 3.9 implementation report. Those changes were preserved. This audit changed no application source, database schema/data, environment configuration, dependencies, or Git history. This report is the only file created.
- Stage 3.9 has not been independently approved. No Stage 3.10 implementation was started.
- The Django settings load `backend/.env` if present. Its contents were not read during this audit.
- Local read-only checks: `python manage.py check` passed; `python manage.py makemigrations --check --dry-run` reported `No changes detected`; `python manage.py showmigrations --plan` showed every listed migration applied to the configured SQLite database.
- Local environment inspection found SQLite 3.50.4, a MySQL 8.4 client, a running Windows `MySQL84` service, and an open local TCP port 3306. The database server was not authenticated to or queried, so the server version, schema, grants, engine settings, charset, and connectivity with application credentials remain unverified.
- The Python environment has neither `MySQLdb`/mysqlclient nor `mysql.connector` installed.

## 2. Findings by severity

### CRITICAL — MySQL runtime is deliberately disabled

`backend/config/settings.py` raises `ImproperlyConfigured` for `DB_ENGINE=mysql` and defines only the SQLite database backend. There is no MySQL Python driver in `backend/requirements.txt` or the inspected runtime. Therefore the current application cannot start against MySQL. The approved Phase 2 migration plan describes a MySQL configuration, but it does not match current executable settings. Database connection pooling/lifetime, charset/collation, SQL mode, isolation, and environment variable names must be deliberately implemented and validated before a staging run.

### HIGH — MySQL trigger migrations conflict with documented least-privilege grants

`backend/apps/finances/migrations/0002_studentpayment_immutability_triggers.py` creates MySQL `BEFORE UPDATE` and `BEFORE DELETE` triggers. MySQL requires the `TRIGGER` privilege to create them. The project’s `SQLITE_TO_MYSQL_MIGRATION_PLAN.md` grants the migrator DDL privileges but omits `TRIGGER`. MySQL documentation also states trigger creation can require elevated binary logging privileges and trigger activation checks the definer’s privileges. The plan must specify how binary logging policy, `log_bin_trust_function_creators`, migration-time grants, and the lasting trigger definer account will work without granting the runtime account schema administration.

### HIGH — No MySQL runtime or transaction behavior has been certified

All existing database test runs used SQLite. SQLite’s `select_for_update()` does not provide InnoDB row-level locking, MySQL `REPEATABLE READ` visibility, or error codes 1213/1205. No real MySQL schema migration, trigger check, payment concurrency test, deadlock, lock wait timeout, or restore rehearsal was executed. The local server service and open port are not proof of an accessible or correctly provisioned staging schema.

### HIGH — Sequential receipt and invoice numbering have concurrent insert races

`generate_receipt_number()` and `generate_invoice_number()` read the latest sequential number, probe a candidate, and then depend on unique constraints to reject a collision. Generation is not protected by a locked counter row. Payments against different invoices in the same month can race on a receipt number; concurrent invoice generation can race on an invoice number. Unique constraints prevent duplicate persisted identifiers, but these collisions are not handled as a numbered-resource retry or idempotent success path. On MySQL they can surface as an unhandled `IntegrityError`/server error. Concurrent creation and number allocation need explicit test coverage and a design decision before staging sign-off.

### HIGH — Student role isolation is not represented in the current user model

`backend/apps/accounts/models.py` allows only `ADMIN` and `TEACHER`; `VALID_ROLES` and the database role check constraint match those two values. There is no `STUDENT` login role to isolate. Teacher classroom/subject queryset boundaries and finance restrictions are implemented in current views and RBAC, and JWT auth is configured, but a Student authentication isolation requirement cannot be verified until its intended product scope is reconciled with the two-role schema. MySQL migration must not silently widen or weaken this model.

### MEDIUM — MySQL DDL and collation policy is only documented, not active

The architecture documents specify MySQL 8.0.16+ InnoDB, `utf8mb4`, and `utf8mb4_unicode_ci`. Current settings have no MySQL options and MySQL migration execution has not been exercised. The MySQL 8.0.16 minimum is justified: versions before 8.0.16 parsed and ignored `CHECK` constraints; 8.0.16+ enforces them. Django 5.2 documentation supports MySQL 8.0.11+, so the project’s higher minimum comes from its integrity constraints, not Django itself. Require InnoDB for transaction and foreign-key enforcement.

### MEDIUM — SQLite and MySQL immutability migrations intentionally differ

Migration 0002 has SQLite and MySQL update/delete triggers. Migration 0003 installs a `BEFORE INSERT` conflict guard only on SQLite. Its comments explain MySQL `REPLACE` activates delete triggers and `INSERT ... ON DUPLICATE KEY UPDATE` activates update triggers, but that rationale has not been exercised on the project’s MySQL version. Verify both paths with direct SQL in disposable MySQL staging. Model save/queryset guards do not protect arbitrary SQL; production protection depends on MySQL trigger installation and privileges.

### MEDIUM — Backup procedure exists as documentation, with no operational evidence

The migration plan discusses a timestamped SQLite copy, JSON export, a read-only MySQL backup account, checksums, and rollback/data-preservation concerns. No backup automation, verified backup artifact, retention schedule, encryption evidence, or successful restore rehearsal was found in the repository. RPO and RTO are not specified. The plan’s cutover rollback section correctly prohibits restoring a pre-cutover SQLite copy after MySQL has accepted production writes, but no executed recovery runbook establishes recovery time or point.

### MEDIUM — Unpaginated collection endpoints and dashboard query amplification

`REST_FRAMEWORK` does not configure a default pagination class/page size. Several model viewsets expose full querysets, including students, attendance, exams, payments, income, and expenses. Most viewsets use `select_related` or `prefetch_related`, which helps avoid common serializer N+1 patterns. The dashboard metrics code counts students inside a loop over classrooms, producing per-class count queries. Large reports and ledgers need staging query-count, execution-plan, and response-size measurements. Do not add indexes or optimize without those measurements.

### LOW — Build environment can reach a local MySQL listener, but server identity is not verified

The MySQL CLI reports 8.4.13 and the Windows service is running with port 3306 reachable. This indicates a local server candidate for later authorized staging. It does not establish authenticated access, version/configuration, an isolated disposable schema, least-privilege accounts, or permission to modify that server. No connection or mutation was attempted in this audit.

### VERIFIED — Existing migration graph and SQLite migration state are consistent

The read-only Django checks passed, migration dry-run reported no model drift, and `showmigrations --plan` showed all installed migrations applied in order, including accounts 0001–0004 and finances 0001–0003. The repository has no obvious duplicate numbering within an app. Migration dependencies are sequential for the hand-authored finance trigger migrations. This verifies current Django/SQLite migration state only; MySQL DDL compatibility, trigger installation, reversibility, and actual constraint enforcement remain unverified.

### VERIFIED — Finance services contain transaction and ledger safeguards

`process_payment()` requires an invoice, validates a positive Decimal amount, fingerprints the logical payload, checks idempotency before and after locking the invoice, inserts within an inner savepoint, catches only the expected transaction-reference unique collision, and updates invoice totals atomically. `process_payment_with_deadlock_retry()` retries MySQL 1213 outside the atomic block up to three total attempts and converts 1205 to a controlled concurrency error. Reversals/refunds lock the original payment and invoice, enforce positive bounded amounts/reasons, append voucher rows, and reconcile invoice totals. ORM save/queryset guards and database triggers support append-only ledger behavior. These are source-level findings, not MySQL certification.

## 3. MySQL compatibility and migration assessment

- **Target requirement:** MySQL 8.0.16+; InnoDB; Unicode `utf8mb4`. The project design recommends `utf8mb4_unicode_ci`. MySQL 8.0.16+ is required for enforced check constraints.
- **Framework requirement:** Django 5.2 supports MySQL 8.0.11+ and recommends a supported DB-API driver such as mysqlclient. Neither mysqlclient nor Connector/Python is installed/declared in the inspected backend environment.
- **Current settings:** SQLite only. The environment variable `DB_ENGINE=mysql` is expressly rejected. The documentation’s sample MySQL settings and environment names are not wired to the application.
- **Schema:** Models and migrations use UUIDs, decimals, dates/timestamps, `RESTRICT` foreign keys, unique constraints, check constraints, explicit indexes, and portable Django ORM migration operations. MySQL index naming/length limits, SQL mode, FK type compatibility, check-constraint names, and DDL all still need a fresh-database rehearsal.
- **Migration inventory:** `academics.0001`; `accounts.0001`–`0004`; `attendance.0001`; `core.0001`; `examinations.0001`; `finances.0001`–`0003`; `students.0001`. Finance migrations 0002/0003 use `RunPython` with vendor-aware trigger SQL. Migration 0002 is reversible for both engines. Migration 0003 creates/drops only the SQLite insert guard; it is a no-op on MySQL. The current migration graph is consistent on SQLite; no migration was applied in this audit.
- **Foreign keys/constraints:** The models declare database-level `RESTRICT` relationships, uniqueness, and checks. SQLite foreign keys are explicitly enabled by a `connection_created` hook. MySQL requires all tables using these protections to be InnoDB; MyISAM would not enforce transactions/FKs.
- **Transaction behavior:** The business layer uses `transaction.atomic()` and explicit row locks. The service specifically documents MySQL default `REPEATABLE READ` and performs locking/current reads for its idempotency race path. Staging must test the exact planned isolation level and server SQL mode. Do not assume SQLite results transfer.

## 4. Financial integrity and concurrency assessment

- Payment allocation, partial payments, invoice ownership/status/balance validation, logical idempotency, and unique transaction references are enforced in service logic and database constraints.
- Refund/reversal vouchers are append-only and linked to an original payment; partial refunds are bounded by the remaining refundable amount; full reversals match the original amount. Invoice `total_amount_paid` is reduced in the same atomic voucher operation.
- MySQL deadlock and lock-wait handling exists in source. Deadlock retry exhaustion and lock timeout return controlled service errors. Only a real MySQL test can verify driver error extraction, complete rollback, retries on fresh transactions, and row-lock semantics.
- Receipt/invoice sequence generation is the principal source-level concurrency gap: unique constraints prevent corruption, but competing number allocation can fail a valid request. Test with separate database connections and decide whether to implement a locked counter, another atomic allocator, or conflict retry before final sign-off.
- SQLite suites already cover idempotent replay/conflict, invoice balance ceilings, reversal/refund arithmetic, ledger immutability, and payment UI pending/failed confirmation behavior. They do not establish MySQL correctness.

## 5. Authentication, RBAC, and data scope

- `JWTAuthentication` is the configured DRF authenticator; SimpleJWT rotates refresh tokens and blacklists rotated tokens.
- The account model and DB checks permit only `ADMIN` and `TEACHER`; superuser state is restricted to ADMIN. `UserPermission` provides per-module/action capabilities. Teacher-specific hard ceilings and object/queryset scoping exist.
- MySQL does not inherently weaken these application checks, but no MySQL-backed JWT/RBAC suite has run. Repeat API checks against MySQL after migration.
- The Stage 3.10 brief asks for STUDENT isolation, but there is no STUDENT account role in current source. Clarify this product requirement before considering the role coverage complete.

## 6. Backup/recovery and performance readiness

- The repository contains a documented data migration and rollback plan but no operational backup scheduler or tested backup artifact.
- Before deployment, agree explicit RPO/RTO, backup frequency/retention, encryption/key ownership, off-host copy policy, monitoring/alerting, restore authorization, and restore drill evidence. Validate a full backup and restore to an isolated disposable MySQL instance, then compare row counts, foreign-key integrity, checksums/selected ledger totals, triggers, and application health.
- The project’s four-tier database account plan (runtime, migrator, backup, named DBA) is a sound starting point, but the migrator grant set is incomplete for trigger migrations. Confirm trigger privileges and the trigger DEFINER strategy before provisioning.
- Querysets generally include relation loading. No configured pagination was found, and dashboard class counts are repeated queries. Establish a representative data volume and measure endpoint query counts/latency, financial summaries, report export memory/response sizes, and connection usage before making changes.

## 7. Stage 3.10 implementation sequence (proposed, gated)

1. Obtain independent approval of Stage 3.9; confirm no additional user-data changes are pending.
2. Provision a disposable, isolated MySQL 8.0.16+ (prefer currently supported 8.4 LTS) staging instance with InnoDB, strict SQL mode, UTF-8 policy, binary logging policy, and documented isolation level. Record exact server version and variables.
3. Resolve product decisions for STUDENT role scope, database driver/configuration, migration/runtime separation, trigger DEFINER lifetime, trigger privileges, `log_bin_trust_function_creators` policy, and safe sequential receipt/invoice allocation.
4. Configure MySQL via environment-backed settings and a pinned supported DB-API driver. Keep credentials out of the runtime app’s DDL role; document exact environment keys and secret injection.
5. In a disposable empty schema, apply all migrations with the dedicated migration identity. Inspect `SHOW CREATE TABLE`, `INFORMATION_SCHEMA` constraints/indexes/foreign keys, storage engines, charset/collation, and trigger definitions. Verify down/up behavior only in disposable schema.
6. Run database-level invalid-row/constraint tests, all Django tests, JWT/RBAC/academic API tests, and reporting/payment regressions on MySQL.
7. Run two-connection payment idempotency/allocation/refund/reversal races, receipt/invoice number races, 1213 deadlock recovery, 1205 timeout behavior, and direct SQL ledger immutability tests.
8. Exercise full backup and encrypted retention policy, restore to an isolated database, and record measured RPO/RTO evidence and row/integrity comparisons.
9. Run performance/query-count baselines at representative data scale. Record findings and decide whether pagination/index changes are needed.
10. Produce a MySQL staging verification report. Stop and wait for separate approval before any production data migration or cutover.

## 8. Exact files likely to require implementation changes

- `backend/config/settings.py` — backend selection, environment-driven MySQL connection, connection lifetime, SQL mode, charset/collation, and isolation configuration.
- `backend/requirements.txt` — pinned supported MySQL driver.
- `backend/.env.example` — documented MySQL variables without secrets.
- `backend/apps/finances/migrations/0002_studentpayment_immutability_triggers.py` and migration-account runbook — trigger creation/reversal behavior and least-privilege privilege plan.
- `backend/apps/finances/services.py` and finance tests — only if receipt/invoice allocation race plan requires code changes; add MySQL `TransactionTestCase` concurrency coverage.
- `backend/apps/finances/tests.py`, `backend/apps/finances/test_stage37_business_logic.py`, and new MySQL-specific tests — engine-specific constraints, triggers, concurrency, and retry behavior.
- `backend/apps/accounts/models.py`, RBAC/querysets, and account tests — only if the STUDENT role requirement is confirmed; otherwise document the two-role scope.
- `backend/config/settings.py` or individual API viewsets — pagination only if query/load measurements justify it.
- `documentation/phase-2/SQLITE_TO_MYSQL_MIGRATION_PLAN.md` and `documentation/phase-2/MYSQL_DEADLOCK_RETRY_POLICY.md` — reconcile executable settings, privileges, driver, backup RPO/RTO, and staging evidence.
- A CI workflow or dedicated staging verification script may be needed; no existing MySQL integration workflow was found.

## 9. Required environment, privileges, and test evidence

### Database environment

- MySQL 8.0.16+ with all application tables using InnoDB; recommended staging target is a supported MySQL 8.4 LTS release.
- Strict SQL mode; documented `utf8mb4` database/table/connection charset and chosen collation; explicit isolation level; TLS/network restrictions; connection limits sized for worker threads; backups enabled and monitored.
- Pinned supported Django DB driver and documented settings: database name, host, port, runtime username/password, charset, SQL mode, connection lifetime, and isolation. Secrets must be injected from a secret store and must not be logged.
- Separate `studently_app` (runtime DML only), `studently_migrator` (schema migration), `studently_backup` (backup reads/required lock/view permissions), and named human DBA accounts. Grant migration trigger permission only to the migration/trigger-definer identity as justified. Ensure the trigger definer remains valid and authorized after migration. Determine whether the chosen binary logging setup requires an administrator-managed `log_bin_trust_function_creators` policy or another supported privilege arrangement; do not broaden the runtime account.

### Verification plan

| Test | Evidence required | Status |
|---|---|---|
| MySQL connectivity | Authenticated Django connection to isolated staging; record `VERSION()`, engine, SQL mode, charset/collation, isolation, and safe account grants | Not executed; local service/port alone is insufficient |
| Fresh migrations | Empty disposable schema migration log; verify tables, FK, unique/check constraints, indexes, and trigger definitions | Not executed |
| Migration consistency | `makemigrations --check --dry-run`, migration graph, and MySQL migration plan | SQLite-side checks passed; MySQL pending |
| Existing Django suite | Full suite against MySQL staging with result and runtime | SQLite: 104 tests passed in prior Stage 3.9 verification; MySQL not executed |
| Idempotency/concurrent duplicate payment | Separate DB connections, same key/same payload and same key/different payload; one row/receipt, replay success/conflict | MySQL not executed |
| Concurrent payment allocation | Multiple connections on one invoice and different invoices; balance never overpaid, one receipt per persisted payment, race outcomes documented | MySQL not executed |
| Refund/reversal reconciliation | Concurrent partial refunds, reversal/refund exclusion, atomic voucher/invoice totals, valid final financial overview | Sequential SQLite logic tests passed; MySQL not executed |
| Deadlock 1213 | Cause/induce 1213; prove whole transaction rollback, fresh transaction retries, one ledger row, correct response on exhaustion | MySQL not executed |
| Lock timeout 1205 | Controlled lock holder; prove no partial invoice/payment write and controlled 503/idempotent retry behavior | MySQL not executed |
| Ledger immutability | ORM update/delete/bulk/upsert guards plus direct SQL UPDATE/DELETE/REPLACE/upsert; prove deployed MySQL triggers reject prohibited changes | SQLite tests passed; MySQL not executed |
| Authentication/RBAC | JWT access/refresh, admin/superuser, teacher assigned/unassigned class/subject and finance paths; verify role constraints | SQLite/API tests passed; MySQL not executed; STUDENT role absent |
| Attendance/examination integrity | Duplicate attendance, assigned scope, exam/mark FKs/unique/check constraints, Unicode values | SQLite suite passed; MySQL not executed |
| Reporting regression | Existing Stage 3.9 router, analytics, dashboard, CSV, payment UI/sync suites against migrated MySQL-backed API | Frontend suites passed previously; backend-on-MySQL not executed |
| Backup and restore | Encrypted full backup, retention metadata, isolated restore, row count/ledger/constraint/trigger comparisons, measured RPO/RTO | Not executed; policy values missing |
| Performance | Representative row volume, query counts, `EXPLAIN`, list/report memory and timing, connection saturation | Not executed |

## 10. Checks actually executed and checks not executed

**Executed during this audit (read-only):**

- `python manage.py check` — exit 0, “System check identified no issues (0 silenced).”
- `python manage.py makemigrations --check --dry-run` — exit 0, “No changes detected.”
- `python manage.py showmigrations --plan` — exit 0; every listed migration appeared applied in the configured SQLite database.
- Environment inspection: SQLite 3.50.4; local MySQL client 8.4.13; MySQL84 service running; localhost:3306 reachable; MySQL Python drivers absent.

**Previously executed for Stage 3.9 in the immediately preceding work (SQLite/local frontend, not MySQL):**

- `python manage.py test` — 104 tests passed.
- `node tests/reports_router_tests.js` — 9/9 passed.
- `node tests/reporting_analytics_tests.js` — 22/22 passed.
- `node tests/dashboard_api_tests.js` — 3/3 passed.
- `node tests/payment_ui_state_tests.js` — 62/62 passed.
- `node tests/payment_sync_409_tests.js` — 50/50 passed.
- `npm run build` — completed successfully with Vite configuration and large-chunk warnings.

These results verify local behavior and SQLite migration state only. No test requiring an authenticated MySQL database, InnoDB locks, MySQL triggers, concurrent connections, MySQL driver, backup, or restore has been executed.

## 11. Dependencies and blockers

1. **Stage gate:** independent Stage 3.9 review and explicit approval remain required before Stage 3.10 implementation.
2. **Technical:** enable/configure MySQL in Django; add/pin a supported driver; reconcile documented configuration names with settings.
3. **Infrastructure:** identify an isolated disposable MySQL staging database and provide non-production connection credentials/least-privilege identities. Local MySQL service is not yet authenticated or characterized.
4. **Security/operations:** resolve trigger privilege/definer and binary logging policy; define backup RPO/RTO, retention, encryption, restore ownership and evidence.
5. **Financial concurrency:** handle or explicitly accept/retry sequential receipt and invoice number collisions, then verify on multiple MySQL connections.
6. **Product scope:** decide whether Student accounts are part of the target role model or whether Stage 3.10 verification is limited to current ADMIN/TEACHER accounts.

**Final gate:** This report completes the read-only pre-implementation audit only. No implementation or database changes were made. Wait for independent Stage 3.9 approval and explicit authorization before beginning Stage 3.10.

## 12. Authoritative references

- [Django 5.2 database documentation](https://docs.djangoproject.com/en/5.2/ref/databases/) — MySQL support, driver guidance, persistent connections, SQL mode, and isolation notes.
- [MySQL 8.0 CHECK constraints](https://dev.mysql.com/doc/refman/8.0/en/create-table-check-constraints.html) — check constraints were ignored before 8.0.16 and enforced starting with 8.0.16.
- [MySQL 8.4 CREATE TRIGGER](https://dev.mysql.com/doc/refman/8.4/en/create-trigger.html) — trigger privilege and binary logging privilege conditions.
- [MySQL 8.4 InnoDB error handling](https://dev.mysql.com/doc/refman/8.4/en/innodb-error-handling.html) — deadlock and lock wait timeout rollback behavior.
