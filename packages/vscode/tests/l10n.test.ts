import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

type NlsCatalog = Record<string, string>;

async function loadCatalog(filename: string): Promise<NlsCatalog> {
  return JSON.parse(
    await readFile(new URL(`../${filename}`, import.meta.url), "utf8"),
  ) as NlsCatalog;
}

function extractKeys(catalog: NlsCatalog): Set<string> {
  return new Set(Object.keys(catalog));
}

function extractPlaceholders(value: string): string[] {
  const matches = value.match(/\{(\w+)\}/gu);
  return matches ? [...new Set(matches)].sort() : [];
}

async function loadAllManifestCatalogs(): Promise<
  { filename: string; catalog: NlsCatalog }[]
> {
  const filenames = [
    "package.nls.json",
    "package.nls.zh-cn.json",
    "package.nls.zh-tw.json",
  ];
  return Promise.all(
    filenames.map(async (filename) => ({
      filename,
      catalog: await loadCatalog(filename),
    })),
  );
}

async function loadAllL10nCatalogs(): Promise<
  { filename: string; catalog: NlsCatalog }[]
> {
  const filenames = [
    "l10n/bundle.l10n.json",
    "l10n/bundle.l10n.zh-cn.json",
    "l10n/bundle.l10n.zh-tw.json",
  ];
  return Promise.all(
    filenames.map(async (filename) => ({
      filename,
      catalog: await loadCatalog(filename),
    })),
  );
}

describe("package.nls localization", () => {
  it("has identical key sets across all three manifest catalogs", async () => {
    const catalogs = await loadAllManifestCatalogs();
    const [en, zhCn, zhTw] = catalogs.map((c) => ({
      filename: c.filename,
      keys: extractKeys(c.catalog),
    }));

    // All catalogs must have the same keys as English.
    for (const { filename, keys } of [zhCn, zhTw]) {
      const missingInTarget = [...en.keys].filter((k) => !keys.has(k));
      const extraInTarget = [...keys].filter((k) => !en.keys.has(k));
      expect(
        missingInTarget,
        `${filename} missing keys: ${missingInTarget.join(", ")}`,
      ).toEqual([]);
      expect(
        extraInTarget,
        `${filename} extra keys: ${extraInTarget.join(", ")}`,
      ).toEqual([]);
    }
  });

  it("has consistent interpolation placeholders across all three manifest catalogs", async () => {
    const catalogs = await loadAllManifestCatalogs();
    const [en, zhCn, zhTw] = catalogs;
    const enEntries = Object.entries(en.catalog);

    for (const [key, enValue] of enEntries) {
      const enPlaceholders = extractPlaceholders(enValue);
      const zhCnPlaceholders = extractPlaceholders(zhCn.catalog[key] ?? "");
      const zhTwPlaceholders = extractPlaceholders(zhTw.catalog[key] ?? "");
      expect(
        zhCnPlaceholders,
        `zh-cn "${key}" placeholders mismatch`,
      ).toEqual(enPlaceholders);
      expect(
        zhTwPlaceholders,
        `zh-tw "${key}" placeholders mismatch`,
      ).toEqual(enPlaceholders);
    }
  });

  it("resolves English manifest text correctly for key display strings", async () => {
    const en = await loadCatalog("package.nls.json");

    expect(en.displayName).toBe("Wikitext Formatter");
    expect(en["command.formatDocument.title"]).toContain("Format Document");
    expect(en["command.checkDocument.title"]).toContain("Check Document");
    expect(en["configuration.title"]).toBe("Wikitext Formatter");
    expect(
      en["configuration.formatTemplateParameters.deprecationMessage"],
    ).toContain("formatTemplates");
  });

  it("resolves Simplified Chinese manifest translations", async () => {
    const zhCn = await loadCatalog("package.nls.zh-cn.json");

    // Brand stays English.
    expect(zhCn.displayName).toBe("Wikitext Formatter");
    expect(zhCn["command.formatDocument.title"]).toContain("格式化文档");
    expect(zhCn["command.showResolvedConfiguration.title"]).toContain("解析后的配置");
    expect(zhCn["configuration.title"]).toBe("Wikitext Formatter");
    expect(zhCn["configuration.lineWidth.description"]).toContain("行宽");
  });

  it("resolves Traditional Chinese manifest translations", async () => {
    const zhTw = await loadCatalog("package.nls.zh-tw.json");

    // Brand stays English.
    expect(zhTw.displayName).toBe("Wikitext Formatter");
    expect(zhTw["command.formatDocument.title"]).toContain("格式化檔案");
    expect(zhTw["command.showResolvedConfiguration.title"]).toContain("解析後的設定");
    expect(zhTw["configuration.title"]).toBe("Wikitext Formatter");
    expect(zhTw["configuration.lineWidth.description"]).toContain("行寬");
  });
});

describe("l10n runtime bundles", () => {
  it("has identical key sets across all three runtime bundles", async () => {
    const catalogs = await loadAllL10nCatalogs();
    const [en, zhCn, zhTw] = catalogs.map((c) => ({
      filename: c.filename,
      keys: extractKeys(c.catalog),
    }));

    for (const { filename, keys } of [zhCn, zhTw]) {
      const missingInTarget = [...en.keys].filter((k) => !keys.has(k));
      const extraInTarget = [...keys].filter((k) => !en.keys.has(k));
      expect(
        missingInTarget,
        `${filename} missing keys: ${missingInTarget.join(", ")}`,
      ).toEqual([]);
      expect(
        extraInTarget,
        `${filename} extra keys: ${extraInTarget.join(", ")}`,
      ).toEqual([]);
    }
  });

  it("has consistent interpolation placeholders across all three runtime bundles", async () => {
    const catalogs = await loadAllL10nCatalogs();
    const [en] = catalogs;
    const enEntries = Object.entries(en.catalog);

    for (const { filename, catalog } of catalogs.slice(1)) {
      for (const [key, enValue] of enEntries) {
        const enPlaceholders = extractPlaceholders(enValue);
        const targetPlaceholders = extractPlaceholders(catalog[key] ?? "");
        expect(
          targetPlaceholders,
          `${filename} "${key}" placeholders mismatch`,
        ).toEqual(enPlaceholders);
      }
    }
  });

  it("resolves English runtime messages correctly", async () => {
    const en = await loadCatalog("l10n/bundle.l10n.json");

    expect(en["Show Details"]).toBe("Show Details");
    expect(
      en["Wikitext Formatter: no active document."],
    ).toContain("no active document");
    expect(
      en["Wikitext Formatter Preview: {fileName}"],
    ).toContain("{fileName}");
  });

  it("resolves Simplified Chinese runtime translations", async () => {
    const zhCn = await loadCatalog("l10n/bundle.l10n.zh-cn.json");

    expect(zhCn["Show Details"]).toBe("显示详细信息");
    expect(
      zhCn["Wikitext Formatter: no active document."],
    ).toContain("没有活动文档");
    expect(zhCn["Wikitext Formatter Preview: {fileName}"]).toContain("预览");
  });

  it("resolves Traditional Chinese runtime translations", async () => {
    const zhTw = await loadCatalog("l10n/bundle.l10n.zh-tw.json");

    expect(zhTw["Show Details"]).toBe("顯示詳細資料");
    expect(
      zhTw["Wikitext Formatter: no active document."],
    ).toContain("沒有作用中的檔案");
    expect(zhTw["Wikitext Formatter Preview: {fileName}"]).toContain("預覽");
  });
});
