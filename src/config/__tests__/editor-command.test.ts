import { describe, it, expect, beforeEach } from "vitest";
import {
  getEditorCommand,
  setEditorCommand,
  setEditorExplicitly,
  setOpeningResultsSupported,
  isEditorExplicitlySet,
  isOpeningResultsSupported,
  isEditorSupportedForOpening,
  detectEditorFromClientName,
} from "../editor-command.js";

describe("editor-command", () => {
  beforeEach(() => {
    setEditorCommand("cursor");
    setEditorExplicitly(false);
    setOpeningResultsSupported(false);
  });

  describe("getEditorCommand / setEditorCommand", () => {
    it("should default to cursor", () => {
      setEditorCommand("cursor");
      expect(getEditorCommand()).toBe("cursor");
    });

    it("should return set value", () => {
      setEditorCommand("claude");
      expect(getEditorCommand()).toBe("claude");
    });
  });

  describe("isEditorExplicitlySet / setEditorExplicitly", () => {
    it("should return false by default", () => {
      expect(isEditorExplicitlySet()).toBe(false);
    });

    it("should return true when explicitly set", () => {
      setEditorExplicitly(true);
      expect(isEditorExplicitlySet()).toBe(true);
    });
  });

  describe("isOpeningResultsSupported / setOpeningResultsSupported", () => {
    it("should return false when unsupported client detected", () => {
      setOpeningResultsSupported(false);
      expect(isOpeningResultsSupported()).toBe(false);
    });

    it("should return true when supported client detected", () => {
      setOpeningResultsSupported(true);
      expect(isOpeningResultsSupported()).toBe(true);
    });
  });

  describe("isEditorSupportedForOpening", () => {
    it("should return true for supported editors", () => {
      expect(isEditorSupportedForOpening("cursor")).toBe(true);
      expect(isEditorSupportedForOpening("claude")).toBe(true);
      expect(isEditorSupportedForOpening("codex")).toBe(true);
      expect(isEditorSupportedForOpening("gemini")).toBe(true);
    });

    it("should return false for unsupported editors", () => {
      expect(isEditorSupportedForOpening("code")).toBe(false);
      expect(isEditorSupportedForOpening("unknown")).toBe(false);
      expect(isEditorSupportedForOpening("")).toBe(false);
    });
  });

  describe("detectEditorFromClientName", () => {
    it("should map cursor to cursor", () => {
      expect(detectEditorFromClientName("cursor")).toBe("cursor");
      expect(detectEditorFromClientName("Cursor")).toBe("cursor");
      expect(detectEditorFromClientName("cursor-mcp-client")).toBe("cursor");
    });

    it("should map claude to claude", () => {
      expect(detectEditorFromClientName("claude")).toBe("claude");
      expect(detectEditorFromClientName("Claude Code")).toBe("claude");
      expect(detectEditorFromClientName("claude-desktop")).toBe("claude");
    });

    it("should map codex to codex", () => {
      expect(detectEditorFromClientName("codex")).toBe("codex");
      expect(detectEditorFromClientName("Codex CLI")).toBe("codex");
    });

    it("should map gemini to gemini", () => {
      expect(detectEditorFromClientName("gemini")).toBe("gemini");
      expect(detectEditorFromClientName("Gemini Code Assist")).toBe("gemini");
    });

    it("should return null for VS Code / Copilot (unsupported)", () => {
      expect(detectEditorFromClientName("vscode")).toBeNull();
      expect(detectEditorFromClientName("VS Code")).toBeNull();
      expect(detectEditorFromClientName("Visual Studio Code")).toBeNull();
      expect(detectEditorFromClientName("copilot")).toBeNull();
    });

    it("should return null for unknown clients", () => {
      expect(detectEditorFromClientName("unknown")).toBeNull();
      expect(detectEditorFromClientName("")).toBeNull();
    });
  });
});
