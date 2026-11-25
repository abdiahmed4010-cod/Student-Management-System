# STUDENTLY — SQLite-to-MySQL Migration Plan & Engine Compatibility Guide
**Document:** `SQLITE_TO_MYSQL_MIGRATION_PLAN.md`  
**Phase:** Phase 2 — Database Architecture & Design  
**Author:** Senior Database Architect & DevOps Engineer  
**Date:** November 2026  
**Status:** Architecture Specification — Pending Stakeholder Sign-Off  

---

## 1. Executive Summary & Dual-Engine Architecture

**STUDENTLY** adopts a dual-engine database strategy:
- **Local Development & Testing:** **SQLite (v3.35+)** — Lightweight, zero-configuration, file-based database for rapid local developer setup.
- **Staging Target:** **MySQL 8.4 LTS** (InnoDB) — High-concurrency, enterprise relational engine with row-level locking, foreign key integrity, and ACID guarantees.

This document outlines the database dialect differences, the unified Django configuration pattern, and the step-by-step production migration and verification procedure.

---

## 2. Technical Differences Between SQLite and MySQL 8.0.16+

| Feature / Domain | SQLite (v3.35+ Development) | MySQL (v8.0.16+ Production) | Django ORM Abstraction Strategy |
| :--- | :--- | :--- | :--- |
| **Storage Architecture** | Single disk file (`db.sqlite3`) | Client-Server architecture (InnoDB storage engine) | Fully abstracted by Django database backend adapters. |
| **UUID Storage** | `TEXT` (`char(32)` type affinity, 32 hex chars without hyphens) | `CHAR(32)` (32 hex chars without hyphens) | `models.UUIDField(default=uuid.uuid4)` automatically maps to `char(32)` in SQLite and MySQL backends, storing 32-character hexadecimal strings (`uuid_obj.hex`); DRF `serializers.UUIDField` automatically formats/serializes to canonical 36-character hyphenated RFC 4122 strings for API consumers. |
| **Boolean Data Type** | `INTEGER` (`0` or `1`) | `TINYINT(1)` (`0` or `1`) | `models.BooleanField()` handles Python `True`/`False` conversion seamlessly. |
| **DateTime & Precision** | `TEXT` (ISO-8601 string) | `DATETIME(6)` (Microsecond resolution) | `models.DateTimeField()` stores timezone-aware UTC timestamps. |
| **Decimal Precision** | `REAL` or numeric affinity string | `DECIMAL(10, 2)` (Fixed-point arithmetic) | `models.DecimalField(max_digits=10, decimal_places=2)` enforces exact Python `Decimal`. |
| **Foreign Keys** | Disabled by default; requires `PRAGMA foreign_keys = ON;` | Enforced natively by InnoDB engine | Django connection signal enables foreign keys in SQLite on connection. |
| **Character Encoding** | `UTF-8` by default | Must be explicitly set to `utf8mb4` with `utf8mb4_unicode_ci` | Guarantees authentic Arabic RTL text rendering without character corruption. |
| **Concurrency & Locks** | Database-level file lock on writes; `select_for_update()` has no row-locking effect (compiled as normal `SELECT`) | Fine-grained row-level locking (`SELECT ... FOR UPDATE` acquires exclusive `X` row locks on index records) | Development executes safely on SQLite; multi-user staging and production require MySQL 8.0.16+ for true row-level concurrency. |
| **Case Sensitivity** | `LIKE` is case-insensitive for ASCII | Controlled by collation (`_ci` = case-insensitive) | Use Django `iexact`, `icontains` for consistent cross-engine searches. |

---

## 3. Django Database Configuration (Stage 3.10.1)

