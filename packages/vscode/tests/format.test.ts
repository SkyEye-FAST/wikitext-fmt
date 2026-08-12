import { describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  defaultOptions,
  clearSiteConfigurationMemoryCache,
  type FormatDetailedResult,
  type FormatFailure,
  type FormatOptions,
  serializeSiteConfigurationSnapshot,
} from "wikitext-fmt";
import { optionSchema } from "../../../src/options/schema.js";
import {
  buildEditorSettings,
  buildExplicitSiteConfiguration,
  buildFormatOptions,
  formatTextForEditor,
  getEditorDocumentFormattingResult,
  getEditorFormattingResult,
  resolveEditorSettings,
  type ConfigLike,
  type EditorFormatSettings,
  type FormatterApi,
} from "../src/format.js";
import { isSupportedLanguageId } from "../src/language.js";
import {
  configFileOnlyOptionNames,
  vscodeFormatOptionMetadata,
} from "../src/optionMetadata.js";
import {
  createDocumentReport,
  createResolvedConfigurationReport,
} from "../src/report.js";

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

async function writeValidParserConfig(path: string): Promise<void> {
  const contents = await readFile(
    new URL(
      "../../../node_modules/wikiparser-node/config/default.json",
      import.meta.url,
    ),
    "utf8",
  );
  await writeFile(path, contents);
}

function settings(safe: boolean): EditorFormatSettings {
  return {
    safe,
    options: {},
    explicitOptions: {},
    configOptions: {},
  };
}

function detailedResult(
  formatted: string,
  overrides: Partial<FormatDetailedResult> = {},
): FormatDetailedResult {
  return {
    formatted,
    tableDiagnostics: [],
    tableFormatDiagnostics: {
      tablesInspected: 0,
      tablesEligible: 0,
      tablesChanged: 0,
      tablesAlreadyCanonical: 0,
      tablesSkippedAmbiguous: 0,
      formattingPassesUsed: 0,
      convergenceLimitReached: false,
      tableSemanticIds: [],
      changedTableSemanticIds: [],
    },
    footerDiagnostics: {
      behaviorSwitchesMoved: 0,
      behaviorSwitchesFormatted: 0,
      defaultsortMoved: 0,
      categoriesMoved: 0,
      localizedCategoryAliasesCanonicalized: 0,
      localizedDefaultsortAliasesCanonicalized: 0,
      localizedBehaviorSwitchesCanonicalized: 0,
      interlanguageLinksMoved: 0,
      interlanguageLinksFormatted: 0,
    },
    redirectDiagnostics: {
      redirectsFormatted: 0,
      localizedRedirectAliasesCanonicalized: 0,
    },
    fileLinkDiagnostics: {
      fileLinksFormatted: 0,
      localizedFileNamespaceAliasesCanonicalized: 0,
      localizedImageOptionsCanonicalized: 0,
    },
    wikilinkDiagnostics: {
      wikilinksInspected: 0,
      wikilinksEligible: 0,
      wikilinksFormatted: 0,
      underscoresReplaced: 0,
      wikilinksWithFragmentsFormatted: 0,
      wikilinksSkippedUnsafe: 0,
      skipReasons: {},
    },
    externalLinkDiagnostics: {
      externalLinksFormatted: 0,
      externalLinksSkippedUnsafe: 0,
    },
    referenceDiagnostics: {
      referencesFormatted: 0,
      referenceGroupsFormatted: 0,
      referenceLinesSkippedUnsafe: 0,
    },
    listDiagnostics: {
      listLinesInspected: 0,
      listLinesEligible: 0,
      listLinesChanged: 0,
      listLinesAlreadyCanonical: 0,
      listLinesSkipped: 0,
      mixedMarkerLinesChanged: 0,
      commentBearingLinesChanged: 0,
      structuredContentLinesChanged: 0,
      skipReasons: {},
    },
    sectionSpacingDiagnostics: {
      sectionSpacingBeforeHeadingsInserted: 0,
      sectionSpacingAfterHeadingsInserted: 0,
    },
    templateDiagnostics: {
      templatesInspected: 0,
      templatesEligible: 0,
      templatesChanged: 0,
      templatesAlreadyCanonical: 0,
      templatesSkippedAmbiguous: 0,
      uniqueTemplatesFormatted: 0,
      templatesExpandedToMultiline: 0,
      existingMultilineTemplatesNormalized: 0,
      templatesSkipped: 0,
      skipReasons: {},
      formattingPassesUsed: 0,
      convergenceLimitReached: false,
      templateSemanticIds: [],
      changedTemplateSemanticIds: [],
    },
    equivalenceDiagnostics: [],
    ...overrides,
  };
}

