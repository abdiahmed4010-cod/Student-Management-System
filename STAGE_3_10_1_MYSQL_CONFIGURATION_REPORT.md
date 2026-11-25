# AL-IMAAMA — Stage 3.10.1 MySQL Configuration Implementation Report

**Date:** 2026-11-24  
**Status:** Stage 3.10.1 complete; awaiting independent review. Stage 3.10.2 has not started.

## Scope and preservation

Implemented only the authorized MySQL configuration, driver pin, environment example, and migration documentation updates. Existing uncommitted work was preserved. No reset, checkout, clean, stash, commit, push, rebase, or `.env` read was performed. No authentication, RBAC, student-role, finance, payment, receipt, refund, reversal, or ledger code was changed. The confirmed login scope remains ADMIN and TEACHER; students remain records without login accounts.

### Initial Git status

`git status --short --branch` before edits:

```text
## main...origin/main
 M assets/js/app.js
 M assets/js/auth.js
 M assets/js/components.js
 M assets/js/dashboard.js
 M assets/js/data.js
 M assets/js/payments.js
 M assets/js/permissions.js
 M assets/js/reports.js
 M assets/js/router.js
 M assets/js/storage.js
 M backend/apps/accounts/admin.py
 M backend/apps/accounts/models.py
 M backend/apps/accounts/serializers.py
 M backend/apps/accounts/urls.py
 M backend/apps/accounts/views.py
 M backend/apps/core/tests.py
 M backend/config/urls.py
?? PHASE_3_6_IMPLEMENTATION_REPORT.md
?? STAGE_3_10_PRE_IMPLEMENTATION_AUDIT_REPORT.md
?? STAGE_3_7_IMPLEMENTATION_REPORT.md
?? STAGE_3_8_IMPLEMENTATION_REPORT.md
?? STAGE_3_9_IMPLEMENTATION_REPORT.md
?? assets/js/api.js
?? assets/js/payment_sync.js
?? backend/apps/academics/class_urls.py
?? backend/apps/academics/serializers.py
?? backend/apps/academics/subject_urls.py
?? backend/apps/academics/teacher_urls.py
?? backend/apps/academics/views.py
?? backend/apps/accounts/migrations/0004_userpermission.py
?? backend/apps/accounts/permissions.py
?? backend/apps/accounts/rbac.py
?? backend/apps/accounts/test_rbac.py
?? backend/apps/accounts/user_urls.py
?? backend/apps/attendance/serializers.py
?? backend/apps/attendance/urls.py
?? backend/apps/attendance/views.py
?? backend/apps/core/serializers.py
?? backend/apps/core/test_reporting_analytics.py
?? backend/apps/core/urls.py
?? backend/apps/core/views.py
?? backend/apps/examinations/serializers.py
?? backend/apps/examinations/urls.py
?? backend/apps/examinations/views.py
?? backend/apps/finances/admin.py
?? backend/apps/finances/payment_urls.py
?? backend/apps/finances/serializers.py
?? backend/apps/finances/services.py
?? backend/apps/finances/test_stage37_business_logic.py
?? backend/apps/finances/views.py
?? backend/apps/students/serializers.py
?? backend/apps/students/urls.py
?? backend/apps/students/views.py
?? tests/
```

The initial status did not show any of the four implementation files below as changed. At final review, the original paths remain present and the only additions/changes for this phase are the four scoped files and this report.

## Files changed

1. `backend/config/settings.py` — SQLite remains default; explicit MySQL selection and validation; connection lifetime; charset/collation; isolation level; strict SQL mode; InnoDB session default.
2. `backend/requirements.txt` — pinned `mysqlclient==2.3.2`. Its pre-existing UTF-16LE encoding was preserved.
3. `backend/.env.example` — placeholders for all requested DB variables; password placeholder is empty.
4. `documentation/phase-2/SQLITE_TO_MYSQL_MIGRATION_PLAN.md` — updated active configuration guidance, target version, environment variables, driver installation, and safe read-only connection-check procedure.
5. `STAGE_3_10_1_MYSQL_CONFIGURATION_REPORT.md` — this report.

## Implementation details

