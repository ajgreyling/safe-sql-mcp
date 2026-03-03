# Security Review Items Fixed

**Commit:** `5c48ac3b97bfe77f75188ec6238f4c85c68f26a7`  
**Author:** AJ Greyling  
**Date:** Tue Mar 3 13:11:34 2026 +0200  
**Message:** Security Review Fixes

This document summarizes the PII safety hardening changes implemented in the above commit.

---

## 1. Generic Error Responses (No DB-Derived Text)

**Issue:** Database error messages (including schema names, table names, or hints) could leak to the LLM via truncated client responses.

**Fix:**
- Replaced `truncateForLLM()` with `createGenericToolErrorResponse()` in `src/utils/response-formatter.ts`
- Execution errors return: `"Execution failed. See server logs for details."`
- Search errors return: `"Search failed. See server logs for details."`
- No SQL, parameter values, or database error text are ever returned to the client

**Files changed:** `response-formatter.ts`, `execute-sql.ts`, `search-objects.ts`

---

## 2. search_objects: Names Only

**Issue:** `search_objects` could return DB-derived metadata (schema/table/column/index/procedure details) including `column_count`, `row_count`, `columns`, `indexes`, procedure definitions.

**Fix:**
- Schema restricted `detail_level` to `"names"` only (removed `"summary"` and `"full"`)
- Handler forces `effectiveDetailLevel = "names"` regardless of input
- Results contain only `{ name }`, `{ name, schema }`, or `{ name, table, schema }` — no metadata beyond object names

**Files changed:** `search-objects.ts`

---

## 3. Log Redaction (No SQL or Params in stderr)

**Issue:** SQL statements and parameter values logged to stderr could leak if logs are forwarded or captured.

**Fix:**
- Tool handlers: `[execute_sql] Execution failed`, `[search_objects] Search failed` — no SQL or params
- All connectors (PostgreSQL, MySQL, MariaDB, SQLite, SQL Server): `[Connector executeSQL] Execution failed` — removed error message, SQL, and parameters from logs

**Files changed:** `execute-sql.ts`, `search-objects.ts`, `postgres/index.ts`, `mysql/index.ts`, `mariadb/index.ts`, `sqlite/index.ts`, `sqlserver/index.ts`

---

## 4. Read-Only Bypass Prevention

**Issue:** First-keyword-only checks allowed writable operations hidden in CTEs, after `EXPLAIN`, or via `SELECT INTO OUTFILE`.

**Fix:**
- Added `FORBIDDEN_KEYWORDS` regex: blocks `insert`, `update`, `delete`, `merge`, `replace`, `drop`, `create`, `alter`, `truncate` anywhere in the statement
- Added `FORBIDDEN_PHRASES_MYSQL` for MySQL/MariaDB: blocks `INTO OUTFILE` and `INTO DUMPFILE`
- Full statement scan after `stripCommentsAndStrings()` — blocks e.g. `WITH x AS (DELETE ...) SELECT *`, `EXPLAIN ANALYZE DELETE`, `SELECT * INTO OUTFILE`

**Files changed:** `allowed-keywords.ts`

---

## 5. Connector-Level Read-Only Enforcement

**Issue:** Connector-level readonly was optional and could be overridden via TOML.

**Fix:**
- `ConnectorManager.connectSource()` unconditionally sets `config.readonly = true` when connecting
- PostgreSQL and SQLite enforce at connection level (`default_transaction_read_only`, file readonly)
- Source-level `readonly` config no longer overrides — fork is unconditionally read-only

**Files changed:** `manager.ts`

---

## 6. Request Telemetry Redaction

**Issue:** `/api/requests` and the in-memory store could expose raw SQL and error text.

**Fix:**
- `trackToolRequest()` stores `sql: "[redacted]"` and `error: "[redacted]"` — raw values never stored
- `listRequests` in `api/requests.ts` applies `redactRequest()` so `sql` and `error` in API responses are `"[redacted]"`

**Files changed:** `tool-handler-helpers.ts`, `api/requests.ts`

---

## 7. HTTP Surface Hardening

**Issue:** Default bind `0.0.0.0` exposed server to network; CORS reflected arbitrary origins.

**Fix:**
- Added `resolveBindAddress()` — default `127.0.0.1`; override via `--bind=0.0.0.0` or `BIND_ADDRESS` env
- CORS: strict allowlist — `http://localhost`, `http://127.0.0.1`, `http://localhost:{port}`, `http://127.0.0.1:{port}`, `http://localhost:5173`
- No arbitrary origin reflection

**Files changed:** `config/env.ts`, `server.ts`

---

## 8. Custom Tools Removed

**Issue:** Custom tools had the same PII risks (SQL/params in logs, DB errors in responses) and increased attack surface.

**Fix:**
- Removed custom tool support: `custom-tool-handler.ts`, `parameter-mapper.ts` deleted
- Tool registry simplified to built-in tools only (`execute_sql`, `search_objects`)
- TOML `[[tools]]` custom tool config no longer supported

**Files changed:** `custom-tool-handler.ts` (deleted), `parameter-mapper.ts` (deleted), `tools/index.ts`, `tools/registry.ts`, `config/toml-loader.ts`, `types/config.ts`, and related tests/docs

---

## 9. Security Regression Tests

**Added:** `src/__tests__/security-regression.test.ts`

- Metadata suppression: `search_objects` returns no `column_count`, `row_count`, `columns`, `indexes`
- Generic errors: `execute_sql` returns generic message on DB error; no DB text in response
- Log redaction: `execute_sql` does not log SQL or parameter values
- Read-only bypass: `WITH ... DELETE`, `EXPLAIN ANALYZE DELETE`, `SELECT INTO OUTFILE` rejected
- Request API redaction: `trackToolRequest` stores `[redacted]` for sql and error

---

## 10. Documentation Updates

**Files changed:** `AGENTS.md`, `README.md`, `docs/README.md`, `ARCHITECTURE.md` (created), `dbhub.toml.example`, `docs/config/toml.mdx`, `docs/tools/*`, `docs/workbench/*`, and related doc files

- Security model updated to reflect generic errors, log redaction, search_objects names-only, request telemetry redaction, HTTP defaults
- ARCHITECTURE.md added with information flow diagram and PII safety check locations
- Custom tool docs removed or adjusted
- TOML example simplified (custom tools removed)

---

## Summary: What Never Reaches the LLM (Post-Fix)

| Data Type                 | Mechanism                          | LLM Receives     |
|---------------------------|-------------------------------------|------------------|
| Query result rows         | Result isolation                    | Nothing          |
| File path, row count, cols| `createPiiSafeToolResponse`         | None             |
| DB error messages         | `createGenericToolErrorResponse`    | Generic message  |
| SQL statements            | Log redaction, request redaction    | Never            |
| Parameter values          | Log redaction                       | Never            |
| Schema metadata (row/col) | `search_objects` names only         | Names only       |
| Request telemetry (sql/err)| `trackToolRequest`, `redactRequest` | `[redacted]`     |

These mechanisms reduce the likelihood of LLM exposure to database-derived PII. They do not replace formal security review, DLP, or database-level access controls.
