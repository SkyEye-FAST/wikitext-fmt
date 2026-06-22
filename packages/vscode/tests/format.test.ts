import { describe, expect, it, vi } from "vitest";
import {
  buildEditorSettings,
  buildFormatOptions,
  formatTextForEditor,
  getEditorFormattingResult,
  type ConfigLike,
  type FormatterApi,
} from "../src/format.js";

function config(values: Record<string, unknown> = {}): ConfigLike {
  return {
    get<T>(key: string, defaultValue: T): T {
      return (key in values ? values[key] : defaultValue) as T;
    },
  };
}

describe("VS Code formatter wrapper options", () => {
  it("maps default settings", () => {
    const settings = buildEditorSettings(config());

    expect(settings.safe).toBe(true);
    expect(settings.options).toMatchObject({
      level: "normal",
      htmlVoidTagStyle: "html5",
      formatTables: false,
      formatReferences: false,
      formatSectionSpacing: false,
      formatTemplateParameters: false,
    });
  });

  it("maps experimental booleans", () => {
    const options = buildFormatOptions(
      config({
        level: "experimental",
        htmlVoidTagStyle: "preserve",
        formatTables: true,
        formatReferences: true,
        formatSectionSpacing: true,
        formatTemplateParameters: true,
      }),
    );

    expect(options).toMatchObject({
      level: "experimental",
      htmlVoidTagStyle: "preserve",
      formatTables: true,
      formatReferences: true,
      formatSectionSpacing: true,
      formatTemplateParameters: true,
    });
  });
});

describe("VS Code formatter wrapper behavior", () => {
  it("uses safe formatting when safe is true", () => {
    const formatter: FormatterApi = {
      formatWikitext: vi.fn(() => "normal"),
      formatWikitextSafe: vi.fn(() => ({ formatted: "safe" })),
    };

    const result = formatTextForEditor(
      "==Title==",
      { safe: true, options: { level: "normal" } },
      formatter,
    );

    expect(result.formatted).toBe("safe");
    expect(formatter.formatWikitextSafe).toHaveBeenCalledOnce();
    expect(formatter.formatWikitext).not.toHaveBeenCalled();
  });

  it("uses non-safe formatting when safe is false", () => {
    const formatter: FormatterApi = {
      formatWikitext: vi.fn(() => "normal"),
      formatWikitextSafe: vi.fn(() => ({ formatted: "safe" })),
    };

    const result = formatTextForEditor(
      "==Title==",
      { safe: false, options: { level: "normal" } },
      formatter,
    );

    expect(result.formatted).toBe("normal");
    expect(formatter.formatWikitext).toHaveBeenCalledOnce();
    expect(formatter.formatWikitextSafe).not.toHaveBeenCalled();
  });

  it("returns warning result instead of an edit decision", () => {
    const formatter: FormatterApi = {
      formatWikitext: vi.fn(() => "unused"),
      formatWikitextSafe: vi.fn(() => ({
        formatted: "original",
        warning: "safe check failed",
      })),
    };

    expect(
      getEditorFormattingResult(
        "original",
        { safe: true, options: {} },
        formatter,
      ),
    ).toEqual({
      kind: "warning",
      formatted: "original",
      warning: "safe check failed",
    });
  });

  it("reports unchanged output as no edit", () => {
    const formatter: FormatterApi = {
      formatWikitext: vi.fn(() => "original"),
      formatWikitextSafe: vi.fn(() => ({ formatted: "original" })),
    };

    expect(
      getEditorFormattingResult(
        "original",
        { safe: true, options: {} },
        formatter,
      ),
    ).toEqual({
      kind: "unchanged",
      formatted: "original",
    });
  });

  it("reports changed output for full-document replacement", () => {
    const result = getEditorFormattingResult("==Title==", {
      safe: true,
      options: {},
    });

    expect(result).toEqual({
      kind: "changed",
      formatted: "== Title ==",
    });
  });
});