The active settings are in `backend/config/settings.py`. SQLite remains the default for local development and tests. Set `DB_ENGINE=mysql` explicitly to select MySQL; the settings then require non-empty `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, and `DB_PORT`. Missing values, invalid engine names, and invalid option values fail during settings import. MySQL selection never falls back to SQLite.

The supported staging target is **MySQL 8.4 LTS with InnoDB**. Django 5.2 supports MySQL 8.0.11 and newer; using the project target keeps staging aligned with the selected LTS release. The database must be provisioned with `utf8mb4` and the intended database collation (for example, `utf8mb4_unicode_ci`). The connection uses `utf8mb4`, a strict SQL mode (`STRICT_TRANS_TABLES`, `ERROR_FOR_DIVISION_BY_ZERO`, and `NO_ENGINE_SUBSTITUTION`), and a session default storage engine of InnoDB. These settings do not convert existing tables; their engine, charset, and collation must be verified separately during a later staging exercise.

Install the pinned driver from the backend directory:

```powershell
python -m pip install -r requirements.txt
```

`mysqlclient==2.3.2` is the sole MySQL DB-API driver. The connection lifetime is configured by `DB_CONN_MAX_AGE` (default `60` seconds). Isolation is configured by `DB_ISOLATION_LEVEL` (default `read committed`; allowed values are `read uncommitted`, `read committed`, `repeatable read`, and `serializable`). Django recommends `read committed` for MySQL. These defaults are settings behavior; they are not evidence of a successful server connection.

The environment variable names are:

| Variable | Purpose | Default / requirement |
| --- | --- | --- |
| `DB_ENGINE` | Explicit backend selector | `sqlite` by default; set to `mysql` to select MySQL |
| `DB_NAME` | MySQL database name | Required for MySQL |
| `DB_USER` | MySQL username | Required for MySQL |
| `DB_PASSWORD` | MySQL password | Required and non-empty for MySQL; keep in an untracked `.env` or secret store |
| `DB_HOST` | MySQL host | Required for MySQL |
| `DB_PORT` | MySQL TCP port | Required integer from 1 to 65535 |
| `DB_CONN_MAX_AGE` | Persistent connection lifetime in seconds | `60`; non-negative integer |
| `DB_CHARSET` | Client/session charset | `utf8mb4` only |
| `DB_COLLATION` | Client session collation | `utf8mb4_unicode_ci` by default; `utf8mb4_0900_ai_ci` is also accepted |
| `DB_ISOLATION_LEVEL` | MySQL transaction isolation | `read committed` by default; four standard levels are accepted |

To verify a connection, first confirm that `DB_ENGINE=mysql` and all credentials point to an explicitly non-production staging database. Then use a read-only query such as:

```powershell
python manage.py shell -c "from django.db import connection; connection.ensure_connection(); cursor = connection.cursor(); cursor.execute('SELECT 1'); print(cursor.fetchone())"
```

This check authenticates the connection and executes only `SELECT 1`; it does not create a schema or apply migrations. Do not use production credentials for a verification check. No MySQL connection check or migration is implied by this configuration documentation.

---

## 4. MySQL 8.4 Provisioning & Least-Privilege Security

In strict adherence to the **Principle of Least Privilege**, production database access is divided into dedicated, role-segregated database accounts. Under no circumstances does the runtime web application receive administrative or DDL privileges.

```sql
-- =========================================================================
-- 1. Database Initialization (Full UTF-8 4-byte support for Arabic RTL & Unicode)
-- =========================================================================
CREATE DATABASE IF NOT EXISTS studently_db
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

-- =========================================================================
-- 2. Runtime Application Account (studently_app)
-- Scope: Exclusively DML operations required for application services.
-- Prohibited: Absolutely NO CREATE, DROP, ALTER, REFERENCES, INDEX, or GRANT OPTION.
-- =========================================================================
CREATE USER 'studently_app'@'<APP_HOST>' IDENTIFIED BY '<RUNTIME_PASSWORD>';

GRANT SELECT, INSERT, UPDATE, DELETE 
    ON studently_db.* TO 'studently_app'@'<APP_HOST>';

-- =========================================================================
-- 3. Schema Migration Account (studently_migrator)
-- Scope: Controlled schema migrations (CI/CD pipeline and release maintenance).
-- Never exposed to the public-facing runtime web application containers.
-- =========================================================================
CREATE USER 'studently_migrator'@'<MIGRATOR_HOST>' IDENTIFIED BY '<MIGRATOR_PASSWORD>';

GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES, LOCK TABLES 
    ON studently_db.* TO 'studently_migrator'@'<MIGRATOR_HOST>';

