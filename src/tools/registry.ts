/**
 * Tool Registry
 * Manages tool enablement and configuration across multiple database sources
 */

import type { TomlConfig, ToolConfig, ExecuteSqlToolConfig, SearchObjectsToolConfig } from "../types/config.js";
import { BUILTIN_TOOLS } from "./builtin-tools.js";

/**
 * Registry for managing built-in tools (execute_sql, search_objects) across multiple database sources
 */
export class ToolRegistry {
  private toolsBySource: Map<string, ToolConfig[]>;

  constructor(config: TomlConfig) {
    this.toolsBySource = this.buildRegistry(config);
  }

  /**
   * Check if a tool name is a built-in tool
   */
  private isBuiltinTool(toolName: string): boolean {
    return (BUILTIN_TOOLS as readonly string[]).includes(toolName);
  }

  /**
   * Build the internal registry mapping sources to their enabled tools
   */
  private buildRegistry(config: TomlConfig): Map<string, ToolConfig[]> {
    const registry = new Map<string, ToolConfig[]>();

    // Group tools by source and validate
    for (const tool of config.tools || []) {
      if (!this.isBuiltinTool(tool.name)) {
        throw new Error(
          `Unknown tool '${tool.name}'. Valid tools: ${BUILTIN_TOOLS.join(", ")}. ` +
            `Custom tools are not supported.`
        );
      }

      const existing = registry.get(tool.source) || [];
      existing.push(tool);
      registry.set(tool.source, existing);
    }

    // Backward compatibility: sources without tools get default built-ins
    for (const source of config.sources) {
      if (!registry.has(source.id)) {
        const defaultTools: ToolConfig[] = BUILTIN_TOOLS.map((name) => {
          if (name === "execute_sql") {
            return { name: "execute_sql", source: source.id } satisfies ExecuteSqlToolConfig;
          } else {
            return { name: "search_objects", source: source.id } satisfies SearchObjectsToolConfig;
          }
        });
        registry.set(source.id, defaultTools);
      }
    }

    return registry;
  }

  /**
   * Get all enabled tool configs for a specific source
   */
  getEnabledToolConfigs(sourceId: string): ToolConfig[] {
    return this.toolsBySource.get(sourceId) || [];
  }

  /**
   * Get built-in tool configuration for a specific source
   * Returns undefined if tool is not enabled or not a built-in
   */
  getBuiltinToolConfig(
    toolName: string,
    sourceId: string
  ): ToolConfig | undefined {
    if (!this.isBuiltinTool(toolName)) {
      return undefined;
    }
    const tools = this.getEnabledToolConfigs(sourceId);
    return tools.find((t) => t.name === toolName);
  }

  /**
   * Get all unique tools across all sources (for tools/list response)
   * Returns the union of all enabled tools
   */
  getAllTools(): ToolConfig[] {
    const seen = new Set<string>();
    const result: ToolConfig[] = [];

    for (const tools of this.toolsBySource.values()) {
      for (const tool of tools) {
        if (!seen.has(tool.name)) {
          seen.add(tool.name);
          result.push(tool);
        }
      }
    }

    return result;
  }

  /**
   * Get all built-in tool names that are enabled across any source
   */
  getEnabledBuiltinToolNames(): string[] {
    const enabledBuiltins = new Set<string>();

    for (const tools of this.toolsBySource.values()) {
      for (const tool of tools) {
        if (this.isBuiltinTool(tool.name)) {
          enabledBuiltins.add(tool.name);
        }
      }
    }

    return Array.from(enabledBuiltins);
  }
}

// Global singleton instance
let globalRegistry: ToolRegistry | null = null;

/**
 * Initialize the global tool registry
 */
export function initializeToolRegistry(config: TomlConfig): void {
  globalRegistry = new ToolRegistry(config);
}

/**
 * Get the global tool registry instance
 * Throws if registry has not been initialized
 */
export function getToolRegistry(): ToolRegistry {
  if (!globalRegistry) {
    throw new Error(
      "Tool registry not initialized. Call initializeToolRegistry first."
    );
  }
  return globalRegistry;
}
