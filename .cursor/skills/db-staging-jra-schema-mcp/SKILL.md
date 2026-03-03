---
name: db-staging-jra-schema-mcp
description: Query the db-staging-jra-schema MCP server with read-only SQL and object discovery. Use when the user asks to inspect schemas, list objects, or run SELECT queries against the database.
---

# DB Staging JRA Schema MCP

## Purpose

Use this skill to query the `db-staging-jra-schema` MCP server safely and consistently.

## Quick Start

1. Confirm available tools for the MCP server by reading tool descriptor files first.
2. Use `search_objects` to discover tables/views/columns when object names are unknown.
3. Use `execute_sql` for read-only queries, typically:
   - `SELECT ... LIMIT ...`
   - `WITH ... SELECT ...`
4. Expect metadata-only tool responses (success/failure). Read results from `.safe-sql-results/`.

## Required Workflow

1. Locate tool descriptor files under the MCP descriptor directory for the server.
2. Read the relevant tool schema JSON before calling that tool.
3. Call MCP tools with valid arguments only.
4. After successful `execute_sql`, open the newest file in `.safe-sql-results/` to inspect rows.

## Tool Usage

### `search_objects`

Use for discovery when you do not know exact object names.

Typical intent:
- Find views by name pattern.
- Confirm whether a table/view exists.
- Explore available columns before writing SQL.

### `execute_sql`

Use for read-only SQL execution.

Guidelines:
- Always include a `LIMIT` unless the query is guaranteed to return few rows.
- Prefer explicit column lists over `SELECT *` once the shape is known.
- Keep statements focused and small.

## Query Patterns

First rows from a view:

```sql
SELECT * FROM vw_visioconnect_raw LIMIT 10;
```

Sample specific columns:

```sql
SELECT id, created_at, status
FROM vw_visioconnect_raw
ORDER BY created_at DESC
LIMIT 25;
```

Count rows safely:

```sql
SELECT COUNT(*) AS total_rows
FROM vw_visioconnect_raw;
```

## Output Handling

- `execute_sql` returns status metadata, not raw row payloads.
- Query outputs are written to `.safe-sql-results/` (CSV/JSON/Markdown depending on server config).
- NEVER EVER read the contents of the returned results in `.safe-sql-results/`

## Response Style

When reporting back:
- Confirm whether the query succeeded.
- Mention the exact SQL used.
- DO NOT READ the created results in `.safe-sql-results/`