function formatterApi(
  normal: FormatDetailedResult,
  safe: FormatDetailedResult,
): FormatterApi {
  return {
    formatWikitextDetailedResult: vi.fn(() => normal),
    formatWikitextSafeDetailed: vi.fn(() => safe),
  };
}

const schemaByName = new Map(optionSchema.map((entry) => [entry.name, entry]));

function alternateValue(
  name: keyof FormatOptions,
  defaultValue: unknown,
): unknown {
  const schema = schemaByName.get(name);
  if (schema?.type === "boolean") return !defaultValue;
  if (schema?.type === "number") return Number(defaultValue) + 1;
  if (schema?.type === "stringArray") return ["test-prefix"];
  if (schema?.type === "enum") {
    return schema.enumValues?.find((value) => value !== defaultValue);
  }
  throw new Error(`No alternate VS Code setting value for ${name}`);
}

describe("VS Code formatter option parity", () => {
  it("classifies every core option as exposed or config-file-only", () => {
    const coreNames = optionSchema.map(({ name }) => name).sort();
    const classifiedNames = [
      ...vscodeFormatOptionMetadata.map(({ name }) => name),
      ...configFileOnlyOptionNames,
    ].sort();

    expect(classifiedNames).toEqual(coreNames);
    expect(new Set(classifiedNames).size).toBe(coreNames.length);
  });

  it("maps all extension defaults from the core defaults", () => {
    const options = buildFormatOptions(config());
    const expected = Object.fromEntries(
      vscodeFormatOptionMetadata.map(({ name }) => [
        name,
        defaultOptions[name],
      ]),
    );

    expect(options).toEqual(expected);
  });

  it("maps explicit values for every exposed core option", () => {
    const explicit = Object.fromEntries(
      vscodeFormatOptionMetadata.map(({ name, defaultValue }) => [
        name,
        alternateValue(name, defaultValue),
      ]),
    );

    expect(buildFormatOptions(config(explicit, true))).toEqual(explicit);
  });

  it("does not let unconfigured editor defaults override config or profile", () => {
    expect(
      buildFormatOptions(config({}, true), {
        profile: "production",
        lineWidth: 88,
      }),
    ).toEqual({
      profile: "production",
      lineWidth: 88,
    });
  });

  it("keeps package setting metadata synchronized with core metadata", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    ) as {
      contributes: {
        configuration: {
          properties: Record<
            string,
            {
              default?: unknown;
              enum?: unknown[];
              items?: { type?: string };
              type?: string | string[];
              deprecationMessage?: string;
              markdownDeprecationMessage?: string;
            }
          >;
        };
        commands: Array<{
          command: string;
          enablement?: string;
        }>;
      };
    };
    const properties = packageJson.contributes.configuration.properties;

    for (const { name, defaultValue } of vscodeFormatOptionMetadata) {
      const property = properties[`wikitextFmt.${name}`];
      const schema = schemaByName.get(name);
      expect(property, name).toBeDefined();
      expect(property?.default, name).toEqual(defaultValue);
      if (schema?.type === "boolean") expect(property?.type, name).toBe("boolean");
      if (schema?.type === "number") expect(property?.type, name).toBe("number");
      if (schema?.type === "enum") {
        expect(property?.type, name).toBe("string");
        expect(property?.enum, name).toEqual(schema.enumValues);
      }
      if (schema?.type === "stringArray") {
        expect(property?.type, name).toBe("array");
        expect(property?.items?.type, name).toBe("string");
      }
    }

    for (const name of configFileOnlyOptionNames) {
      expect(properties[`wikitextFmt.${name}`]).toBeUndefined();
    }
    for (const name of [
      "apiUrl",
      "parserConfig",
      "snapshotPath",
      "cachePath",
      "cacheMaxAgeSeconds",
      "allowStaleCache",
    ]) {
      const property = properties[`wikitextFmt.site.${name}`];
      expect(property, `wikitextFmt.site.${name}`).toBeDefined();
      expect(property.default).toBeNull();
    }
    const removedSetting = `wikitextFmt.${["formatTemplate", "Parameters"].join("")}`;
    expect(properties[removedSetting]).toBeUndefined();

    const commandIds = packageJson.contributes.commands.map(
      ({ command }) => command,
    );
    expect(commandIds).toEqual(
      expect.arrayContaining([
        "wikitext-fmt.formatDocument",
        "wikitext-fmt.checkDocument",
        "wikitext-fmt.previewDocument",
        "wikitext-fmt.showLastReport",
        "wikitext-fmt.showResolvedConfiguration",
        "wikitext-fmt.openConfiguration",
        "wikitext-fmt.refreshSiteConfiguration",
        "wikitext-fmt.generateSiteParserConfig",
        "wikitext-fmt.checkSiteParserConfig",
      ]),
    );
    for (const command of packageJson.contributes.commands) {
      if (command.command === "wikitext-fmt.showLastReport") continue;
      if (
        command.command === "wikitext-fmt.refreshSiteConfiguration" ||
        command.command === "wikitext-fmt.generateSiteParserConfig" ||
        command.command === "wikitext-fmt.checkSiteParserConfig"
      ) {
        expect(command.enablement).toContain("isWorkspaceTrusted");
        continue;
      }
      expect(command.enablement, command.command).toBe(
        "editorLangId == wikitext || editorLangId == mediawiki",
      );
    }
  });
});

