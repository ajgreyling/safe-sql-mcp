import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { bigIntReplacer } from "./response-formatter.js";
import {
  getEditorCommand,
  isOpeningResultsSupported,
} from "../config/editor-command.js";

export type ResultFormat = "csv" | "json" | "markdown";

const OUTPUT_DIR = ".safe-sql-results";

function ensureOutputDir(): string {
  const dir = path.join(process.cwd(), OUTPUT_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function timestamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${y}${m}${day}_${h}${min}${s}`;
}

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  const str = typeof value === "object" ? JSON.stringify(value, bigIntReplacer) : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(rows: any[]): string {
  if (rows.length === 0) {
    return "";
  }
  const columns = Object.keys(rows[0]);
  const header = columns.map(escapeCsvValue).join(",");
  const lines = rows.map((row) =>
    columns.map((col) => escapeCsvValue(row[col])).join(",")
  );
  return [header, ...lines].join("\n");
}

function toMarkdownTable(rows: any[]): string {
  if (rows.length === 0) {
    return "";
  }
  const columns = Object.keys(rows[0]);
  const header = "| " + columns.join(" | ") + " |";
  const separator = "| " + columns.map(() => "---").join(" | ") + " |";
  const dataRows = rows.map((row) =>
    "| " +
    columns
      .map((col) => {
        const val = row[col];
        const str =
          val === null || val === undefined
            ? ""
            : typeof val === "object"
              ? JSON.stringify(val, bigIntReplacer)
              : String(val);
        return str.replace(/\|/g, "\\|").replace(/\n/g, " ");
      })
      .join(" | ") +
    " |"
  );
  return [header, separator, ...dataRows].join("\n");
}

/**
 * Write query result rows to a file in the project's .safe-sql-results directory.
 * Returns the absolute path to the written file.
 */
export function writeResultFile(
  rows: any[],
  toolName: string,
  format: ResultFormat
): string {
  const dir = ensureOutputDir();
  const ext = format === "markdown" ? "md" : format;
  const sanitizedName = toolName.replace(/[^a-zA-Z0-9_-]/g, "_");
  const filePath = path.join(dir, `${timestamp()}_${sanitizedName}.${ext}`);

  let content: string;
  switch (format) {
    case "csv":
      content = toCsv(rows);
      break;
    case "json":
      content = JSON.stringify(rows, bigIntReplacer, 2);
      break;
    case "markdown":
      content = toMarkdownTable(rows);
      break;
  }

  fs.writeFileSync(filePath, content, "utf-8");
  const resolvedPath = path.resolve(filePath);

  if (isOpeningResultsSupported()) {
    const editorCmd = getEditorCommand();
    exec(`${editorCmd} "${resolvedPath}"`, { timeout: 5000 }, (error) => {
      if (error) {
        console.error(`[result-writer] Failed to open result file in editor: ${error.message}`);
      }
    });
  } else {
    console.error(
      "[result-writer] Result written to .safe-sql-results/ (not opened — client does not support secure result handling)"
    );
  }
  return resolvedPath;
}
