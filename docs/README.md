# capybara-db-mcp Documentation

## ⚠️ Production & Governance Notice

This project is intended for development, sandbox, or formally reviewed environments. Before connecting to any production system:

- Conduct a security review
- Validate data classification and handling requirements
- Ensure compliance with internal AI and data governance policies
- Confirm logging, auditing, and DLP controls are in place

This project is designed to reduce the likelihood of exposing query results to LLMs, but it does not replace enterprise security controls and should not be used to bypass governance processes.

Documentation for **capybara-db-mcp** (fork of [DBHub](https://github.com/bytebase/dbhub)). For upstream docs see [dbhub.ai](https://dbhub.ai).

## Security Model Overview

- **LLM generates SQL** via the MCP client.
- **Connector is read-only**: Database connections are opened in read-only mode (PostgreSQL: `default_transaction_read_only`; SQLite: readonly file mode). Write attempts fail at the database level.
- **Query executes** against the configured database.
- **Results are written locally** to `.safe-sql-results/` and opened in the editor (configurable).
- **Tool response is metadata-oriented** and is formatted to avoid returning raw query results in the response payload.

This design reduces the likelihood of transmitting result data to an LLM, but it does not eliminate operational, environment, or governance risks. Database-level RBAC, auditing, and approved operating procedures remain required.

## Controls (risk-reduction)

- **Read-only enforcement**: Database connections are opened in read-only mode; write operations (UPDATE, DELETE, INSERT, etc.) fail at the connection level. This reduces the risk of accidental writes but does not replace database-level permissions or RBAC.
- **Output isolation**: Query results are written to `.safe-sql-results/` and opened in the editor; tool responses return only success/failure metadata (no file paths, row data, row counts, or column names).
- **Generic errors only**: Execution and search errors return generic messages (e.g. "Execution failed. See server logs for details."); no SQL, parameter values, or database error text are returned to the client.
- **Log redaction**: Stderr logs never include SQL statements or parameter values; only tool name and status are logged.
- **search_objects names only**: Schema exploration returns object names only; summary/full metadata (row counts, column types, definitions) is disabled to avoid leaking schema-derived data.
- **Request telemetry redaction**: `/api/requests` redacts SQL and error text; `trackToolRequest` stores only `[redacted]` for those fields.
- **HTTP defaults**: Bind address defaults to `127.0.0.1`; CORS uses a strict allowlist.

For information flow diagrams and detailed PII safety mechanisms, see [ARCHITECTURE.md](../ARCHITECTURE.md).

Install the [Mintlify CLI](https://www.npmjs.com/package/mint) to preview documentation locally:

```bash
npm i -g mint
```

Run the following command at the root of your documentation (where `docs.json` is located):

```bash
cd docs
mint dev
```
