# dbhub-schema Documentation

Documentation for **dbhub-schema** (fork of [DBHub](https://github.com/bytebase/dbhub)). For upstream docs see [dbhub.ai](https://dbhub.ai).

**dbhub-schema is primarily meant for read-only operations.** Read-only is the default: only read-only SQL (SELECT, WITH, EXPLAIN, etc.) is allowed. To allow write operations, use the `--destructive` flag (single-DSN) or TOML `readonly = false` per tool—with **extreme caution** and only in non-production environments. **Do not use `--destructive` in production, ever.**

Install the [Mintlify CLI](https://www.npmjs.com/package/mint) to preview documentation locally:

```bash
npm i -g mint
```

Run the following command at the root of your documentation (where `docs.json` is located):

```bash
cd docs
mint dev
```
