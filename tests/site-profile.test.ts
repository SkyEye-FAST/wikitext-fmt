import { describe, expect, it } from "vitest";
import schema from "../schemas/site-profile.schema.json" with { type: "json" };
import { optionSchema } from "../src/options/schema.js";
import {
  loadSiteProfile,
  normalizeSiteProfile,
  normalizeTemplateDataResponse,
  serializeSiteProfile,
  siteProfileFormatOptions,
  siteProfileTemplateDataUrl,
} from "../src/siteProfile.js";

const base = { schemaVersion: 1, name: "Example Wiki" };
const apiUrl = "https://wiki.example.org/w/api.php";

function siteinfo(extensions: unknown[] = [{ name: "TemplateData" }]) {
  return {
    query: {
      general: {
        sitename: "Example Wiki",
        server: "//wiki.example.org",
        articlepath: "/wiki/$1",
      },
      namespaces: [{ id: 14, name: "分類", canonical: "Category" }],
      namespacealiases: [{ id: 14, name: "分类" }],
      magicwords: [{ name: "redirect", aliases: ["#REDIRECT", "#重定向"] }],
      doubleunderscores: [],
      interwikimap: [
        {
          prefix: "EN",
          url: "https://en.example.org/wiki/$1",
          language: "English",
          local: true,
          protorel: false,
        },
        {
          prefix: "commons",
          url: "//commons.example.org/wiki/$1",
          local: false,
        },
        { prefix: "ja", extralanglink: true },
      ],
      extensions,
    },
  };
}

