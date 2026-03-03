/**
 * Security regression tests for PII-safe hardening.
 * Covers: metadata suppression, generic errors, log redaction, request API redaction.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createExecuteSqlToolHandler } from "../tools/execute-sql.js";
import { createSearchDatabaseObjectsToolHandler } from "../tools/search-objects.js";
import { createGenericToolErrorResponse } from "../utils/response-formatter.js";
import { ConnectorManager } from "../connectors/manager.js";
import { getToolRegistry } from "../tools/registry.js";
import type { Connector, ConnectorType, SQLResult } from "../connectors/interface.js";
import { requestStore } from "../requests/index.js";
import { trackToolRequest } from "../utils/tool-handler-helpers.js";

vi.mock("../connectors/manager.js");
vi.mock("../tools/registry.js");
vi.mock("../utils/result-writer.js", () => ({
  writeResultFile: vi.fn(() => "/fake/.safe-sql-results/file.csv"),
}));
vi.mock("../config/output-format.js", () => ({ getOutputFormat: vi.fn(() => "csv") }));

const createMockConnector = (id: ConnectorType = "sqlite"): Connector =>
  ({
    id,
    name: "Mock",
    getId: () => "default",
    dsnParser: {} as any,
    connect: vi.fn(),
    disconnect: vi.fn(),
    clone: vi.fn(),
    getSchemas: vi.fn(),
    getTables: vi.fn(),
    tableExists: vi.fn(),
    getTableSchema: vi.fn(),
    getTableIndexes: vi.fn(),
    getStoredProcedures: vi.fn(),
    getStoredProcedureDetail: vi.fn(),
    executeSQL: vi.fn(),
  }) as Connector;

describe("Security regression: PII-safe hardening", () => {
  beforeEach(() => {
    vi.mocked(getToolRegistry).mockReturnValue({
      getBuiltinToolConfig: vi.fn().mockReturnValue({}),
    } as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
    requestStore.clear();
  });

  describe("metadata suppression (search_objects names only)", () => {
    it("search_objects returns no column_count, row_count, columns, indexes, or procedure definition", async () => {
      const mockConnector = createMockConnector("postgres");
      vi.mocked(mockConnector.getSchemas).mockResolvedValue(["public"]);
      vi.mocked(mockConnector.getTables).mockResolvedValue(["users"]);
      vi.mocked(mockConnector.getTableSchema).mockResolvedValue([
        { column_name: "id", data_type: "INT", is_nullable: "NO", column_default: null },
      ]);
      vi.mocked(mockConnector.getTableIndexes).mockResolvedValue([]);
      vi.mocked(mockConnector.executeSQL).mockResolvedValue({ rows: [{ count: 42 }], rowCount: 1 });
      vi.mocked(ConnectorManager.getCurrentConnector).mockReturnValue(mockConnector);
      vi.mocked(ConnectorManager.getSourceConfig).mockReturnValue(null);
      vi.mocked(ConnectorManager.ensureConnected).mockResolvedValue();

      const handler = createSearchDatabaseObjectsToolHandler();
      const result = await handler(
        { object_type: "table", pattern: "users", detail_level: "names" },
        null
      );
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.data.results[0]).toEqual({ name: "users", schema: "public" });
      expect(parsed.data.results[0]).not.toHaveProperty("column_count");
      expect(parsed.data.results[0]).not.toHaveProperty("row_count");
      expect(parsed.data.results[0]).not.toHaveProperty("columns");
      expect(parsed.data.results[0]).not.toHaveProperty("indexes");
    });
  });

  describe("generic errors (no DB-derived text)", () => {
    it("execute_sql returns generic message on DB error", async () => {
      const mockConnector = createMockConnector();
      vi.mocked(mockConnector.executeSQL).mockRejectedValue(new Error("relation \"users\" does not exist"));
      vi.mocked(ConnectorManager.getCurrentConnector).mockReturnValue(mockConnector);
      vi.mocked(ConnectorManager.ensureConnected).mockResolvedValue();

      const handler = createExecuteSqlToolHandler();
      const result = await handler({ sql: "SELECT * FROM non_existent" }, null);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.error).toBe("Execution failed. See server logs for details.");
      expect(parsed.error).not.toContain("relation");
      expect(parsed.error).not.toContain("users");
    });

    it("createGenericToolErrorResponse never includes DB text", () => {
      const r = createGenericToolErrorResponse("EXECUTION_ERROR");
      const parsed = JSON.parse(r.content[0].text);
      expect(parsed.error).toBe("Execution failed. See server logs for details.");
    });
  });

  describe("log redaction (no SQL/params in stderr)", () => {
    it("execute_sql does not log SQL or parameter values", async () => {
      const mockConnector = createMockConnector();
      vi.mocked(mockConnector.executeSQL).mockRejectedValue(new Error("connection refused"));
      vi.mocked(ConnectorManager.getCurrentConnector).mockReturnValue(mockConnector);
      vi.mocked(ConnectorManager.ensureConnected).mockResolvedValue();

      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const handler = createExecuteSqlToolHandler();
      const secretSql = "SELECT * FROM users WHERE email = 'secret@example.com'";

      await handler({ sql: secretSql }, null);

      const calls = spy.mock.calls.map((c) => String(c[0]));
      expect(calls.join(" ")).not.toContain("SELECT");
      expect(calls.join(" ")).not.toContain("secret@example.com");
      expect(calls.some((c) => c.includes("[execute_sql] Execution failed"))).toBe(true);
      spy.mockRestore();
    });
  });

  describe("request API redaction", () => {
    it("trackToolRequest stores redacted sql and error", () => {
      trackToolRequest(
        { sourceId: "db", toolName: "execute_sql", sql: "SELECT * FROM secret_table" },
        Date.now(),
        {},
        false,
        "column secret does not exist"
      );
      const requests = requestStore.getAll();
      expect(requests).toHaveLength(1);
      expect(requests[0].sql).toBe("[redacted]");
      expect(requests[0].error).toBe("[redacted]");
    });
  });
});
