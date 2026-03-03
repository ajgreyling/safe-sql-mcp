import fs from "fs";
import path from "path";

/** Map supported editor names to their ignore file names */
const EDITOR_TO_IGNORE_FILE: Record<string, string> = {
  cursor: ".cursorignore",
  claude: ".claudeignore",
  codex: ".codeiumignore",
  gemini: ".geminiignore",
};

/** All known AI ignore file names (for updating existing files only) */
const AI_IGNORE_FILES = [
  ".cursorignore",
  ".claudeignore",
  ".codeiumignore",
  ".geminiignore",
] as const;

const ENTRY = ".safe-sql-results/";
const ENTRY_COMMENT =
  "# Query result files — contains PII data (names, SSNs, emails, DOBs, etc.)\n# These files must never be indexed, read, or included in AI context.";

/** Regex to match negation lines for .safe-sql-results (e.g. !.safe-sql-results/, !.safe-sql-results/*) */
const NEGATION_PATTERN = /^\s*!\.safe-sql-results(\/.*)?\s*$/gm;

/** Regex to check if entry already present (with or without trailing slash) */
const ENTRY_PRESENT = /\.safe-sql-results\/?(\s|$)/m;

/**
 * Remove any ! negation overrides for .safe-sql-results from content.
 */
function removeNegationOverrides(content: string): string {
  return content.replace(NEGATION_PATTERN, "").replace(/\n{3,}/g, "\n\n");
}

/**
 * Check if .safe-sql-results entry is already present in content.
 */
function hasEntry(content: string): boolean {
  return ENTRY_PRESENT.test(content);
}

function syncIgnoreFile(filePath: string, createIfMissing: boolean): void {
  const exists = fs.existsSync(filePath);
  if (!exists && !createIfMissing) return;

  if (exists) {
    let content = fs.readFileSync(filePath, "utf-8");
    content = removeNegationOverrides(content);
    if (!hasEntry(content)) {
      const trimmed = content.trimEnd();
      const appended = trimmed ? `${trimmed}\n\n${ENTRY}\n` : `${ENTRY_COMMENT}\n${ENTRY}\n`;
      fs.writeFileSync(filePath, appended, "utf-8");
    } else {
      fs.writeFileSync(filePath, content, "utf-8");
    }
  } else {
    const content = `${ENTRY_COMMENT}\n${ENTRY}\n`;
    fs.writeFileSync(filePath, content, "utf-8");
  }
}

/**
 * Ensure .safe-sql-results/ is present in AI ignore files at project root.
 * - When editor is provided: sync only that editor's ignore file (create if missing).
 * - When editor is not provided: only update existing ignore files; never create new ones.
 */
export function ensureSafeSqlResultsInIgnoreFiles(
  projectRoot: string,
  editor?: string
): void {
  if (editor) {
    const fileName = EDITOR_TO_IGNORE_FILE[editor.toLowerCase()];
    if (fileName) {
      syncIgnoreFile(path.join(projectRoot, fileName), true);
    }
    return;
  }
  for (const fileName of AI_IGNORE_FILES) {
    syncIgnoreFile(path.join(projectRoot, fileName), false);
  }
}
