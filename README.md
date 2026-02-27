# safe-sql-mcp

**safe-sql-mcp** is a community fork of [DBHub](https://github.com/bytebase/dbhub) by [Bytebase](https://www.bytebase.com/). The key difference: **DBHub sends query results (rows, columns, counts) directly to the LLM**, which can expose sensitive data. **safe-sql-mcp is PII-safe**: it writes results to local files, opens them in the editor, and returns only success/failure to the LLM—no data or file path ever reaches the model. It also enforces read-only SQL, keeps the same internal names (e.g. `dbhub.toml`) for easy merging from upstream, and adds **default-schema support** for PostgreSQL and multi-database setups. 

- **Original project:** [github.com/bytebase/dbhub](https://github.com/bytebase/dbhub)
- **This fork:** [github.com/ajgreyling/safe-sql-mcp](https://github.com/ajgreyling/safe-sql-mcp)

To point your clone at this fork:

```bash
git remote set-url origin https://github.com/ajgreyling/safe-sql-mcp.git
```

<p align="center">
<a href="https://dbhub.ai/" target="_blank">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/ajgreyling/safe-sql-mcp/main/docs/images/logo/full-dark.svg" width="75%">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/ajgreyling/safe-sql-mcp/main/docs/images/logo/full-light.svg" width="75%">
  <img src="https://raw.githubusercontent.com/ajgreyling/safe-sql-mcp/main/docs/images/logo/full-light.svg" width="75%" alt="DBHub Logo">
</picture>
</a>
</p>

```mermaid
flowchart LR
    subgraph clients["MCP Clients"]
        A[Claude Desktop]
        B[Claude Code]
        C[Cursor]
        D[VS Code]
        E[Copilot CLI]
    end

    subgraph server["MCP Server"]
        M[safe-sql-mcp]
    end

    subgraph dbs["Databases"]
        P[PostgreSQL]
        S[SQL Server]
        L[SQLite]
        My[MySQL]
        Ma[MariaDB]
    end

    A --> M
    B --> M
    C --> M
    D --> M
    E --> M

    M --> P
    M --> S
    M --> L
    M --> My
    M --> Ma
```

### PII-safe data flow

SQL results never reach the LLM. They are written to local files and opened in the editor; only a success/failure status is returned:

```mermaid
flowchart TB
    subgraph llm["LLM / MCP Client"]
        Q["SQL query"]
        R["Tool response:\n✓ success/failure only"]
    end

    subgraph server["safe-sql-mcp"]
        Exec[Execute SQL]
        Write[Write to .safe-sql-results/]
        Format[createPiiSafeToolResponse]
    end

    subgraph db["Database"]
        DB[(PostgreSQL, SQLite, etc.)]
    end

    subgraph files["Local filesystem"]
        CSV[".safe-sql-results/YYYYMMDD_HHMMSS_execute_sql.csv"]
    end

    Q -->|1. Call execute_sql| Exec
    Exec -->|2. Run query| DB
    DB -->|3. Result rows| Write
    Write -->|4. Data to file, open in editor| CSV
    Write -->|5. Then format success response| Format
    Format -->|6. Success only - no path, count, or columns| R
```

safe-sql-mcp is a zero-dependency, token-efficient MCP server implementing the Model Context Protocol (MCP). It supports the same features as DBHub, plus a default schema.

**This fork is unconditionally read-only.** Only read-only SQL (SELECT, WITH, EXPLAIN, SHOW, etc.) is allowed. Write operations (UPDATE, DELETE, INSERT, MERGE, etc.) are never permitted.

**PII-safe by design.** Query results are never sent to the LLM. Raw data is written to local files (`.safe-sql-results/`) and opened in the editor; the LLM receives only success/failure. No file path, row count, or column names are returned (to prevent exfiltration via dynamic SQL). This prevents personally identifiable information (PII) from ever reaching the model.

- **Local Development First**: Zero dependency, token efficient with just two MCP tools to maximize context window
- **Multi-Database**: PostgreSQL, MySQL, MariaDB, SQL Server, and SQLite through a single interface
- **Multi-Connection**: Connect to multiple databases simultaneously with TOML configuration
- **Default schema**: Use `--schema` (or TOML `schema = "..."`) so PostgreSQL uses that schema for `execute_sql` and `search_objects` is restricted to it (see below)
- **Guardrails**: Unconditionally read-only, row limiting, and a safe 60-second query timeout default (overridable per source via `query_timeout` in `dbhub.toml`) to prevent runaway operations
- **PII-safe**: Query results are written to `.safe-sql-results/` and opened in the editor; only success/failure is sent to the LLM—no file path, row data, count, or column names (prevents exfiltration via dynamic column aliasing)
- **Secure Access**: SSH tunneling and SSL/TLS encryption

## Why Capybara?

The capybara is the spirit animal of safe-sql-mcp: calm, social, and famously safe to be around. It reflects the project's philosophy of peaceful coexistence, predictable behavior, and built-in guardrails.

### The Capybara: A Paragon of Peaceful Coexistence

- **Docile temperament**: Capybaras are known for gentle, non-aggressive behavior and are often seen peacefully sharing space with many species.
- **Herbivorous nature**: As herbivores, they pose no predatory threat to humans or other animals.
- **Social harmony**: They live in cooperative groups, reinforcing a "safe by default" ecosystem.
- **Adaptability**: They thrive in different environments, reducing conflict and stress.
- **Confident calm**: Other animals prefer their company, and capybaras are rarely rattled by neighbors around them.

## Supported Databases

PostgreSQL, MySQL, SQL Server, MariaDB, and SQLite.

## MCP Tools

- **[execute_sql](https://dbhub.ai/tools/execute-sql)**: Execute SQL queries with transaction support and safety controls
- **[search_objects](https://dbhub.ai/tools/search-objects)**: Search and explore database schemas, tables, columns, indexes, and procedures with progressive disclosure
- **[Custom Tools](https://dbhub.ai/tools/custom-tools)**: Define reusable, parameterized SQL operations in your `dbhub.toml` configuration file

## Default schema (`--schema`)

When you set a default schema (via `--schema`, the `SCHEMA` environment variable, or `schema = "..."` in `dbhub.toml` for a source):

- **PostgreSQL**: The connection `search_path` is set so `execute_sql` runs in that schema by default (unqualified table names resolve to that schema).
- **All connectors**: `search_objects` is restricted to that schema unless the tool is called with an explicit `schema` argument.

**Example (Cursor / MCP `mcp.json`):**

```json
{
  "command": "npx",
  "args": [
    "safe-sql-mcp",
    "--transport",
    "stdio",
    "--dsn",
    "postgres://user:password@host:5432/mydb",
    "--schema",
    "my_app_schema",
    "--ssh-host",
    "bastion.example.com",
    "--ssh-port",
    "22",
    "--ssh-user",
    "deploy",
    "--ssh-key",
    "~/.ssh/mykey"
  ]
}
```

**Example (TOML in `dbhub.toml`):**

```toml
[[sources]]
id = "default"
dsn = "postgres://user:password@host:5432/mydb"
schema = "my_app_schema"
```

Full DBHub docs (including TOML and command-line options) apply; see [dbhub.ai](https://dbhub.ai) and [Command-Line Options](https://dbhub.ai/config/command-line).

### PII-safe output

By default, `execute_sql` and custom tools write query results to `.safe-sql-results/` in your project directory and open them in the editor. The MCP tool response sent to the LLM contains only success/failure. **No file path, row data, row count, or column names** are returned—preventing both direct PII leakage and exfiltration via dynamic SQL (e.g. `SELECT secret AS "password_is_hunter2"`). The user inspects results in the editor. Output format is configurable via `--output-format=csv|json|markdown` (default: `csv`).

### Read-only (unconditional)

This fork is unconditionally read-only. Write operations (UPDATE, DELETE, INSERT, MERGE, DROP, CREATE, ALTER, TRUNCATE, etc.) are never allowed. Only read-only SQL (SELECT, WITH, EXPLAIN, SHOW, DESCRIBE, etc.) is permitted.

## Workbench

safe-sql-mcp includes the same [built-in web interface](https://dbhub.ai/workbench/overview) as DBHub for interacting with your database tools.

![workbench](https://raw.githubusercontent.com/bytebase/dbhub/main/docs/images/workbench/workbench.webp)

## Installation

### Quick Start

**NPM (from this repo, after build):**

```bash
pnpm install && pnpm build
npx safe-sql-mcp --transport http --port 8080 --dsn "postgres://user:password@localhost:5432/dbname?sslmode=disable"
```

With a default schema:

```bash
npx safe-sql-mcp --transport stdio --dsn "postgres://user:password@localhost:5432/dbname" --schema "public"
```

**Demo mode:**

```bash
npx safe-sql-mcp --transport http --port 8080 --demo
```

See [Command-Line Options](https://dbhub.ai/config/command-line) for all parameters.

### Multi-Database Setup

Use a `dbhub.toml` file as in DBHub. See [Multi-Database Configuration](https://dbhub.ai/config/toml). You can set `schema = "..."` per source to apply the default schema for that connection.

## Development

```bash
pnpm install
pnpm dev
pnpm build && pnpm start --transport stdio --dsn "postgres://user:password@localhost:5432/dbname"
```

To build and publish to npm: `npm run release`.

See [Testing](.claude/skills/testing/SKILL.md) and [Debug](https://dbhub.ai/config/debug).

## Contributors

Based on [bytebase/dbhub](https://github.com/bytebase/dbhub). See that repository for upstream contributors and star history.
