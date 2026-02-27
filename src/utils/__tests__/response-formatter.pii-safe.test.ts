import { describe, it, expect } from "vitest";
import { createPiiSafeToolResponse, truncateForLLM } from "../response-formatter.js";

describe("truncateForLLM", () => {
  it("returns message unchanged when under max length", () => {
    const short = "connection refused";
    expect(truncateForLLM(short)).toBe(short);
  });

  it("truncates long messages and appends hint", () => {
    const long = "x".repeat(300);
    const result = truncateForLLM(long);
    expect(result.length).toBeLessThan(300);
    expect(result).toContain("... (truncated, see server logs)");
    expect(result.slice(0, 256)).toBe("x".repeat(256));
  });
});

describe("createPiiSafeToolResponse", () => {
  it("returns success only (no file_path) to prevent exfiltration via column aliasing", () => {
    const response = createPiiSafeToolResponse();

    expect(response.content).toHaveLength(1);
    expect(response.content[0].type).toBe("text");
    expect(response.content[0].mimeType).toBe("application/json");

    const payload = JSON.parse(response.content[0].text);
    expect(payload.success).toBe(true);
    expect(payload.data).toEqual({});
    expect(payload.data.file_path).toBeUndefined();
    expect(payload.data.rows).toBeUndefined();
    expect(payload.data.columns).toBeUndefined();
    expect(payload.data.count).toBeUndefined();
  });
});
