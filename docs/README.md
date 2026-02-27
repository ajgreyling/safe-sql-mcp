# capybara-db-mcp Documentation

> **Your data is safe with Capybara.** Just like capybaras are famously safe and peaceful, **your query results are never shared with an LLM.** Data stays local; only success/failure goes to the model.

Documentation for **capybara-db-mcp** (fork of [DBHub](https://github.com/bytebase/dbhub)). For upstream docs see [dbhub.ai](https://dbhub.ai).

**capybara-db-mcp is unconditionally read-only.** Only read-only SQL (SELECT, WITH, EXPLAIN, SHOW, etc.) is allowed. Write operations (UPDATE, DELETE, INSERT, MERGE, etc.) are never permitted. SQL queries use a safe default timeout of 60 seconds (overridable per source via `query_timeout` in TOML configuration).

**capybara-db-mcp is PII-safe.** Query results are never sent to the LLM. Actual data is written to `.safe-sql-results/`; the LLM receives only success/failure (no row count, column names, or file path to prevent exfiltration). Error responses are hardened: SQL and parameter values are logged locally, not returned to the LLM; database error text is truncated. Your data never reaches the model.

Install the [Mintlify CLI](https://www.npmjs.com/package/mint) to preview documentation locally:

```bash
npm i -g mint
```

Run the following command at the root of your documentation (where `docs.json` is located):

```bash
cd docs
mint dev
```
