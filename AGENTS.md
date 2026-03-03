# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ Production & Governance Notice

This project is intended for development, sandbox, or formally reviewed environments. Before connecting to any production system:

- Conduct a security review
- Validate data classification and handling requirements
- Ensure compliance with internal AI and data governance policies
- Confirm logging, auditing, and DLP controls are in place

capybara-db-mcp is designed to reduce the likelihood of exposing query results to LLMs by isolating result sets to local files and returning status-oriented metadata. This does not replace enterprise security controls and should not be used to bypass governance processes.

This codebase is the **capybara-db-mcp** fork ([github.com/ajgreyling/capybara-db-mcp](https://github.com/ajgreyling/capybara-db-mcp)) of DBHub; it keeps internal names (e.g. `dbhub.toml`) for upstream compatibility and adds `--schema` / default schema support.

### Security model (risk-reduction)

The core design is intended to reduce the likelihood of transmitting query result data to an LLM:

- **Result isolation**: Result sets are written to `.safe-sql-results/` and opened locally in the editor only when running in a supported client (Cursor, Claude Code, Codex, Gemini); tool responses return only success/failure metadata (no file paths, row counts, or column names). See `createPiiSafeToolResponse` in `src/utils/response-formatter.ts` and `src/utils/result-writer.ts`.
- **Generic errors**: Execution and search errors return generic messages only (`Execution failed. See server logs for details.`); no SQL, parameter values, or DB error text are returned to the client. See `createGenericToolErrorResponse` in `src/utils/response-formatter.ts`.
- **Log redaction**: Stderr logs do not include SQL statements or parameter values; only tool name and status are logged.
- **search_objects**: Returns names only (summary/full detail levels disabled) to avoid leaking schema metadata.
- **Connector-level read-only**: PostgreSQL and SQLite connections are opened in read-only mode; write operations fail at the database level. See `src/connectors/manager.ts`, `src/connectors/postgres/index.ts`, `src/connectors/sqlite/index.ts`.
- **Request telemetry**: `/api/requests` redacts SQL and error text in responses; `trackToolRequest` stores only `[redacted]` for those fields.
- **HTTP defaults**: Bind address defaults to `127.0.0.1`; CORS uses a strict allowlist. Use `--bind=0.0.0.0` for network access.

These mechanisms reduce LLM data exposure risk when used appropriately, but they do not eliminate operational risk or substitute for formal security review, DLP controls, or database-level access controls.

**Detailed architecture:** See [ARCHITECTURE.md](ARCHITECTURE.md) for information flow diagrams, check locations, and full PII safety mechanism documentation.

# DBHub Development Guidelines

DBHub is a zero-dependency, token efficient database MCP server implementing the Model Context Protocol (MCP) server interface. This lightweight server bridges MCP-compatible clients (Claude Desktop, Claude Code, Cursor, Codex, Gemini) with various database systems. **VS Code and GitHub Copilot are not supported** — they lack a project-level ignore mechanism for `.safe-sql-results/`.

## Governance Expectations

Agents interacting with this MCP server are expected to:

- Avoid connecting to production systems without explicit authorization and appropriate controls
- Respect data classification and retention policies; avoid querying sensitive data unnecessarily
- Follow least-privilege principles (database roles, network access, and scoped credentials)
- Operate only in approved environments with appropriate monitoring, logging, and auditing
- Treat generated SQL as untrusted until validated by controls and reviewed for appropriateness

## Read-only enforcement

Database connections are opened in read-only mode (PostgreSQL: `default_transaction_read_only`; SQLite: readonly file mode). UPDATE, DELETE, INSERT, and other write operations fail at the connection level. This reduces the risk of accidental writes but does not replace database-level RBAC, permissions, or auditing.

### Output isolation (designed to reduce LLM exposure)

Query results are written to `.safe-sql-results/` and opened in the editor only when running in a supported client (Cursor, Claude Code, Codex, Gemini); tool responses are formatted to return success/failure metadata rather than raw result sets (including file paths, row counts, or column names). This reduces the likelihood of sending result data to an LLM, but does not eliminate data handling risk. Configure output format via `--output-format=csv|json|markdown`.

## Commands

- Build: `pnpm run build` - Compiles TypeScript to JavaScript using tsup
- Start: `pnpm run start` - Runs the compiled server
- Dev: `pnpm run dev` - Runs server with tsx (no compilation needed)
- Test: `pnpm test` - Run all tests
- Test Watch: `pnpm test:watch` - Run tests in watch mode
- Integration Tests: `pnpm test:integration` - Run database integration tests (requires Docker)

## Architecture Overview

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed information flow, PII safety checks, and diagrams. The codebase follows a modular architecture centered around the MCP protocol:

```
src/
├── connectors/          # Database-specific implementations
│   ├── postgres/        # PostgreSQL connector
│   ├── mysql/           # MySQL connector
│   ├── mariadb/         # MariaDB connector
│   ├── sqlserver/       # SQL Server connector
│   └── sqlite/          # SQLite connector
├── tools/               # MCP tool handlers
│   ├── execute-sql.ts   # SQL execution handler (writes results to local files)
│   └── search-objects.ts  # Unified search/list with progressive disclosure
├── utils/               # Shared utilities
│   ├── dsn-obfuscator.ts# DSN security
│   ├── response-formatter.ts # Output formatting (createPiiSafeToolResponse)
│   └── result-writer.ts # Writes query results to .safe-sql-results/
└── index.ts             # Entry point with transport handling
```

Key architectural patterns:
- **Connector Registry**: Dynamic registration system for database connectors
- **Connector Manager**: Manages database connections (single or multiple)
  - Supports multi-database configuration via TOML
  - Maintains `Map<id, Connector>` for named connections
  - `getConnector(sourceId?)` returns connector by ID or default (first)
  - `getCurrentConnector(sourceId?)` static method for tool handlers
  - Backward compatible with single-connection mode
  - Location: `src/connectors/manager.ts`
- **Transport Abstraction**: Support for both stdio (desktop tools) and HTTP (network clients)
  - HTTP transport endpoint: `/mcp` (aligns with official MCP SDK standard)
  - Implemented in `src/server.ts` using `StreamableHTTPServerTransport` with JSON responses
  - Runs in stateless mode (no SSE support) - GET requests to `/mcp` return 405 Method Not Allowed
  - Tests in `src/__tests__/json-rpc-integration.test.ts`
- **Tool Handlers**: Clean separation of MCP protocol concerns
  - Tools accept optional `source_id` parameter for multi-database routing
- **Output Isolation Controls (risk reduction)**: `execute_sql` writes results to `.safe-sql-results/`; tool responses return only success/failure metadata (no file paths, row counts, or column names). Errors return generic messages only; SQL and parameter values are never returned or logged. Output format: `--output-format=csv|json|markdown`
- **Token-Efficient Schema Exploration**: Unified search/list tool
  - `search_objects`: Single tool for pattern-based search and listing; returns names only (PII-safe; summary/full disabled)
  - Pattern parameter defaults to `%` (match all)
  - Supports: schemas, tables, columns, procedures, indexes
- **Integration Test Base**: Shared test utilities for consistent connector testing

## Configuration

DBHub supports three configuration methods (in priority order):

### 1. TOML Configuration File (Multi-Database)
**Recommended for projects requiring multiple database connections**

- Create `dbhub.toml` in your project directory or use `--config=path/to/config.toml`
- Configuration structure:
  - `[[sources]]` - Database connection definitions with unique `id` fields
  - `[[tools]]` - Tool configuration (execution settings for execute_sql, search_objects)
- Example:
  ```toml
  [[sources]]
  id = "prod_pg"
  dsn = "postgres://user:pass@localhost:5432/production"
  connection_timeout = 60
  query_timeout = 30

  [[sources]]
  id = "staging_mysql"
  type = "mysql"
  host = "localhost"
  database = "staging"
  user = "root"
  password = "secret"

  # Tool configuration: connector-level read-only is always enforced
  [[tools]]
  name = "execute_sql"
  source = "prod_pg"
  max_rows = 1000
  ```
- Key files:
  - `src/types/config.ts`: TypeScript interfaces for TOML structure
  - `src/config/toml-loader.ts`: TOML parsing and validation
  - `src/config/__tests__/toml-loader.test.ts`: Comprehensive test suite
- Features:
  - Per-source settings: SSH tunnels, timeouts, SSL configuration
  - Query timeout: Defaults to 60 seconds for all non-SQLite connectors; override with `query_timeout = N` (seconds) in a `[[sources]]` block
  - Per-tool settings: `max_rows` (configured in `[[tools]]` section, not `[[sources]]`). Connector-level read-only is always enforced.
  - Path expansion for `~/` in file paths
  - Automatic password redaction in logs
  - First source is the default database
- Usage in MCP tools: Add optional `source_id` parameter (e.g., `execute_sql(sql, source_id="prod_pg")`)
- See `dbhub.toml.example` for complete configuration reference
- Documentation: https://dbhub.ai/config/toml

### 2. Environment Variables (Single Database)
- Copy `.env.example` to `.env` and configure for your database connection
- Two ways to configure:
  - Set `DSN` to a full connection string (recommended)
  - Set individual parameters: `DB_TYPE`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- SSH tunnel via environment: `SSH_HOST`, `SSH_PORT`, `SSH_USER`, `SSH_PASSWORD`, `SSH_KEY`, `SSH_PASSPHRASE`

### 3. Command-Line Arguments (Single Database, Highest Priority)
- `--dsn`: Database connection string
- `--transport`: `stdio` (default) or `http` for streamable HTTP transport (endpoint: `/mcp`)
- `--port`: HTTP server port (default: 8080)
- `--bind`: HTTP bind address (default: `127.0.0.1`; use `0.0.0.0` for network access). Override via `BIND_ADDRESS` env.
- `--config`: Path to TOML configuration file
- `--demo`: Use bundled SQLite employee database
- `--output-format`: Result file format for local result files: `csv` (default), `json`, or `markdown`
- `--editor`: CLI command to open result files (e.g., `cursor`, `claude`, `codex`, `gemini`). Auto-detected from MCP client when not set. Only supported editors (Cursor, Claude Code, Codex, Gemini) open result files automatically; VS Code/Copilot is not supported. Override via `--editor=cursor` or `EDITOR_COMMAND` env var.
- `--max-rows`: Limit rows returned from SELECT queries (deprecated - use TOML configuration instead)
- SSH tunnel options: `--ssh-host`, `--ssh-port`, `--ssh-user`, `--ssh-password`, `--ssh-key`, `--ssh-passphrase`
- Documentation: https://dbhub.ai/config/command-line

### Configuration Priority Order
1. Command-line arguments (highest)
2. TOML config file (if present)
3. Environment variables
4. `.env` files (`.env.local` in development, `.env` in production)

## Database Connectors

- Add new connectors in `src/connectors/{db-type}/index.ts`
- Implement the `Connector` and `DSNParser` interfaces from `src/connectors/interface.ts`
- Register connector with `ConnectorRegistry.register(connector)`
- DSN Examples:
  - PostgreSQL: `postgres://user:password@localhost:5432/dbname?sslmode=disable`
  - MySQL: `mysql://user:password@localhost:3306/dbname?sslmode=disable`
  - MariaDB: `mariadb://user:password@localhost:3306/dbname?sslmode=disable`
  - SQL Server: `sqlserver://user:password@localhost:1433/dbname?sslmode=disable`
  - SQL Server (named instance): `sqlserver://user:password@localhost:1433/dbname?instanceName=ENV1`
  - SQL Server (NTLM): `sqlserver://user:password@localhost:1433/dbname?authentication=ntlm&domain=MYDOMAIN`
  - SQLite: `sqlite:///path/to/database.db` or `sqlite:///:memory:`
- SSL modes: `sslmode=disable` (no SSL) or `sslmode=require` (SSL without cert verification)

## Testing Approach

See [TESTING.md](TESTING.md) for comprehensive testing documentation.

For detailed guidance on running and troubleshooting tests, refer to the [testing skill](.claude/skills/testing/SKILL.md). This skill is automatically activated when working with tests, test failures, or Docker/database container issues.

Key points:
- Unit tests for individual components and utilities
- Integration tests using Testcontainers for real database testing
- All connectors have comprehensive integration test coverage
- Pre-commit hooks run related tests automatically
- Test specific databases: `pnpm test src/connectors/__tests__/{db-type}.integration.test.ts`
- SSH tunnel tests: `pnpm test postgres-ssh-simple.integration.test.ts`

## SSH Tunnel Support

DBHub supports SSH tunnels for secure database connections through bastion hosts:

- Configuration via command-line options: `--ssh-host`, `--ssh-port`, `--ssh-user`, `--ssh-password`, `--ssh-key`, `--ssh-passphrase`
- Configuration via environment variables: `SSH_HOST`, `SSH_PORT`, `SSH_USER`, `SSH_PASSWORD`, `SSH_KEY`, `SSH_PASSPHRASE`
- SSH config file support: Automatically reads from `~/.ssh/config` when using host aliases
- Implementation in `src/utils/ssh-tunnel.ts` using the `ssh2` library
- SSH config parsing in `src/utils/ssh-config-parser.ts` using the `ssh-config` library
- Automatic tunnel establishment when SSH config is detected
- Support for both password and key-based authentication
- Default SSH key detection (tries `~/.ssh/id_rsa`, `~/.ssh/id_ed25519`, etc.)
- Tunnel lifecycle managed by `ConnectorManager`

## Code Style

- TypeScript with strict mode enabled
- ES modules with `.js` extension in imports
- Group imports: Node.js core modules → third-party → local modules
- Use camelCase for variables/functions, PascalCase for classes/types
- Include explicit type annotations for function parameters/returns
- Use try/finally blocks with DB connections (always release clients)
- Prefer async/await over callbacks and Promise chains
- Format error messages consistently
- Use parameterized queries for DB operations
- Validate inputs with zod schemas
- Include fallbacks for environment variables
- Use descriptive variable/function names
- Keep functions focused and single-purpose
