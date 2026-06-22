import { describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildEditorSettings,
  buildFormatOptions,
  formatTextForEditor,
  getEditorFormattingResult,
  resolveEditorSettings,
  type ConfigLike,
  type FormatterApi,
} from "../src/format.js";

function config(
  values: Record<string, unknown> = {},
  inspectable = false,
): ConfigLike {
  const result: ConfigLike = {
    get<T>(key: string, defaultValue: T): T {
      return (key in values ? values[key] : defaultValue) as T;
    },
  };
  if (inspectable) {
    result.inspect = <T>(key: string) => {
      return key in values
        ? ({ workspaceValue: values[key] } as { workspaceValue: T })
        : {};
    };
  }
  return result;
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

describe("VS Code formatter wrapper config loading", () => {
  it("uses VS Code settings only when no config is found", async () => {
    const root = await mkdtemp(join(tmpdir(), "wikitext-fmt-vscode-"));
    const result = await resolveEditorSettings(config({}, true), {
      enabled: true,
      documentPath: join(root, "page.wiki"),
    });

    expect(result).toMatchObject({
      kind: "settings",
      settings: {
        safe: true,
        options: {},
      },
    });
  });

  it("uses discovered config options", async () => {
    const root = await mkdtemp(join(tmpdir(), "wikitext-fmt-vscode-"));
    const nested = join(root, "pages", "nested");
    await mkdir(nested, { recursive: true });
    await writeFile(
      join(root, ".wikitextfmtrc"),
      JSON.stringify({ level: "experimental", formatReferences: true }),
    );

    const result = await resolveEditorSettings(config({}, true), {
      enabled: true,
      documentPath: join(nested, "page.wiki"),
    });

    expect(result).toMatchObject({
      kind: "settings",
      settings: {
        options: {
          level: "experimental",
          formatReferences: true,
        },
      },
    });
  });

  it("lets explicit VS Code settings override config options", async () => {
    const root = await mkdtemp(join(tmpdir(), "wikitext-fmt-vscode-"));
    await writeFile(
      join(root, ".wikitextfmtrc"),
      JSON.stringify({ level: "experimental", formatTables: true }),
    );

    const result = await resolveEditorSettings(
      config({ level: "normal", formatTables: false }, true),
      {
        enabled: true,
        documentPath: join(root, "page.wiki"),
      },
    );

    expect(result).toMatchObject({
      kind: "settings",
      settings: {
        options: {
          level: "normal",
          formatTables: false,
        },
      },
    });
  });

  it("loads explicit config paths relative to the workspace folder", async () => {
    const root = await mkdtemp(join(tmpdir(), "wikitext-fmt-vscode-"));
    await writeFile(
      join(root, "formatter.json"),
      JSON.stringify({ htmlVoidTagStyle: "preserve" }),
    );

    const result = await resolveEditorSettings(config({}, true), {
      enabled: true,
      configPath: "formatter.json",
      documentPath: join(root, "subdir", "page.wiki"),
      workspaceFolderPath: root,
    });

    expect(result).toMatchObject({
      kind: "settings",
      settings: {
        options: {
          htmlVoidTagStyle: "preserve",
        },
      },
    });
  });

  it("ignores config files when config loading is disabled", async () => {
    const root = await mkdtemp(join(tmpdir(), "wikitext-fmt-vscode-"));
    await writeFile(
      join(root, ".wikitextfmtrc"),
      JSON.stringify({ level: "experimental" }),
    );

    const result = await resolveEditorSettings(config({}, true), {
      enabled: false,
      documentPath: join(root, "page.wiki"),
    });

    expect(result).toMatchObject({
      kind: "settings",
      settings: {
        options: {},
      },
    });
  });

  it("returns a warning for invalid config", async () => {
    const root = await mkdtemp(join(tmpdir(), "wikitext-fmt-vscode-"));
    await writeFile(
      join(root, ".wikitextfmtrc"),
      JSON.stringify({ unknownOption: true }),
    );

    const result = await resolveEditorSettings(config({}, true), {
      enabled: true,
      documentPath: join(root, "page.wiki"),
    });

    expect(result.kind).toBe("warning");
    expect(result).toMatchObject({
      warning: expect.stringContaining("Unknown configuration option"),
    });
  });

  it("does not discover config for untitled documents", async () => {
    const root = await mkdtemp(join(tmpdir(), "wikitext-fmt-vscode-"));
    await writeFile(
      join(root, ".wikitextfmtrc"),
      JSON.stringify({ level: "experimental" }),
    );

    const result = await resolveEditorSettings(config({}, true), {
      enabled: true,
      workspaceFolderPath: root,
    });

    expect(result).toMatchObject({
      kind: "settings",
      settings: {
        options: {},
      },
    });
  });
});