describe("site profiles", () => {
  it("normalizes a complete profile and copies TemplateData and options", () => {
    const input = {
      ...base,
      apiUrl,
      articlePath: "https://wiki.example.org/wiki/$1",
      extensions: { templateData: false },
      interwiki: [{ prefix: " EN ", language: "English", local: false }],
      templates: {
        Infobox: {
          description: { en: "An infobox", zh: "信息框" },
          params: {
            title: {
              label: { en: "Title" },
              description: "Heading",
              type: "string",
              required: true,
              suggested: false,
              deprecated: "Use name instead",
              aliases: ["name"],
              default: { en: "Untitled" },
              example: "Example",
              autovalue: "{{PAGENAME}}",
              suggestedvalues: ["A", "B"],
              futureParameterField: { nested: [1, null, true] },
            },
          },
          paramOrder: ["title"],
          format: "block",
          sets: [{ params: ["title"] }],
          maps: { custom: { title: "name" } },
          futureField: [false],
        },
      },
      formatter: { lineWidth: 100, interlanguagePrefixes: ["en"] },
    };
    const profile = normalizeSiteProfile(input);
    expect(profile).toEqual({
      ...input,
      interwiki: [{ prefix: "en", language: "English", local: false }],
    });
    input.templates.Infobox.params.title.aliases.push("new");
    input.formatter.interlanguagePrefixes.push("ja");
    expect(profile.templates?.Infobox?.params?.title?.aliases).toEqual([
      "name",
    ]);
    expect(profile.formatter?.interlanguagePrefixes).toEqual(["en"]);
  });

  it("defaults TemplateData support to true and ignores $schema", () => {
    expect(normalizeSiteProfile({ ...base, $schema: "ignored" })).toEqual({
      ...base,
      extensions: { templateData: true },
    });
    expect(
      normalizeSiteProfile({ ...base, extensions: {} }).extensions.templateData,
    ).toBe(true);
  });

  it("rejects invalid root fields and URLs with their paths", () => {
    const cases: [unknown, string][] = [
      [null, "profile"],
      [{ ...base, schemaVersion: 2 }, "schemaVersion"],
      [{ ...base, name: "  " }, "name"],
      [{ ...base, apiUrl: "ftp://example.org/api.php" }, "apiUrl"],
      [
        { ...base, apiUrl: "https://user:secret@example.org/api.php" },
        "apiUrl",
      ],
      [{ ...base, articlePath: "/wiki/$1" }, "articlePath"],
      [
        { ...base, articlePath: "https://example.org/wiki/Page" },
        "articlePath",
      ],
      [
        { ...base, extensions: { templateData: "false" } },
        "extensions.templateData",
      ],
      [{ ...base, interwiki: [{ prefix: " " }] }, "interwiki[0].prefix"],
      [
        { ...base, interwiki: [{ prefix: "en", local: "yes" }] },
        "interwiki[0].local",
      ],
    ];
    for (const [value, path] of cases)
      expect(() => normalizeSiteProfile(value)).toThrow(path);
  });

  it("rejects unknown keys in modeled profile objects", () => {
    const cases: [unknown, string][] = [
      [{ ...base, extra: true }, "extra"],
      [{ ...base, extensions: { other: true } }, "extensions.other"],
      [
        { ...base, interwiki: [{ prefix: "en", other: true }] },
        "interwiki[0].other",
      ],
      [{ ...base, formatter: { other: true } }, "formatter.other"],
      [
        { ...base, formatter: { localizationAliases: { other: [] } } },
        "formatter.localizationAliases.other",
      ],
    ];
    for (const [value, path] of cases)
      expect(() => normalizeSiteProfile(value)).toThrow(path);
  });

  it("validates modeled TemplateData fields and requires opaque fields to be JSON", () => {
    const cases: [unknown, string][] = [
      [{ description: { en: 1 } }, "description.en"],
      [{ format: false }, "format"],
      [{ paramOrder: [1] }, "paramOrder[0]"],
      [{ params: [] }, "params"],
      [{ params: { title: { label: 1 } } }, "params.title.label"],
      [{ params: { title: { type: false } } }, "params.title.type"],
      [{ params: { title: { required: "true" } } }, "params.title.required"],
      [{ params: { title: { suggested: 1 } } }, "params.title.suggested"],
      [{ params: { title: { deprecated: [] } } }, "params.title.deprecated"],
      [{ params: { title: { aliases: [1] } } }, "params.title.aliases[0]"],
      [
        { params: { title: { suggestedvalues: false } } },
        "params.title.suggestedvalues",
      ],
      [{ maps: { invalid: Number.NaN } }, "maps.invalid"],
    ];
    for (const [value, path] of cases) {
      expect(() =>
        normalizeSiteProfile({ ...base, templates: { Infobox: value } }),
      ).toThrow(`templates.Infobox.${path}`);
    }
  });

  it("reuses formatter validation and excludes parser and site configuration", () => {
    for (const [formatter, path] of [
      [{ lineWidth: 0 }, "lineWidth"],
      [{ formatTemplates: "yes" }, "formatTemplates"],
      [{ level: "unknown" }, "level"],
      [{ interlanguagePrefixes: [1] }, "interlanguagePrefixes"],
      [{ parserConfig: "mediawiki" }, "parserConfig"],
      [{ site: {} }, "site"],
    ] as const) {
      expect(() => normalizeSiteProfile({ ...base, formatter })).toThrow(
        `formatter.${path}`,
      );
    }
  });

  it("serializes deterministically with two spaces and a trailing newline", () => {
    const first = normalizeSiteProfile({
      ...base,
      templates: {
        B: {},
        A: { params: { z: {}, a: {} }, paramOrder: ["z", "a"] },
      },
    });
    const second = normalizeSiteProfile({
      name: base.name,
      schemaVersion: 1,
      templates: {
        A: { paramOrder: ["z", "a"], params: { a: {}, z: {} } },
        B: {},
      },
    });
    const serialized = serializeSiteProfile(first);
    expect(serialized).toBe(serializeSiteProfile(second));
    expect(serialized).toContain(
      '\n  "extensions": {\n    "templateData": true\n  }',
    );
    expect(serialized.endsWith("\n")).toBe(true);
    expect(normalizeSiteProfile(JSON.parse(serialized))).toEqual(first);
  });

  it("derives language prefixes only when the formatter does not specify them", () => {
    const profile = normalizeSiteProfile({
      ...base,
      formatter: { lineWidth: 100 },
      interwiki: [
        { prefix: "EN", language: "English" },
        { prefix: "en", language: "" },
        { prefix: "commons" },
        { prefix: "ja", language: "日本語" },
      ],
    });
    expect(siteProfileFormatOptions(profile)).toEqual({
      lineWidth: 100,
      interlanguagePrefixes: ["en", "ja"],
    });
    profile.formatter = { interlanguagePrefixes: [] };
    expect(siteProfileFormatOptions(profile)).toEqual({
      interlanguagePrefixes: [],
    });
    expect(siteProfileFormatOptions(normalizeSiteProfile(base))).toEqual({
      interlanguagePrefixes: [],
    });
  });

  it("builds an anonymous CORS TemplateData request and preserves namespaces", () => {
    const url = siteProfileTemplateDataUrl(
      apiUrl,
      ["Infobox", "模板:信息框", "Template:Other"],
      "zh",
    );
    expect(url.origin + url.pathname).toBe(apiUrl);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      action: "templatedata",
      titles: "Template:Infobox|模板:信息框|Template:Other",
      redirects: "1",
      includeMissingTitles: "1",
      format: "json",
      formatversion: "2",
      origin: "*",
      lang: "zh",
    });
    expect(
      siteProfileTemplateDataUrl(apiUrl, []).searchParams.has("lang"),
    ).toBe(false);
    expect(() => siteProfileTemplateDataUrl("javascript:alert(1)", [])).toThrow(
      "apiUrl",
    );
  });

  it("converts TemplateData API pages, strips localized namespaces and skips missing pages", () => {
    expect(
      normalizeTemplateDataResponse({
        pages: {
          "1": {
            pageid: 1,
            ns: 10,
            title: "模板:信息框",
            description: { zh: "信息框" },
            params: { name: { deprecated: false } },
            paramOrder: ["name"],
            format: "inline",
            sets: [],
            maps: {},
            futureField: true,
          },
          "2": { title: "Template:Group:Item", params: {}, missing: false },
          "-1": { title: "Template:Missing", missing: true },
        },
      }),
    ).toEqual({
      信息框: {
        description: { zh: "信息框" },
        params: { name: { deprecated: false } },
        paramOrder: ["name"],
        format: "inline",
        sets: [],
        maps: {},
        futureField: true,
      },
      "Group:Item": { params: {} },
    });
  });

  it("rejects malformed TemplateData responses and API errors", () => {
    for (const payload of [
      null,
      { error: { code: "bad" } },
      {},
      { pages: [] },
      { pages: { "1": { title: 1 } } },
    ]) {
      expect(() => normalizeTemplateDataResponse(payload)).toThrow();
    }
  });

  it("loads one siteinfo request and reuses localization normalization", async () => {
    const requests: URL[] = [];
    const fetchImplementation: typeof fetch = async (input) => {
      requests.push(new URL(String(input)));
      return Response.json(siteinfo());
    };
    const profile = await loadSiteProfile(apiUrl, fetchImplementation);
    expect(requests).toHaveLength(1);
    expect(Object.fromEntries(requests[0]!.searchParams)).toEqual({
      action: "query",
      meta: "siteinfo",
      siprop:
        "general|namespaces|namespacealiases|magicwords|doubleunderscores|interwikimap|extensions",
      format: "json",
      formatversion: "2",
      origin: "*",
    });
    expect(profile.name).toBe("Example Wiki");
    expect(profile.apiUrl).toBe(apiUrl);
    expect(profile.articlePath).toBe("https://wiki.example.org/wiki/$1");
    expect(profile.extensions.templateData).toBe(true);
    expect(profile.interwiki).toEqual([
      {
        prefix: "en",
        url: "https://en.example.org/wiki/$1",
        language: "English",
        local: true,
      },
      { prefix: "commons", url: "//commons.example.org/wiki/$1", local: false },
      { prefix: "ja" },
    ]);
    expect(profile.formatter?.localizationAliases?.categoryNamespaces).toEqual([
      "分類",
      "Category",
      "分类",
    ]);
    expect(profile.formatter?.localizationAliases?.redirectMagicWords).toEqual([
      "#REDIRECT",
      "#重定向",
    ]);
    expect(profile.formatter?.interlanguagePrefixes).toEqual(["EN", "ja"]);
  });

  it("records absent TemplateData support and resolves article URLs using the API protocol", async () => {
    const profile = await loadSiteProfile(
      apiUrl.replace("https:", "http:"),
      async () => Response.json(siteinfo([])),
    );
    expect(profile.extensions.templateData).toBe(false);
    expect(profile.articlePath).toBe("http://wiki.example.org/wiki/$1");
  });

  it("reports failed siteinfo requests and malformed responses", async () => {
    await expect(
      loadSiteProfile(apiUrl, async () => new Response(null, { status: 503 })),
    ).rejects.toThrow("HTTP 503");
    await expect(
      loadSiteProfile(apiUrl, async () =>
        Response.json({ error: { code: "bad" } }),
      ),
    ).rejects.toThrow("API error");
    await expect(
      loadSiteProfile(apiUrl, async () => Response.json({ query: {} })),
    ).rejects.toThrow();
  });

  it("keeps schema formatter property names and enums synchronized with option metadata", () => {
    const properties = schema.$defs.formatter.properties;
    expect(Object.keys(properties).sort()).toEqual(
      optionSchema
        .filter((option) => option.name !== "parserConfig")
        .map((option) => option.name)
        .sort(),
    );
    for (const option of optionSchema) {
      if (option.type === "enum")
        expect(Reflect.get(properties, option.name)).toEqual({
          enum: option.enumValues,
        });
    }
  });
});
