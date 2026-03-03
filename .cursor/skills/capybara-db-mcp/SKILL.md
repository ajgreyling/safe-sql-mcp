---
name: capybara-db-mcp
description: Query the local PostgreSQL database via the capybara-db-mcp MCP server. Use for all database queries, schema discovery, table listings, column lookups, and SELECT statements. Use when the user asks about database contents, schema objects, or wants to run SQL. NEVER read or open .safe-sql-results/ — it contains PII data.
---

# capybara-db-mcp Database Queries

## MCP Server

All database queries MUST go through the `project-0-capybara-db-mcp-local-postgres-capybara-test` MCP server using the `execute_sql` or `search_objects` tools.

Always read the tool descriptor before calling it:
- `/Users/ajgreyling/.cursor/projects/Users-ajgreyling-code-capybara-db-mcp/mcps/project-0-capybara-db-mcp-local-postgres-capybara-test/tools/execute_sql.json`
- `/Users/ajgreyling/.cursor/projects/Users-ajgreyling-code-capybara-db-mcp/mcps/project-0-capybara-db-mcp-local-postgres-capybara-test/tools/search_objects.json`

## ⛔ PII Safety Rule — Critical

**NEVER open, read, or display the contents of `.safe-sql-results/`.**

This directory contains raw query result files with personally identifiable information (PII) — names, SSNs, emails, dates of birth, and other sensitive data. Reading these files transmits PII to the LLM context, which is the exact risk this tool is designed to prevent.

- Do NOT use `Read`, `cat`, `head`, `tail`, or any other tool to access files in `.safe-sql-results/`
- Do NOT include file paths, row counts, or column names from result files in responses
- Confirm the query succeeded or failed based on the MCP tool response metadata only

## Workflow

### 1. Discovery — use `search_objects`

When object names are unknown, use `search_objects` first:

```sql
-- Find tables matching a pattern
pattern: "client%", type: "tables"
```

### 2. Execution — use `execute_sql`

Always include `LIMIT` unless the result is guaranteed to be small:

```sql
SELECT column1, column2 FROM some_table LIMIT 50;
```

Count rows safely:

```sql
SELECT COUNT(*) FROM some_table;
```

### 3. Reporting

After a successful `execute_sql` call:
- Confirm the query succeeded using only the tool response metadata
- State the SQL that was executed
- Do NOT read or display the contents of `.safe-sql-results/`

## Query Guidelines

- Prefer explicit column lists over `SELECT *` once the schema is known
- Always use parameterized or literal-safe SQL (read-only connection enforced at DB level)
- Keep queries focused; avoid large scans without `LIMIT`
