import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { ensureSafeSqlResultsInIgnoreFiles } from "../ignore-file-sync.js";

describe("ignore-file-sync", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ignore-file-sync-test-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("should create only the editor-specific ignore file when editor is provided", () => {
    ensureSafeSqlResultsInIgnoreFiles(tempDir, "cursor");

    const cursorignore = fs.readFileSync(path.join(tempDir, ".cursorignore"), "utf-8");
    expect(cursorignore).toContain(".safe-sql-results/");
    expect(cursorignore).toContain("PII");

    expect(fs.existsSync(path.join(tempDir, ".claudeignore"))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, ".codeiumignore"))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, ".geminiignore"))).toBe(false);
  });

  it("should not create any files when no editor provided and none exist", () => {
    ensureSafeSqlResultsInIgnoreFiles(tempDir);

    expect(fs.existsSync(path.join(tempDir, ".cursorignore"))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, ".claudeignore"))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, ".codeiumignore"))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, ".geminiignore"))).toBe(false);
  });

  it("should append .safe-sql-results/ to existing .cursorignore when missing", () => {
    const cursorignorePath = path.join(tempDir, ".cursorignore");
    fs.writeFileSync(cursorignorePath, "node_modules/\ndist/\n", "utf-8");

    ensureSafeSqlResultsInIgnoreFiles(tempDir);
    const content = fs.readFileSync(cursorignorePath, "utf-8");
    expect(content).toContain("node_modules/");
    expect(content).toContain("dist/");
    expect(content).toContain(".safe-sql-results/");
  });

  it("should not duplicate .safe-sql-results/ when already present", () => {
    const cursorignorePath = path.join(tempDir, ".cursorignore");
    const initial = "# Comment\n.safe-sql-results/\n";
    fs.writeFileSync(cursorignorePath, initial, "utf-8");

    ensureSafeSqlResultsInIgnoreFiles(tempDir);

    const content = fs.readFileSync(cursorignorePath, "utf-8");
    const count = (content.match(/\.safe-sql-results\/?/g) ?? []).length;
    expect(count).toBe(1);
  });

  it("should remove ! negation overrides for .safe-sql-results", () => {
    const cursorignorePath = path.join(tempDir, ".cursorignore");
    fs.writeFileSync(
      cursorignorePath,
      ".safe-sql-results/\n!.safe-sql-results/foo.csv\n!.safe-sql-results/*\n",
      "utf-8"
    );

    ensureSafeSqlResultsInIgnoreFiles(tempDir, "cursor");
    const content = fs.readFileSync(cursorignorePath, "utf-8");
    expect(content).not.toContain("!.safe-sql-results");
    expect(content).toContain(".safe-sql-results/");
  });

  it("should remove negation and append entry when entry missing but negation present", () => {
    const cursorignorePath = path.join(tempDir, ".cursorignore");
    fs.writeFileSync(cursorignorePath, "!.safe-sql-results/some-file.json\n", "utf-8");

    ensureSafeSqlResultsInIgnoreFiles(tempDir);

    const content = fs.readFileSync(cursorignorePath, "utf-8");
    expect(content).not.toContain("!.safe-sql-results");
    expect(content).toContain(".safe-sql-results/");
  });

  it("should update only existing ignore files when no editor provided", () => {
    fs.writeFileSync(path.join(tempDir, ".cursorignore"), "dist/\n", "utf-8");
    fs.writeFileSync(path.join(tempDir, ".claudeignore"), "*.log\n", "utf-8");

    ensureSafeSqlResultsInIgnoreFiles(tempDir);

    expect(fs.readFileSync(path.join(tempDir, ".cursorignore"), "utf-8")).toContain(
      ".safe-sql-results/"
    );
    expect(fs.readFileSync(path.join(tempDir, ".claudeignore"), "utf-8")).toContain(
      ".safe-sql-results/"
    );
    expect(fs.existsSync(path.join(tempDir, ".codeiumignore"))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, ".geminiignore"))).toBe(false);
  });
});
