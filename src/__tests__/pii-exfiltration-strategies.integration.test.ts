/**
 * PII exfiltration strategy tests for capybara-db-mcp.
 * Attempts ~26 attack strategies via execute_sql and search_objects against the
 * real capybara-test database. Asserts that no PII ever leaks into MCP responses.
 *
 * Requires: PostgreSQL with capybara-test DB and sensitive_client_data schema populated.
 *
 * Findings (all strategies blocked from leaking PII to MCP client):
 * - Direct extraction (Category 1): Data isolated to .safe-sql-results/; response is {success, data:{}} only.
 * - Column/alias smuggling (Category 2): Column names and values never appear in response.
 * - Error-based (Category 3): All errors return generic "Execution failed. See server logs for details."
 * - pg_read_file/pg_ls_dir/COPY (Category 4): Results written to file only, not returned.
 * - Write/DDL (Category 5): Read-only blocks at connector; generic error returned.
 * - System catalogs (Category 6): Metadata isolated to file.
 * - search_objects (Category 7): Names only; detail_level forced to "names"; no row_count, columns, types.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import pg from "pg";

const testPort = 3002;
const cwd = path.resolve(process.cwd());
const DSN = "postgres://postgres:postgres@localhost:5432/capybara-test";

describe("PII exfiltration strategy tests", () => {
  let serverProcess: ChildProcess | null = null;
  let baseUrl: string;
  let knownPii: { ssn: string; email: string; name: string }[] = [];

  beforeAll(async () => {
    baseUrl = `http://localhost:${testPort}`;

    // Fetch known PII from DB for assertion (via pg, not MCP)
    const client = new pg.Client({ connectionString: DSN });
    await client.connect();
    const res = await client.query(
      "SELECT ssn, email, first_name FROM sensitive_client_data.client_profile LIMIT 5"
    );
    knownPii = res.rows.map((r) => ({
      ssn: String(r.ssn),
      email: String(r.email),
      name: String(r.first_name),
    }));
    await client.end();

    // Start MCP server (use env vars for config, same pattern as json-rpc-integration)
    serverProcess = spawn(
      "pnpm",
      ["exec", "tsx", "src/index.ts", "--transport=http", "--output-format=json"],
      {
        cwd,
        env: {
          ...process.env,
          NODE_ENV: "test",
          DSN,
          TRANSPORT: "http",
          PORT: String(testPort),
          SCHEMA: "sensitive_client_data",
        },
        stdio: "pipe",
      }
    );

    serverProcess.stdout?.on("data", () => {});
    serverProcess.stderr?.on("data", () => {});

    // Wait for server ready
    let serverReady = false;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const r = await fetch(`${baseUrl}/mcp`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
          body: JSON.stringify({ jsonrpc: "2.0", id: "hc", method: "notifications/initialized" }),
        });
        if (r.status < 500) {
          serverReady = true;
          break;
        }
      } catch {
        // continue
      }
    }
    if (!serverReady) {
      throw new Error("Server did not start within 30s");
    }
  }, 60000);

  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        if (serverProcess) {
          serverProcess.on("exit", () => resolve());
          setTimeout(() => {
            if (serverProcess && !serverProcess.killed) serverProcess.kill("SIGKILL");
            resolve();
          }, 5000);
        } else resolve();
      });
    }
  });

  async function makeJsonRpcCall(tool: string, params: Record<string, unknown>): Promise<any> {
    const r = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Math.random().toString(36).slice(2, 11),
        method: "tools/call",
        params: { name: tool, arguments: params },
      }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  function getResponseText(response: any): string {
    if (response.error) return JSON.stringify(response.error);
    const content = response.result?.content?.[0];
    return content?.text ?? "";
  }

  function assertNoPiiInResponse(text: string): void {
    // SSN pattern
    expect(text).not.toMatch(/\d{3}-\d{2}-\d{4}/);
    // Email pattern
    expect(text).not.toMatch(/[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    // US phone
    expect(text).not.toMatch(/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/);
    expect(text).not.toMatch(/\(\d{3}\)\s*\d{3}[-]\d{4}/);
    // Known PII from DB
    for (const p of knownPii) {
      expect(text).not.toContain(p.ssn);
      expect(text).not.toContain(p.email);
      expect(text).not.toContain(p.name);
    }
  }

  function parseExecuteSqlResponse(response: any): { success: boolean; error?: string; code?: string } {
    const text = getResponseText(response);
    try {
      const content = JSON.parse(text);
      return {
        success: content.success === true,
        error: content.error,
        code: content.code,
      };
    } catch {
      return { success: false };
    }
  }

  function parseSearchObjectsResponse(response: any): any {
    const text = getResponseText(response);
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  }

  describe("Category 1: Direct data extraction via execute_sql", () => {
    it.each([
      ["SELECT * FROM sensitive_client_data.client_profile LIMIT 10"],
      ["SELECT ssn, email, phone_number FROM sensitive_client_data.client_profile LIMIT 5"],
      [
        "SELECT string_agg(ssn, ',') AS all_ssns FROM sensitive_client_data.client_profile",
      ],
      [
        "SELECT json_agg(row_to_json(cp)) FROM (SELECT * FROM sensitive_client_data.client_profile LIMIT 5) cp",
      ],
      [
        "SELECT cp.ssn, ca.street_address, cf.account_number FROM sensitive_client_data.client_profile cp JOIN sensitive_client_data.client_address ca ON cp.client_id = ca.client_id JOIN sensitive_client_data.client_financial_account cf ON cp.client_id = cf.client_id LIMIT 10",
      ],
    ])("direct extract: MCP response contains no PII", async ([sql]) => {
      const response = await makeJsonRpcCall("execute_sql", { sql });
      const text = getResponseText(response);
      assertNoPiiInResponse(text);
      const parsed = parseExecuteSqlResponse(response);
      if (parsed.success) {
        expect(text).toContain('"success":true');
        expect(text).not.toContain("file_path");
      } else {
        expect(parsed.error).toBe("Execution failed. See server logs for details.");
      }
      expect(text).not.toMatch(/\d{3}-\d{2}-\d{4}/);
    });
  });

  describe("Category 2: Column alias / metadata smuggling", () => {
    it("subquery as alias: MCP response contains no PII", async () => {
      const sql =
        "SELECT (SELECT ssn FROM sensitive_client_data.client_profile LIMIT 1) AS leaked_ssn FROM generate_series(1,1)";
      const response = await makeJsonRpcCall("execute_sql", { sql });
      const text = getResponseText(response);
      assertNoPiiInResponse(text);
      expect(text).not.toMatch(/\d{3}-\d{2}-\d{4}/);
    });

    it("column name containing SSN: MCP response contains no PII", async () => {
      const knownSsn = knownPii[0]?.ssn ?? "123-45-6789";
      const sql = `SELECT 1 AS "${knownSsn}"`;
      const response = await makeJsonRpcCall("execute_sql", { sql });
      const text = getResponseText(response);
      assertNoPiiInResponse(text);
      expect(text).not.toContain(knownSsn);
    });

    it("nested subquery exfil: MCP response contains no PII", async () => {
      const sql = `SELECT (SELECT email FROM sensitive_client_data.client_profile ORDER BY client_id LIMIT 1) AS exfil FROM generate_series(1,1)`;
      const response = await makeJsonRpcCall("execute_sql", { sql });
      const text = getResponseText(response);
      assertNoPiiInResponse(text);
      expect(text).not.toMatch(/@[a-zA-Z0-9.-]+\.[a-zA-Z]/);
    });
  });

  describe("Category 3: Error-based exfiltration", () => {
    it("type cast error: generic message only, no PII", async () => {
      const sql =
        "SELECT CAST(ssn AS INTEGER) FROM sensitive_client_data.client_profile LIMIT 1";
      const response = await makeJsonRpcCall("execute_sql", { sql });
      const text = getResponseText(response);
      assertNoPiiInResponse(text);
      const parsed = parseExecuteSqlResponse(response);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe("Execution failed. See server logs for details.");
      expect(text).not.toMatch(/\d{3}-\d{2}-\d{4}/);
    });

    it("division by zero: generic message only", async () => {
      const sql = "SELECT 1/0 FROM sensitive_client_data.client_profile LIMIT 1";
      const response = await makeJsonRpcCall("execute_sql", { sql });
      const text = getResponseText(response);
      assertNoPiiInResponse(text);
      const parsed = parseExecuteSqlResponse(response);
      expect(parsed.success).toBe(false);
    });

    it("RAISE with PII: generic message only", async () => {
      const sql = `DO $$ BEGIN RAISE EXCEPTION '%', (SELECT ssn FROM sensitive_client_data.client_profile LIMIT 1); END $$;`;
      const response = await makeJsonRpcCall("execute_sql", { sql });
      const text = getResponseText(response);
      assertNoPiiInResponse(text);
      expect(text).not.toMatch(/\d{3}-\d{2}-\d{4}/);
    });

    it("INSERT (read-only blocked): generic message only", async () => {
      const sql = `INSERT INTO sensitive_client_data.client_profile (email, ssn, first_name, last_name, date_of_birth, phone_number) SELECT email, ssn, first_name, last_name, date_of_birth, phone_number FROM sensitive_client_data.client_profile LIMIT 1`;
      const response = await makeJsonRpcCall("execute_sql", { sql });
      const text = getResponseText(response);
      assertNoPiiInResponse(text);
    });

    it("invalid function with PII argument: generic message only", async () => {
      const sql =
        "SELECT non_existent_func(ssn) FROM sensitive_client_data.client_profile LIMIT 1";
      const response = await makeJsonRpcCall("execute_sql", { sql });
      const text = getResponseText(response);
      assertNoPiiInResponse(text);
    });
  });

  describe("Category 4: PostgreSQL server-side function abuse", () => {
    it("pg_read_file: MCP response contains no file contents", async () => {
      const sql = "SELECT pg_read_file('/etc/passwd') AS contents";
      const response = await makeJsonRpcCall("execute_sql", { sql });
      const text = getResponseText(response);
      // Response should be PII-safe: either success with empty data, or generic error
      assertNoPiiInResponse(text);
      // Should not contain typical /etc/passwd content
      expect(text).not.toContain("root:");
      expect(text).not.toContain("/bin/");
    });

    it("pg_ls_dir: MCP response contains no dir listing", async () => {
      const sql = "SELECT * FROM pg_ls_dir('/tmp')";
      const response = await makeJsonRpcCall("execute_sql", { sql });
      const text = getResponseText(response);
      assertNoPiiInResponse(text);
    });

    it("COPY TO STDOUT: MCP response contains no data", async () => {
      const sql =
        "COPY (SELECT * FROM sensitive_client_data.client_profile LIMIT 5) TO STDOUT WITH CSV HEADER";
      const response = await makeJsonRpcCall("execute_sql", { sql });
      const text = getResponseText(response);
      assertNoPiiInResponse(text);
      expect(text).not.toMatch(/\d{3}-\d{2}-\d{4}/);
    });
  });

  describe("Category 5: Write / DDL attempts", () => {
    it("INSERT: generic error, no PII", async () => {
      const sql = `INSERT INTO sensitive_client_data.client_profile (first_name, last_name, date_of_birth, gender, email, phone_number, ssn) VALUES ('Test','User','2000-01-01','Male','hack@test.com','555-0000','000-00-0000')`;
      const response = await makeJsonRpcCall("execute_sql", { sql });
      const text = getResponseText(response);
      const parsed = parseExecuteSqlResponse(response);
      expect(parsed.success).toBe(false);
      assertNoPiiInResponse(text);
    });

    it("UPDATE: generic error", async () => {
      const sql = "UPDATE sensitive_client_data.client_profile SET first_name = 'HACKED' WHERE client_id = 1";
      const response = await makeJsonRpcCall("execute_sql", { sql });
      const parsed = parseExecuteSqlResponse(response);
      expect(parsed.success).toBe(false);
      assertNoPiiInResponse(getResponseText(response));
    });

    it("DELETE: generic error", async () => {
      const sql = "DELETE FROM sensitive_client_data.client_profile WHERE client_id = 1";
      const response = await makeJsonRpcCall("execute_sql", { sql });
      const parsed = parseExecuteSqlResponse(response);
      expect(parsed.success).toBe(false);
      assertNoPiiInResponse(getResponseText(response));
    });

    it("CREATE TABLE AS: generic error", async () => {
      const sql =
        "CREATE TABLE public.leaked AS SELECT * FROM sensitive_client_data.client_profile";
      const response = await makeJsonRpcCall("execute_sql", { sql });
      const parsed = parseExecuteSqlResponse(response);
      expect(parsed.success).toBe(false);
      assertNoPiiInResponse(getResponseText(response));
    });
  });

  describe("Category 6: System catalog / information_schema", () => {
    it("information_schema.columns: MCP response PII-safe", async () => {
      const sql = `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'sensitive_client_data' AND table_name = 'client_profile'`;
      const response = await makeJsonRpcCall("execute_sql", { sql });
      const text = getResponseText(response);
      assertNoPiiInResponse(text);
      const parsed = parseExecuteSqlResponse(response);
      expect(parsed.success).toBe(true);
      expect(text).not.toContain("file_path");
    });

    it("pg_stat_activity: MCP response PII-safe", async () => {
      const sql = "SELECT datname, pid FROM pg_stat_activity WHERE datname = 'capybara-test' LIMIT 1";
      const response = await makeJsonRpcCall("execute_sql", { sql });
      const text = getResponseText(response);
      assertNoPiiInResponse(text);
    });
  });

  describe("Category 7: search_objects metadata disclosure", () => {
    it("table search: names only, no row_count or column_count", async () => {
      const response = await makeJsonRpcCall("search_objects", {
        object_type: "table",
        schema: "sensitive_client_data",
      });
      const text = getResponseText(response);
      assertNoPiiInResponse(text);
      const parsed = parseSearchObjectsResponse(response);
      expect(parsed.success).toBe(true);
      const results = parsed.data?.results ?? [];
      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r).toHaveProperty("name");
        expect(r).toHaveProperty("schema");
        expect(r).not.toHaveProperty("row_count");
        expect(r).not.toHaveProperty("column_count");
        expect(r).not.toHaveProperty("columns");
      }
    });

    it("column search: names only, no type or nullable", async () => {
      const response = await makeJsonRpcCall("search_objects", {
        object_type: "column",
        schema: "sensitive_client_data",
        table: "client_profile",
      });
      const text = getResponseText(response);
      assertNoPiiInResponse(text);
      const parsed = parseSearchObjectsResponse(response);
      const results = parsed.data?.results ?? [];
      for (const r of results) {
        expect(r).toHaveProperty("name");
        expect(r).not.toHaveProperty("type");
        expect(r).not.toHaveProperty("nullable");
        expect(r).not.toHaveProperty("default");
      }
    });

    it("schema search: names only", async () => {
      const response = await makeJsonRpcCall("search_objects", { object_type: "schema" });
      const text = getResponseText(response);
      assertNoPiiInResponse(text);
      const parsed = parseSearchObjectsResponse(response);
      expect(parsed.success).toBe(true);
    });

    it("detail_level full bypass: server ignores or validates, names only", async () => {
      const response = await makeJsonRpcCall("search_objects", {
        object_type: "table",
        schema: "sensitive_client_data",
        detail_level: "full",
      });
      const text = getResponseText(response);
      assertNoPiiInResponse(text);
      const parsed = parseSearchObjectsResponse(response);
      if (parsed.success && parsed.data?.results?.length) {
        const first = parsed.data.results[0];
        expect(first).not.toHaveProperty("row_count");
        expect(first).not.toHaveProperty("columns");
      }
    });
  });
});