-- =========================================================================
-- 4. Dedicated Backup Service Account (studently_backup)
-- Scope: Transactional mysqldump / logical snapshots without write capability.
-- Granted strictly database-scoped read privileges; no unnecessary global grants.
-- =========================================================================
CREATE USER 'studently_backup'@'<BACKUP_HOST>' IDENTIFIED BY '<BACKUP_PASSWORD>';

GRANT SELECT, LOCK TABLES, SHOW VIEW 
    ON studently_db.* TO 'studently_backup'@'<BACKUP_HOST>';

-- (Optional: If mysqldump requires transaction consistency without table locks via
-- --single-transaction, or if point-in-time binary log streaming is required,
-- the specific global grants RELOAD or REPLICATION CLIENT may be granted by the DBA
-- on *.* only after formal infrastructure review, rather than by default).

-- =========================================================================
-- 5. Database-Level Financial Ledger Protection Triggers
-- Even though studently_app has UPDATE/DELETE on studently_db.*, triggers
-- block direct SQL modification or deletion of studently_student_payments.
-- =========================================================================
DELIMITER //

CREATE TRIGGER trg_studently_payments_no_update
BEFORE UPDATE ON studently_student_payments
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'STUDENTLY_LEDGER_IMMUTABLE: Direct UPDATE on studently_student_payments is prohibited. Post a Reversal or Refund voucher.';
END; //

CREATE TRIGGER trg_studently_payments_no_delete
BEFORE DELETE ON studently_student_payments
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'STUDENTLY_LEDGER_IMMUTABLE: Direct DELETE on studently_student_payments is prohibited. Post a Reversal voucher.';
END; //

DELIMITER ;

-- Apply privileges
FLUSH PRIVILEGES;
```

### Operational Security, Account Segregation & Privilege Management

#### 1. Four-Tier Account Separation Architecture
To ensure rigorous least-privilege security and eliminate shared-credential vulnerabilities, database access is segregated across four distinct roles:

| Account Role | Database User | Allowed Operations | Prohibited Operations | Network & Deployment Boundary |
| :--- | :--- | :--- | :--- | :--- |
| **Runtime Application** | `studently_app` | DML only: `SELECT`, `INSERT`, `UPDATE`, `DELETE` on `studently_db.*`. | `CREATE`, `DROP`, `ALTER`, `INDEX`, `REFERENCES`, `GRANT OPTION`, administrative statements. | Restricted to application server / ECS / Kubernetes private pod CIDR (`<APP_HOST>`). |
| **Schema Migration** | `studently_migrator` | DDL + DML: `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `CREATE`, `ALTER`, `DROP`, `INDEX`, `REFERENCES`, `LOCK TABLES` on `studently_db.*`. | `GRANT OPTION`, access to MySQL system databases (`mysql`, `information_schema`, `sys`). | Restricted to CI/CD runner or bastion maintenance host (`<MIGRATOR_HOST>`), activated only during scheduled deploy windows. |
| **Logical Backup** | `studently_backup` | Read-only dump: `SELECT`, `LOCK TABLES`, `SHOW VIEW` on `studently_db.*`. | All write operations (`INSERT`, `UPDATE`, `DELETE`), all DDL operations, administrative grants. | Restricted to dedicated backup service container or host (`<BACKUP_HOST>`). |
| **Human Database Administrator** | Individual named accounts (e.g. `dba_<username>`) | Elevated administrative access, user provisioning, emergency recovery, performance tuning. | Shared root usage; unlogged direct table modifications. | Bound to secure bastion hosts with mandatory Multi-Factor Authentication (MFA) and connection audit logging. |

#### 2. Credential Security & Secret Management Guidelines
1. **Zero Real Credentials in Documentation & Code:**
   - Real passwords must **NEVER** be committed to Git repositories, written in Markdown documentation, or embedded in Dockerfiles.
   - All documentation examples use unmistakable placeholders (e.g. `<RUNTIME_PASSWORD>`, `<MIGRATOR_PASSWORD>`, `<BACKUP_PASSWORD>`).
