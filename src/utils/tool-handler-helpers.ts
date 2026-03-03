/**
 * Tool Handler Helpers
 * Shared utilities for MCP tool handlers to reduce boilerplate
 */

import { requestStore } from "../requests/index.js";
import { getClientIdentifier } from "./client-identifier.js";

/**
 * Request metadata for tracking
 */
export interface RequestMetadata {
  sourceId: string;
  toolName: string;
  sql: string;
}

/**
 * Normalize source ID to handle optional parameter
 * @param sourceId Optional source ID from tool arguments
 * @returns Effective source ID ("default" if not provided)
 */
export function getEffectiveSourceId(sourceId?: string): string {
  return sourceId || "default";
}

/** Sentinel for redacted sensitive fields in request telemetry (PII-safe). */
const REDACTED = "[redacted]";

/**
 * Track a tool request in the request store.
 * SQL and error text are redacted to prevent exposure via API.
 */
export function trackToolRequest(
  metadata: RequestMetadata,
  startTime: number,
  extra: any,
  success: boolean,
  error?: string
): void {
  requestStore.add({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    sourceId: metadata.sourceId,
    toolName: metadata.toolName,
    sql: REDACTED,
    durationMs: Date.now() - startTime,
    client: getClientIdentifier(extra),
    success,
    error: error !== undefined ? REDACTED : undefined,
  });
}

/**
 * Higher-order function to wrap tool handlers with automatic request tracking
 * @param handler Core handler logic that performs the actual work
 * @param getMetadata Function to extract request metadata from args and result
 * @returns Wrapped handler with automatic request tracking
 */
export function withRequestTracking<TArgs = any, TResult = any>(
  handler: (args: TArgs, extra: any) => Promise<TResult>,
  getMetadata: (args: TArgs, result?: TResult, error?: Error) => RequestMetadata
) {
  return async (args: TArgs, extra: any): Promise<TResult> => {
    const startTime = Date.now();
    let success = true;
    let errorMessage: string | undefined;
    let result: TResult | undefined;
    let error: Error | undefined;

    try {
      result = await handler(args, extra);
      return result;
    } catch (err) {
      success = false;
      error = err as Error;
      errorMessage = error.message;
      throw err;
    } finally {
      const metadata = getMetadata(args, result, error);
      trackToolRequest(metadata, startTime, extra, success, errorMessage);
    }
  };
}