describe("VS Code formatter detailed behavior", () => {
  it("uses safe detailed formatting when safe is true", () => {
    const formatter = formatterApi(
      detailedResult("normal"),
      detailedResult("safe"),
    );
    const editorSettings = {
      ...settings(true),
      options: { lineWidth: 80 },
    };
    const result = formatTextForEditor("original", editorSettings, formatter);

    expect(result.formatted).toBe("safe");
    expect(formatter.formatWikitextSafeDetailed).toHaveBeenCalledOnce();
    expect(formatter.formatWikitextSafeDetailed).toHaveBeenCalledWith(
      "original",
      { lineWidth: 80 },
    );
    expect(formatter.formatWikitextDetailedResult).not.toHaveBeenCalled();
  });

  it("uses non-safe detailed formatting when safe is false", () => {
    const formatter = formatterApi(
      detailedResult("normal"),
      detailedResult("safe"),
    );
    const editorSettings = {
      ...settings(false),
      options: { formatTables: false },
    };
    const result = formatTextForEditor("original", editorSettings, formatter);

    expect(result.formatted).toBe("normal");
    expect(formatter.formatWikitextDetailedResult).toHaveBeenCalledOnce();
    expect(formatter.formatWikitextDetailedResult).toHaveBeenCalledWith(
      "original",
      { formatTables: false },
    );
    expect(formatter.formatWikitextSafeDetailed).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "preserves structured failure and suppresses edits when safe=%s",
    (safe) => {
      const failure: FormatFailure = {
        code: "document-equivalence",
        stage: "document",
        message: "equivalence rejected",
      };
      const failed = detailedResult("candidate", {
        failure,
        warning: failure.message,
      });
      const formatter = formatterApi(failed, failed);

      expect(
        getEditorFormattingResult("original", settings(safe), formatter),
      ).toMatchObject({
        kind: "failed",
        formatted: "candidate",
        changed: true,
        failure,
      });
    },
  );

  it("preserves warning results without treating them as unchanged", () => {
    const warned = detailedResult("original", {
      warning: "compatibility warning",
    });
    const result = getEditorFormattingResult(
      "original",
      settings(true),
      formatterApi(warned, warned),
    );

    expect(result).toMatchObject({
      kind: "warning",
      formatted: "original",
      changed: false,
      warning: "compatibility warning",
    });
  });

  it("reports unchanged output as no edit", () => {
    const unchanged = detailedResult("original");
    expect(
      getEditorFormattingResult(
        "original",
        settings(true),
        formatterApi(unchanged, unchanged),
      ),
    ).toMatchObject({
      kind: "unchanged",
      formatted: "original",
      changed: false,
    });
  });

  it("reports changed output for full-document replacement", () => {
    expect(
      getEditorFormattingResult("==Title==", {
        ...settings(true),
        options: {},
      }),
    ).toMatchObject({
      kind: "changed",
      formatted: "== Title ==",
      changed: true,
    });
  });

  it("honors core ignore markers without a VS Code-specific setting", () => {
    const marker = "<!-- wikitext-fmt-ignore -->";
    const source = `${marker}\n[[Keep_Underscore]] [[Format_After]]\n`;

    expect(
      getEditorDocumentFormattingResult(source, {
        kind: "settings",
        settings: settings(true),
      }),
    ).toMatchObject({
      kind: "changed",
      formatted: `${marker}\n[[Keep_Underscore]] [[Format After]]\n`,
      changed: true,
    });
  });

  it("preserves the active config path in the document result", () => {
    const unchanged = detailedResult("original");
    expect(
      getEditorDocumentFormattingResult(
        "original",
        {
          kind: "settings",
          settings: settings(true),
          configPath: "/workspace/.wikitextfmtrc",
        },
        formatterApi(unchanged, unchanged),
      ),
    ).toMatchObject({
      kind: "unchanged",
      configPath: "/workspace/.wikitextfmtrc",
    });
  });
});

describe("VS Code formatter config loading", () => {
  it("reads only explicitly configured VS Code site settings", () => {
    expect(buildExplicitSiteConfiguration(config({}, true))).toBeUndefined();
    expect(
      buildExplicitSiteConfiguration(
        config(
          {
            "site.apiUrl": "https://wiki.example/api.php",
            "site.cacheMaxAgeSeconds": 0,
            "site.allowStaleCache": false,
          },
          true,
        ),
      ),
    ).toEqual({
      apiUrl: "https://wiki.example/api.php",
      cacheMaxAgeSeconds: 0,
      allowStaleCache: false,
    });
  });

  it("uses a project snapshot without network in an untrusted workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "wikitext-formatter-site-"));
    const snapshotPath = join(root, "site.json");
    await writeFile(
      snapshotPath,
      serializeSiteConfigurationSnapshot({
        schemaVersion: 1,
        apiUrl: "https://wiki.example/api.php",
        fetchedAt: "2026-08-02T00:00:00.000Z",
        formatterData: {
          localizationAliases: { categoryNamespaces: ["Kategorie"] },
          interlanguagePrefixes: ["de"],
        },
      }),
    );
    await writeFile(
      join(root, ".wikitextfmtrc"),
      JSON.stringify({ site: { snapshotPath: "site.json" } }),
    );

    const result = await resolveEditorSettings(config({}, true), {
      enabled: true,
      documentPath: join(root, "page.wiki"),
      trusted: false,
    });

    expect(result).toMatchObject({
      kind: "settings",
      settings: {
        options: {
          localizationSource: "custom",
          interlanguagePrefixes: ["de"],
        },
        siteConfiguration: {
          source: "snapshot",
          snapshotPath,
        },
      },
    });
  });

  it("fails closed instead of fetching an API in an untrusted workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "wikitext-formatter-site-"));
    await writeFile(
      join(root, ".wikitextfmtrc"),
      JSON.stringify({ site: { apiUrl: "https://wiki.example/api.php" } }),
    );

    await expect(
      resolveEditorSettings(config({}, true), {
        enabled: true,
        documentPath: join(root, "page.wiki"),
        trusted: false,
      }),
    ).resolves.toMatchObject({
      kind: "warning",
      warning: expect.stringContaining("network access is disabled"),
    });
  });

  it("uses global storage cache, process TTL-zero reuse, and explicit refresh", async () => {
    const root = await mkdtemp(join(tmpdir(), "wikitext-formatter-site-"));
    const storage = join(root, "global-storage");
    const configPath = join(root, ".wikitextfmtrc");
    const configContents = JSON.stringify({
      site: {
        apiUrl: "https://cache-test.example/api.php",
        cacheMaxAgeSeconds: 0,
      },
    });
    await writeFile(configPath, configContents);
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          query: {
            namespaces: [
              { id: 6, canonical: "File" },
              { id: 14, canonical: "Category" },
            ],
            interwikimap: [{ prefix: "de", language: "Deutsch" }],
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    clearSiteConfigurationMemoryCache();
    try {
      const loadOptions = {
        enabled: true,
        documentPath: join(root, "page.wiki"),
        globalStoragePath: storage,
        trusted: true,
      } as const;
      const first = await resolveEditorSettings(config({}, true), loadOptions);
      const second = await resolveEditorSettings(config({}, true), loadOptions);
      expect(first).toMatchObject({
        kind: "settings",
        settings: { siteConfiguration: { source: "network" } },
      });
      expect(second).toMatchObject({
        kind: "settings",
        settings: { siteConfiguration: { source: "fresh-cache" } },
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(await readdir(storage)).toHaveLength(1);

      const refreshed = await resolveEditorSettings(config({}, true), {
        ...loadOptions,
        refreshSiteConfiguration: true,
      });
      expect(refreshed).toMatchObject({
        kind: "settings",
        settings: { siteConfiguration: { source: "network" } },
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(await readFile(configPath, "utf8")).toBe(configContents);
    } finally {
      clearSiteConfigurationMemoryCache();
      vi.unstubAllGlobals();
    }
  });

  it("uses VS Code settings only when no config is found", async () => {
    const root = await mkdtemp(join(tmpdir(), "wikitext-formatter-"));
    const result = await resolveEditorSettings(config({}, true), {
      enabled: true,
      documentPath: join(root, "page.wiki"),
    });

    expect(result).toMatchObject({
      kind: "settings",
      settings: {
        safe: true,
        options: {},
        explicitOptions: {},
        configOptions: {},
      },
    });
  });

  it.each([
    ".wikitextfmtrc",
    ".wikitextfmtrc.json",
    "wikitext-fmt.config.json",
    ".wikitext-fmt.json",
  ])("uses discovered config options from %s", async (configFilename) => {
    const root = await mkdtemp(join(tmpdir(), "wikitext-formatter-"));
    const nested = join(root, "pages", "nested");
    await mkdir(nested, { recursive: true });
    await writeFile(
      join(root, configFilename),
      JSON.stringify({ level: "experimental", formatReferences: true }),
    );

    const result = await resolveEditorSettings(config({}, true), {
      enabled: true,
      documentPath: join(nested, "page.wiki"),
    });

    expect(result).toMatchObject({
      kind: "settings",
      configPath: join(root, configFilename),
      settings: {
        options: {
          level: "experimental",
          formatReferences: true,
        },
      },
    });
  });

  it("passes config-file-only options through the loaded config", async () => {
    const root = await mkdtemp(join(tmpdir(), "wikitext-formatter-"));
    const aliases = { categoryNamespaces: ["分类"] };
    await writeFile(
      join(root, ".wikitextfmtrc"),
      JSON.stringify({
        parserConfig: "mediawiki",
        localizationSource: "custom",
        localizationAliases: aliases,
      }),
    );

    const result = await resolveEditorSettings(config({}, true), {
      enabled: true,
      documentPath: join(root, "page.wiki"),
    });

    expect(result).toMatchObject({
      kind: "settings",
      settings: {
        options: {
          parserConfig: "mediawiki",
          localizationSource: "custom",
          localizationAliases: aliases,
        },
        configOptions: {
          parserConfig: "mediawiki",
          localizationSource: "custom",
          localizationAliases: aliases,
        },
      },
    });
  });

  it("lets explicit VS Code settings override config options", async () => {
    const root = await mkdtemp(join(tmpdir(), "wikitext-formatter-"));
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
        explicitOptions: {
          level: "normal",
          formatTables: false,
        },
        options: {
          level: "normal",
          formatTables: false,
        },
      },
    });
  });

  it("loads explicit config paths relative to the workspace folder", async () => {
    const root = await mkdtemp(join(tmpdir(), "wikitext-formatter-"));
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

  it("resolves a discovered relative parserConfig from the config directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "wikitext-formatter-"));
    const nested = join(root, "pages");
    await mkdir(nested);
    await mkdir(join(root, "parser"));
    await writeValidParserConfig(join(root, "parser", "custom.json"));
    await writeFile(
      join(root, ".wikitextfmtrc"),
      JSON.stringify({ parserConfig: "parser/custom.json" }),
    );

    const result = await resolveEditorSettings(config({}, true), {
      enabled: true,
      documentPath: join(nested, "page.wiki"),
    });

    expect(result).toMatchObject({
      kind: "settings",
      settings: {
        configOptions: {
          parserConfig: resolve(root, "parser/custom.json"),
        },
        options: {
          parserConfig: resolve(root, "parser/custom.json"),
        },
      },
    });
  });

  it("resolves an explicit relative parserConfig from the config directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "wikitext-formatter-"));
    const configDirectory = join(root, "config");
    await mkdir(configDirectory);
    await writeValidParserConfig(join(configDirectory, "parser.json"));
    await writeFile(
      join(configDirectory, "formatter.json"),
      JSON.stringify({ parserConfig: "./parser.json" }),
    );

    const result = await resolveEditorSettings(config({}, true), {
      enabled: true,
      configPath: "config/formatter.json",
      documentPath: join(root, "pages", "page.wiki"),
      workspaceFolderPath: root,
    });

    expect(result).toMatchObject({
      kind: "settings",
      settings: {
        options: {
          parserConfig: join(configDirectory, "parser.json"),
        },
      },
    });
  });

  it("uses the selected workspace root before resolving parserConfig", async () => {
    const firstRoot = await mkdtemp(join(tmpdir(), "wikitext-root-a-"));
    const secondRoot = await mkdtemp(join(tmpdir(), "wikitext-root-b-"));
    const configDirectory = join(firstRoot, "config");
    await mkdir(configDirectory);
    await writeValidParserConfig(join(firstRoot, "parser.json"));
    await writeFile(
      join(configDirectory, "formatter.json"),
      JSON.stringify({ parserConfig: "../parser.json" }),
    );

    const result = await resolveEditorSettings(config({}, true), {
      enabled: true,
      configPath: "config/formatter.json",
      documentPath: join(secondRoot, "page.wiki"),
      workspaceFolderPath: firstRoot,
    });

    expect(result).toMatchObject({
      kind: "settings",
      configPath: join(configDirectory, "formatter.json"),
      settings: {
        options: {
          parserConfig: join(firstRoot, "parser.json"),
        },
      },
    });
  });

  it.each(["mediawiki"])(
    "does not rewrite named parser config %s",
    async (parserConfig) => {
      const root = await mkdtemp(join(tmpdir(), "wikitext-formatter-"));
      await writeFile(
        join(root, ".wikitextfmtrc"),
        JSON.stringify({ parserConfig }),
      );

      const result = await resolveEditorSettings(config({}, true), {
        enabled: true,
        documentPath: join(root, "page.wiki"),
      });

      expect(result).toMatchObject({
        kind: "settings",
        settings: {
          options: { parserConfig },
        },
      });
      expect(isAbsolute(parserConfig)).toBe(false);
    },
  );

  it("fails closed for an unavailable named parser config", async () => {
    const root = await mkdtemp(join(tmpdir(), "wikitext-formatter-"));
    const configPath = join(root, ".wikitextfmtrc");
    await writeFile(
      configPath,
      JSON.stringify({ parserConfig: "custom-parser" }),
    );

    await expect(
      resolveEditorSettings(config({}, true), {
        enabled: true,
        documentPath: join(root, "page.wiki"),
      }),
    ).resolves.toMatchObject({
      kind: "warning",
      configPath,
      warning: expect.stringContaining("custom-parser"),
    });
  });

  it("does not rewrite an absolute parser config path", async () => {
    const root = await mkdtemp(join(tmpdir(), "wikitext-formatter-"));
    const parserConfig = join(root, "parser.json");
    await writeValidParserConfig(parserConfig);
    await writeFile(
      join(root, ".wikitextfmtrc"),
      JSON.stringify({ parserConfig }),
    );

    const result = await resolveEditorSettings(config({}, true), {
      enabled: true,
      documentPath: join(root, "page.wiki"),
    });

    expect(result).toMatchObject({
      kind: "settings",
      settings: {
        options: { parserConfig },
      },
    });
  });

  it("ignores config files when config loading is disabled", async () => {
    const root = await mkdtemp(join(tmpdir(), "wikitext-formatter-"));
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

  it("returns a warning with the config path for invalid config", async () => {
    const root = await mkdtemp(join(tmpdir(), "wikitext-formatter-"));
    const configPath = join(root, ".wikitextfmtrc");
    await writeFile(configPath, JSON.stringify({ unknownOption: true }));

    const result = await resolveEditorSettings(config({}, true), {
      enabled: true,
      documentPath: join(root, "page.wiki"),
    });

    expect(result).toMatchObject({
      kind: "warning",
      configPath,
      warning: expect.stringContaining("Unknown configuration option"),
    });
  });

  it("does not discover config for untitled or virtual documents", async () => {
    const root = await mkdtemp(join(tmpdir(), "wikitext-formatter-"));
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

describe("VS Code reports and language guards", () => {
  it("summarizes structured diagnostics and skip reasons", () => {
    const details = detailedResult("formatted", {
      tableFormatDiagnostics: {
        ...detailedResult("").tableFormatDiagnostics,
        tablesChanged: 2,
        tablesSkippedAmbiguous: 1,
      },
      footerDiagnostics: {
        ...detailedResult("").footerDiagnostics,
        interlanguageLinksInspected: 2,
        interlanguageLinksEligible: 1,
        interlanguageLinksSkipped: 1,
        interlanguageLinkSkipReasons: { "leading-colon": 1 },
      },
      wikilinkDiagnostics: {
        ...detailedResult("").wikilinkDiagnostics,
        wikilinksSkippedUnsafe: 3,
        skipReasons: { "unsafe-parent": 3 },
      },
      listDiagnostics: {
        ...detailedResult("").listDiagnostics,
        listLinesInspected: 6,
        listLinesEligible: 4,
        listLinesChanged: 3,
        listLinesAlreadyCanonical: 1,
        listLinesSkipped: 2,
        mixedMarkerLinesChanged: 1,
        commentBearingLinesChanged: 1,
        structuredContentLinesChanged: 1,
        skipReasons: {
          "unicode-separator": 1,
          "protected-block": 1,
        },
      },
    });
    const formatter = formatterApi(details, details);
    const result = getEditorDocumentFormattingResult(
      "original",
      {
        kind: "settings",
        settings: {
          ...settings(true),
          options: { profile: "production" },
          explicitOptions: { profile: "production" },
        },
        configPath: "/workspace/.wikitextfmtrc",
      },
      formatter,
    );

    expect(
      createDocumentReport({
        uri: "file:///workspace/page.wiki",
        languageId: "wikitext",
        result,
      }),
    ).toMatchObject({
      activeConfigPath: "/workspace/.wikitextfmtrc",
      resolvedProfile: "production",
      resolvedLevel: "normal",
      explicitVscodeOptions: { profile: "production" },
      status: "changed",
      diagnostics: {
        ruleChanges: {
          tablesChanged: 2,
          listLinesChanged: 3,
          mixedMarkerLinesChanged: 1,
          commentBearingLinesChanged: 1,
          structuredContentLinesChanged: 1,
        },
        skippedOrAmbiguous: {
          tablesSkippedAmbiguous: 1,
          wikilinksSkippedUnsafe: 3,
          interlanguageLinksSkipped: 1,
          listLinesSkipped: 2,
        },
        skipReasons: {
          "wikilinks: unsafe-parent": 3,
          "interlanguage links: leading-colon": 1,
          "lists: unicode-separator": 1,
          "lists: protected-block": 1,
        },
        listDiagnostics: {
          listLinesInspected: 6,
          listLinesEligible: 4,
          listLinesChanged: 3,
          listLinesAlreadyCanonical: 1,
          listLinesSkipped: 2,
          mixedMarkerLinesChanged: 1,
          commentBearingLinesChanged: 1,
          structuredContentLinesChanged: 1,
          skipReasons: {
            "unicode-separator": 1,
            "protected-block": 1,
          },
        },
      },
    });
  });

  it("keeps list report field names synchronized with actual core diagnostics", () => {
    const source = [
      ":*item",
      ":c<!-- comment -->",
      ":{{T}}",
      "* already canonical",
      ":\u00A0unchanged",
      "<nowiki>",
      ":c",
      "</nowiki>",
      "",
    ].join("\n");
    const result = getEditorDocumentFormattingResult(source, {
      kind: "settings",
      settings: settings(true),
    });
    const report = createDocumentReport({
      uri: "file:///workspace/lists.wiki",
      languageId: "wikitext",
      result,
    }) as {
      diagnostics: Record<string, unknown>;
    };

    expect(report.diagnostics).toMatchObject({
      ruleChanges: {
        listLinesChanged: 3,
        mixedMarkerLinesChanged: 1,
        commentBearingLinesChanged: 1,
        structuredContentLinesChanged: 1,
      },
      skippedOrAmbiguous: {
        listLinesSkipped: 2,
      },
      skipReasons: {
        "lists: unicode-separator": 1,
        "lists: protected-block": 1,
      },
      listDiagnostics: {
        listLinesInspected: 6,
        listLinesEligible: 4,
        listLinesChanged: 3,
        listLinesAlreadyCanonical: 1,
        listLinesSkipped: 2,
        mixedMarkerLinesChanged: 1,
        commentBearingLinesChanged: 1,
        structuredContentLinesChanged: 1,
        skipReasons: {
          "unicode-separator": 1,
          "protected-block": 1,
        },
      },
    });
    expect(JSON.stringify(report)).not.toContain("listLinesSkippedAmbiguous");
  });

  it("reports zero list statistics when a document has no list candidates", () => {
    const result = getEditorDocumentFormattingResult("==Title==", {
      kind: "settings",
      settings: settings(true),
    });
    const report = createDocumentReport({
      uri: "file:///workspace/no-lists.wiki",
      languageId: "wikitext",
      result,
    });

    expect(report).toMatchObject({
      diagnostics: {
        ruleChanges: {
          listLinesChanged: 0,
          mixedMarkerLinesChanged: 0,
          commentBearingLinesChanged: 0,
          structuredContentLinesChanged: 0,
        },
        skippedOrAmbiguous: {
          listLinesSkipped: 0,
        },
        listDiagnostics: {
          listLinesInspected: 0,
          listLinesEligible: 0,
          listLinesChanged: 0,
          listLinesAlreadyCanonical: 0,
          listLinesSkipped: 0,
          mixedMarkerLinesChanged: 0,
          commentBearingLinesChanged: 0,
          structuredContentLinesChanged: 0,
          skipReasons: {},
        },
      },
    });
  });

  it("reports a changed CRLF document without a line-ending failure", () => {
    const result = getEditorDocumentFormattingResult(
      "==Title==\r\n:item\r\n",
      {
        kind: "settings",
        settings: settings(true),
      },
    );

    expect(
      createDocumentReport({
        uri: "file:///workspace/crlf.wiki",
        languageId: "wikitext",
        result,
      }),
    ).toMatchObject({
      status: "changed",
      changed: true,
      failure: null,
      warning: null,
    });
    expect(result.formatted).toBe("== Title ==\r\n: item\r\n");
  });

  it.each([
    ["mixed LF and CRLF", "==Title==\r\n:item\n"],
    ["bare CR", "==Title==\r:item\r"],
  ])("reports unsupported line endings for %s", (_name, source) => {
    const result = getEditorDocumentFormattingResult(source, {
      kind: "settings",
      settings: settings(true),
    });

    expect(
      createDocumentReport({
        uri: "file:///workspace/unsupported.wiki",
        languageId: "wikitext",
        result,
      }),
    ).toMatchObject({
      status: "failed",
      changed: false,
      failure: {
        code: "unsupported-line-endings",
        stage: "input-normalization",
      },
      warning: expect.stringContaining("unsupported"),
    });
    expect(result.formatted).toBe(source);
  });

  it("shows config, explicit overrides, final core options, and editor safe value", () => {
    const resolution = {
      kind: "settings" as const,
      configPath: "/workspace/.wikitextfmtrc",
      settings: buildEditorSettings(
        config({ lineWidth: 88, safe: false }, true),
        { profile: "production", lineWidth: 100 },
        { profile: "production", lineWidth: 100 },
      ),
    };

    expect(
      createResolvedConfigurationReport(
        "file:///workspace/page.wiki",
        resolution,
      ),
    ).toMatchObject({
      activeConfigPath: "/workspace/.wikitextfmtrc",
      resolvedProfile: "production",
      resolvedLevel: "normal",
      vscodeOverrides: { lineWidth: 88 },
      configFileOptions: { profile: "production", lineWidth: 100 },
      coreOptions: { profile: "production", lineWidth: 88 },
      editorOnly: { safe: false },
    });
  });

  it("accepts only wikitext and mediawiki language ids", () => {
    expect(isSupportedLanguageId("wikitext")).toBe(true);
    expect(isSupportedLanguageId("mediawiki")).toBe(true);
    expect(isSupportedLanguageId("plaintext")).toBe(false);
  });
});