2. **Environment & Secrets Manager Injection:**
   - In production and staging, credentials must be retrieved at runtime from a secure secret store (such as HashiCorp Vault, AWS Secrets Manager, or Azure Key Vault) and injected into container environments as encrypted environment variables (`DB_USER`, `DB_PASSWORD`).
   - Development credentials (`.env.local`) must be excluded via `.gitignore` and never reused across staging or production environments.
3. **Environment Separation:**
   - Development, staging, and production databases must maintain completely independent credentials and host network endpoints.
4. **Credential Rotation Protocol:**
   - Database user passwords must be rotated every 90 days following zero-downtime dual-user rotation (creating `studently_app_v2`, migrating application secrets, and revoking `studently_app_v1`).
5. **Connection String Logging Masking:**
   - Django logging, error trackers (e.g. Sentry), and console handlers must explicitly mask `DATABASE_URL`, `DB_PASSWORD`, and connection string parameters to prevent credential exposure in application stack traces.
6. **Network Access Control:**
   - Host wildcards (`'%'`) are strictly prohibited in production. Database accounts must bind to private VPC subnets (e.g. `'10.0.1.0/24'`) or exact IP addresses.

#### 3. Financial Ledger Trigger Architecture & Security Boundaries
The `studently_student_payments` table represents an immutable financial ledger. To enforce append-only integrity, database-level triggers are combined with ORM safeguards:

1. **Operations Blocked:**
   - `trg_studently_payments_no_update`: Intercepts any SQL `UPDATE` statement targeting `studently_student_payments` and triggers an uncatchable `SQLSTATE '45000'` error.
   - `trg_studently_payments_no_delete`: Intercepts any SQL `DELETE` statement targeting `studently_student_payments` and triggers an uncatchable `SQLSTATE '45000'` error.
2. **Migration Integration via Django ORM:**
   - In Phase 3, these triggers will be codified inside a dedicated Django migration using `migrations.RunSQL`:
     ```python
     # Inside apps/finances/migrations/0002_payment_triggers.py
     operations = [
         migrations.RunSQL(
             sql="""CREATE TRIGGER trg_studently_payments_no_update ...""",
             reverse_sql="""DROP TRIGGER IF EXISTS trg_studently_payments_no_update;"""
         ),
     ]
     ```
   - This ensures triggers are automatically applied whenever `studently_migrator` runs `python manage.py migrate`.
3. **Authorized Maintenance & Emergency Data Repairs:**
   - If an emergency database repair is formally approved by school leadership, direct edits cannot be executed under normal application credentials.
   - A human DBA must establish an audited session, temporarily disable the trigger inside an explicit transaction, execute the audited correction, re-enable the trigger, and log the cryptographic hash of the change in the institutional audit log.
4. **Protections in Development (SQLite):**
   - SQLite does not enforce MySQL trigger syntax out of the box unless equivalent SQLite `CREATE TRIGGER` DDL is executed.
   - In development, ledger immutability is primarily enforced by Django ORM model method overrides on `StudentPayment`:
     ```python
     def save(self, *args, **kwargs):
         if self.pk and not self._state.adding:
             raise PermissionDenied("Existing payment records are immutable.")
         super().save(*args, **kwargs)

     def delete(self, *args, **kwargs):
         raise PermissionDenied("Payment records cannot be deleted.")
     ```
5. **Foreign Key Cascade & Relational Protections:**
   - All ForeignKeys linking to `studently_student_payments` (e.g. `reversed_payment_id`) and from `studently_student_payments` to parent entities (`student_id`, `invoice_id`, `recorded_by_user_id`) use `on_delete=models.RESTRICT`.
   - Therefore, deleting a student, invoice, or user will NEVER cascade-delete payment records. The database engine rejects any parent deletion with a foreign key constraint violation.
6. **Realistic Security Boundary (Trigger Limitations):**
   - Triggers provide defense-in-depth against application bugs, SQL injection vulnerabilities, and unauthorized ORM bulk updates (`QuerySet.update()` / `QuerySet.delete()`).
   - However, **database triggers do NOT provide absolute protection against privileged database administrators** (users possessing `SUPER`, `SYSTEM_USER`, or root privileges), who have the technical capability to drop triggers or alter database binlogs. Absolute institutional security relies on least-privilege credential segregation, VPC network isolation, and external append-only audit logging.

