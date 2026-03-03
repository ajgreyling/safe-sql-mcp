import { z } from "zod";
import { ConnectorManager } from "../connectors/manager.js";
import { createPiiSafeToolResponse, createGenericToolErrorResponse } from "../utils/response-formatter.js";
import { writeResultFile } from "../utils/result-writer.js";
import { getOutputFormat } from "../config/output-format.js";
import { getToolRegistry } from "./registry.js";
import { BUILTIN_TOOL_EXECUTE_SQL } from "./builtin-tools.js";
import {
  getEffectiveSourceId,
  trackToolRequest,
} from "../utils/tool-handler-helpers.js";

// Schema for execute_sql tool
export const executeSqlSchema = {
  sql: z.string().describe("SQL to execute (multiple statements separated by ;)"),
};

/**
 * Create an execute_sql tool handler for a specific source
 * @param sourceId - The source ID this handler is bound to (undefined for single-source mode)
 * @returns A handler function bound to the specified source
 */
export function createExecuteSqlToolHandler(sourceId?: string) {
  return async (args: any, extra: any) => {
    const { sql } = args as { sql: string };
    const startTime = Date.now();
    const effectiveSourceId = getEffectiveSourceId(sourceId);
    let success = true;
    let errorMessage: string | undefined;
    let result: any;

    try {
      // Ensure source is connected (handles lazy connections)
      await ConnectorManager.ensureConnected(sourceId);

      // Get connector for the specified source (or default)
      const connector = ConnectorManager.getCurrentConnector(sourceId);
      const actualSourceId = connector.getId();

      // Get tool-specific configuration (tool is already registered, so it's enabled)
      const registry = getToolRegistry();
      const toolConfig = registry.getBuiltinToolConfig(BUILTIN_TOOL_EXECUTE_SQL, actualSourceId);

      // Execute the SQL (connector-level read-only enforced by manager)
      const executeOptions = {
        maxRows: toolConfig?.max_rows,
      };
      result = await connector.executeSQL(sql, executeOptions);

      writeResultFile(result.rows, "execute_sql", getOutputFormat());
      return createPiiSafeToolResponse();
    } catch (error) {
      success = false;
      console.error(`[execute_sql] Execution failed`);
      errorMessage = "Execution failed. See server logs for details.";
      return createGenericToolErrorResponse("EXECUTION_ERROR");
    } finally {
      // Track the request
      trackToolRequest(
        {
          sourceId: effectiveSourceId,
          toolName: effectiveSourceId === "default" ? "execute_sql" : `execute_sql_${effectiveSourceId}`,
          sql,
        },
        startTime,
        extra,
        success,
        errorMessage
      );
    }
  };
}