- `DB_ENGINE` defaults to `sqlite`. Only `sqlite` and `mysql` are accepted; any other value fails with `ImproperlyConfigured`.
- Selecting MySQL requires non-empty `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, and `DB_PORT`. Missing values fail clearly and the exception does not include supplied values or passwords. There is no fallback to SQLite.
- MySQL port is validated as 1–65535. `DB_CONN_MAX_AGE` defaults to 60 seconds and must be a non-negative integer.
- `DB_CHARSET` is restricted to `utf8mb4`. `DB_COLLATION` accepts `utf8mb4_unicode_ci` or `utf8mb4_0900_ai_ci` and configures the connection session. Database-level defaults and existing table definitions still require server-side provisioning and verification.
- The MySQL connection uses `STRICT_TRANS_TABLES`, `ERROR_FOR_DIVISION_BY_ZERO`, and `NO_ENGINE_SUBSTITUTION`; it sets the session default storage engine to InnoDB. Existing tables are not converted by this setting.
- `DB_ISOLATION_LEVEL` defaults to `read committed`; the accepted values are `read uncommitted`, `read committed`, `repeatable read`, and `serializable`.
- The target is MySQL 8.4 LTS with InnoDB. Django 5.2 supports MySQL 8.0.11 and newer. Django recommends `read committed` for MySQL and documents `init_command` for SQL mode configuration. See [Django 5.2 database documentation](https://docs.djangoproject.com/en/5.2/ref/databases/#mysql-notes).
- PyPI publishes a Windows CPython 3.13 x86-64 wheel for `mysqlclient` 2.3.2; the pinned driver was installed and imported successfully here. See [mysqlclient 2.3.2 on PyPI](https://pypi.org/project/mysqlclient/2.3.2/).

## Verification results

All Django checks and test runs explicitly selected SQLite and disabled `.env` loading for isolation. No production or staging credentials were supplied or read.

### Driver installation and dependency file

Command:

```powershell
python -m pip install mysqlclient==2.3.2
```

Actual result:

```text
Collecting mysqlclient==2.3.2
Downloading mysqlclient-2.3.2-cp313-cp313-win_amd64.whl
Installing collected packages: mysqlclient
Successfully installed mysqlclient-2.3.2
```

Command:

```powershell
python -m pip install --dry-run -r requirements.txt
```

Actual result: all pinned requirements, including `mysqlclient==2.3.2`, were reported as already satisfied; pip parsed the existing UTF-16LE requirements file successfully.

Command:

```powershell
python -c "import MySQLdb; print('mysqlclient import OK; version=' + '.'.join(map(str, MySQLdb.version_info)))"
```

Actual output:

```text
mysqlclient import OK; version=2.3.2.final.0
```

Environment: Python 3.13.17, Windows 11 x64. No installation blocker.

### SQLite system check and migration consistency

Commands (run with `PYTHON_DOTENV_DISABLED=true`, a verification-only Django key, and `DB_ENGINE=sqlite`):

```powershell
python manage.py check
python manage.py makemigrations --check --dry-run
```

Actual outputs:

```text
System check identified no issues (0 silenced).
No changes detected
```

### Existing Django test suite

Command (same isolated SQLite environment):

```powershell
python manage.py test
```

Actual output:

```text
Ran 104 tests in 247.859s
OK
Destroying test database for alias 'default'...
Found 104 test(s).
System check identified no issues (0 silenced).
```

Django created and destroyed its temporary SQLite test database. It did not apply migrations to MySQL or change the project's persistent database.

### Settings selection and validation

Isolated subprocess checks used `PYTHON_DOTENV_DISABLED=true` and a verification-only Django key. For valid MySQL settings, synthetic non-production values were supplied only to import settings; no connection was opened and no test credential is recorded here.

| Check | Actual result |
| --- | --- |
| Omit `DB_ENGINE` | `PASS SQLite default: engine=sqlite` |
| Supply all required MySQL variables and valid options | `PASS engine=mysql; charset=utf8mb4; isolation=read committed; SQL strict mode; InnoDB session default` |
| Set `DB_ENGINE=mysql` but omit required values | `PASS ImproperlyConfigured: DB_ENGINE='mysql' requires non-empty values for: DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT.` |
| Set `DB_ENGINE=oracle` | `PASS ImproperlyConfigured: Unsupported DB_ENGINE. Choose either 'sqlite' or 'mysql'.` |

`git diff --check` scoped to the four implementation files passed. Git emitted only its existing line-ending conversion warnings for those text files.

## Database and production boundaries

- No MySQL database connection was attempted because no explicitly supplied non-production credentials were available. Therefore MySQL server authentication, SQL execution, server version, existing table engines, database collation, and runtime behavior remain **unverified**. Settings loading and driver import are not MySQL runtime certification.
- No MySQL migrations were run. No database, table, trigger, schema, or MySQL data was created, altered, or dropped. No production database was touched.
- The SQLite suite used a disposable test database that Django destroyed after the run; no persistent project DB was intentionally modified.
- No source outside the authorized configuration/dependency/environment/documentation scope was edited, and no Git history operation was performed.

## Remaining work

Stage 3.10.2 has not started. Independent review and explicit approval of this Stage 3.10.1 report are pending. Any later staging connection check or migration work must use explicitly confirmed non-production credentials and separate authorization; no such work is performed by this report.