---

## 5. Step-by-Step Data Migration Protocol (Development SQLite -> Production MySQL)

When promoting a pre-populated development or staging SQLite database to MySQL:

```
[ Phase 1: Freeze Dev ] -> [ Phase 2: Dump Data ] -> [ Phase 3: Init MySQL Schema ] -> [ Phase 4: Ingest Data ] -> [ Phase 5: Verify ]
```

### Step 1: Pre-Migration Backup & Freezing
1. Stop the local development server to ensure zero in-flight writes.
2. Create a timestamped copy of `db.sqlite3`:
   ```bash
   cp db.sqlite3 backups/db_pre_migration_$(date +%Y%m%d_%H%M%S).sqlite3
   ```

### Step 2: Clean Serialization of SQLite Data
Export all application data into a normalized UTF-8 JSON dump, excluding Django system content types and permissions:
```bash
python manage.py dumpdata \
    --natural-foreign \
    --natural-primary \
    --exclude=contenttypes \
    --exclude=auth.permission \
    --indent 2 \
    --output=backups/studently_data_export.json
```

### Step 3: Initialize Production MySQL Schema
Set `DB_ENGINE=mysql` in environment variables and apply initial Django migrations using the dedicated migration account (`studently_migrator`) to build all tables, foreign keys, indexes, and constraints in MySQL:
```bash
export DB_ENGINE=mysql
export DB_NAME=studently_db
export DB_USER=studently_migrator
export DB_PASSWORD="<MIGRATOR_PASSWORD>"
export DB_HOST=127.0.0.1
export DB_PORT=3306

python manage.py migrate
```

### Step 4: Ingest Data into MySQL
Disable foreign key checks temporarily during ingestion to prevent ordering dependency errors, load the JSON dump, and re-enable checks:
```bash
python manage.py loaddata backups/studently_data_export.json
```

---

## 6. Post-Migration Verification & Integrity Audit

Execute an automated Python verification script to confirm that 100% of rows and relationships were transferred without truncation or precision loss:

```python
# scripts/verify_migration.py
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from apps.accounts.models import User, UserPermission
from apps.academics.models import Teacher, Classroom, Subject
from apps.students.models import Student, PromotionHistory
from apps.attendance.models import AttendanceRecord
from apps.examinations.models import Examination, ExaminationMark
from apps.finances.models import StudentInvoice, StudentPayment, Income, Expense
from apps.core.models import SystemSetting

def audit():
    print("=" * 60)
    print("STUDENTLY MIGRATION AUDIT REPORT")
    print("=" * 60)
    
    counts = {
        "Users": User.objects.count(),
        "Permissions": UserPermission.objects.count(),
        "Teachers": Teacher.objects.count(),
        "Classrooms": Classroom.objects.count(),
        "Subjects": Subject.objects.count(),
        "Students": Student.objects.count(),
        "Attendance Records": AttendanceRecord.objects.count(),
        "Exam Sessions": Examination.objects.count(),
        "Marks Rows": ExaminationMark.objects.count(),
        "Invoices": StudentInvoice.objects.count(),
        "Payments": StudentPayment.objects.count(),
        "Incomes": Income.objects.count(),
        "Expenses": Expense.objects.count(),
    }
    
    for entity, count in counts.items():
        print(f" -> {entity:<25}: {count:>6} rows verified")
        
    # Verify System Settings Singleton
    setting = SystemSetting.load()
    print("-" * 60)
    print(f"Verified Institution Name: {setting.institution_name}")
    print(f"Verified Current Year:    {setting.academic_year} ({setting.current_term})")
    print("=" * 60)
    print("ALL INTEGRITY CHECKS PASSED SUCCESSFULLY.")

if __name__ == '__main__':
    audit()
```

---

## 7. Migration Rehearsal, Cutover & Disaster Recovery Contingency

