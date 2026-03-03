const DEFAULT_EDITOR = "cursor";

/** Editors that support ignore files; only these get result files opened automatically */
export const SUPPORTED_EDITORS = ["cursor", "claude", "codex", "gemini"] as const;

let editorCommand: string = DEFAULT_EDITOR;
let explicitlySet = false;
let openingResultsSupported = false;

export function setEditorCommand(cmd: string): void {
  editorCommand = cmd;
}

export function getEditorCommand(): string {
  return editorCommand;
}

export function setEditorExplicitly(value: boolean): void {
  explicitlySet = value;
}

export function isEditorExplicitlySet(): boolean {
  return explicitlySet;
}

export function setOpeningResultsSupported(value: boolean): void {
  openingResultsSupported = value;
}

/**
 * Returns true only when the MCP server runs inside an editor that supports
 * ignore files (Cursor, Claude Code, Codex, Gemini). VS Code/Copilot is not
 * supported — it has no project-level ignore mechanism for .safe-sql-results/.
 */
export function isOpeningResultsSupported(): boolean {
  return openingResultsSupported;
}

/**
 * Check if an editor CLI name is in the supported set.
 */
export function isEditorSupportedForOpening(editor: string): boolean {
  return SUPPORTED_EDITORS.includes(editor.toLowerCase() as (typeof SUPPORTED_EDITORS)[number]);
}

/**
 * Maps MCP client name from the initialize handshake to CLI command.
 * Returns null for VS Code (unsupported) or unknown clients.
 */
export function detectEditorFromClientName(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.includes("cursor")) {
    return "cursor";
  }
  if (lower.includes("claude")) {
    return "claude";
  }
  if (lower.includes("codex")) {
    return "codex";
  }
  if (lower.includes("gemini")) {
    return "gemini";
  }
  // VS Code/Copilot: no mapping — not supported for secure result handling
  if (
    lower.includes("vscode") ||
    lower.includes("vs code") ||
    lower.includes("visual studio code") ||
    lower.includes("copilot")
  ) {
    return null;
  }
  return null;
}