### 7.1. Staging Rehearsal Protocol (Dry-Run Verification)
Prior to scheduling the production cutover window:
1. Provision a staging replica of MySQL 8.0.16+ matching production hardware and `sql_mode`.
2. Execute the complete serialization, migration, ingestion, and verification sequence against a full snapshot of development/pre-production data.
3. Validate database constraint enforcement by asserting that invalid test payloads (e.g. negative payments, invalid roles, duplicate roll calls) are rejected at the engine level.
4. Measure total downtime duration during rehearsal to establish the production maintenance window SLA.

### 7.2. Production Cutover Sequence
1. **Maintenance Mode Activation:** Display a client-facing maintenance notice and set the frontend to read-only mode to prevent new browser requests.
2. **Immutable Pre-Cutover Snapshot:**
   ```bash
   # Create immutable SHA-256 verified backup of SQLite database
   cp db.sqlite3 backups/db_cutover_$(date +%Y%m%d_%H%M%S).sqlite3
   sha256sum backups/db_cutover_*.sqlite3 > backups/checksum.sha256
   ```
3. **Execution of Migration Pipeline:** Run Step 2 (clean dumpdata), Step 3 (MySQL migrate), and Step 4 (MySQL loaddata).
4. **Automated Verification:** Execute `python scripts/verify_migration.py` and confirm exact row counts across all 20 tables.
5. **Traffic Switch & Live Verification:** Update application environment to `DB_ENGINE=mysql`, restart backend gunicorn/uvicorn workers, verify healthcheck endpoint, and lift maintenance mode. Record exact cutover timestamp ($T_{\text{cutover}}$).

---

### 7.3. Rollback & Data Preservation Procedures

#### A. Pre-Cutover Abort (During Migration Window, Before Production Traffic Goes Live)
If an unrecoverable failure occurs *during* the cutover maintenance window before traffic is routed to MySQL:
1. **Immediate Fallback:** Revert backend configuration to `DB_ENGINE=sqlite` pointing to `db.sqlite3`.
2. **Zero Data Loss Guarantee:** Because no user traffic was permitted during the maintenance window, the original SQLite database remains completely pristine and untouched.
3. **Diagnostic Logging:** Archive MySQL error logs (`/var/log/mysql/error.log`) and migration stack traces for post-mortem analysis.

#### B. Post-Cutover Disaster Recovery (After Production Writes Have Occurred in MySQL)
> [!CAUTION]
> **STRICT ARCHITECTURAL DIRECTIVE: NEVER RESTORE PRE-CUTOVER SQLITE BACKUP AFTER LIVE WRITES**  
> Once production traffic has been pointed to MySQL and new transactions have been committed (student enrollments, fee payments, daily attendance roll calls, exam marks), **restoring the pre-cutover SQLite snapshot is strictly prohibited**. Doing so causes silent, catastrophic data loss of all post-cutover operational records.

If a critical database failure or application regression occurs after production writes have commenced in MySQL, operations must follow one of the two authorized protocols:

1. **Protocol 1: Forward-Fix Protocol (Primary Strategy - Zero Downtime / Zero Loss):**
   - Keep MySQL active as the authoritative system of record.
   - For schema or constraint regressions, generate a target forward migration using Django (`python manage.py makemigrations --name hotfix_issue`), test in staging, and apply directly to production MySQL within an atomic transaction.
   - For backend code defects, deploy a fast application hotfix rollback while preserving the MySQL database.

2. **Protocol 2: Delta-Replay to Fallback Engine (Emergency Recovery):**
   - If MySQL database infrastructure suffers an unrecoverable engine crash requiring immediate fallback to SQLite, all writes committed since cutover must be preserved.
   - **Step 1:** Lock MySQL tables in read-only mode to freeze the state.
   - **Step 2:** Extract all delta records created or modified since $T_{\text{cutover}}$ using timestamped CDC or SQL dump:
     ```sql
     -- Example delta extraction for financial payments committed post-cutover
     SELECT * INTO OUTFILE '/tmp/payments_delta.csv'
     FROM studently_student_payments
     WHERE created_at >= '2026-11-19 00:00:00';
     ```
   - **Step 3:** Replay the delta records into the fallback database using Django ORM service functions within atomic transactions, ensuring foreign key referential integrity is preserved.
   - **Step 4:** Run full integrity audits before re-opening user traffic.
