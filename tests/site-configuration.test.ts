import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  applySiteFormattingData,
  normalizeSiteConfigurationSnapshot,
  serializeSiteConfigurationSnapshot,
  validateProjectConfig,
} from "../src/projectConfig.js";
import {
  clearSiteConfigurationMemoryCache,
  resolveProjectConfiguration,
} from "../src/siteConfiguration.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "wikitext-fmt-site-"));
  temporaryDirectories.push(directory);
  return directory;
}

function siteInfoResponse(): Response {
  return new Response(
    JSON.stringify({
      query: {
        namespaces: [
          { id: 6, canonical: "File", name: "Datei" },
          { id: 14, canonical: "Category", name: "Kategorie" },
        ],
        namespacealiases: [{ id: 14, alias: "CatX" }],
        interwikimap: [
          { prefix: "de", language: "Deutsch" },
          { prefix: "file", language: "Conflict" },
        ],
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function snapshot(apiUrl = "https://wiki.example/api.php") {
  return {
    schemaVersion: 1 as const,
    apiUrl,
    fetchedAt: "2026-08-02T00:00:00.000Z",
    formatterData: {
      localizationAliases: {
        categoryNamespaces: ["Category", "Kategorie"],
        fileNamespaces: ["File", "Datei"],
      },
      interlanguagePrefixes: ["de", "file"],
    },
  };
}

afterEach(async () => {
  clearSiteConfigurationMemoryCache();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("project site configuration", () => {
  it("strictly validates project and nested site options", () => {
    expect(
      validateProjectConfig({
        profile: "production",
        site: {
          apiUrl: "https://wiki.example/api.php",
          parserConfig: "zhwiki",
          snapshotPath: "site.json",
          cachePath: ".cache/site.json",
          cacheMaxAgeSeconds: 0,
          allowStaleCache: true,
        },
      }),
    ).toMatchObject({ profile: "production", site: { cacheMaxAgeSeconds: 0 } });
    expect(() => validateProjectConfig({ site: { invented: true } })).toThrow(
      /site\.invented/u,
    );
    expect(() => validateProjectConfig({ site: [] })).toThrow(/site.*object/u);
    expect(() =>
      validateProjectConfig({ site: { apiUrl: "ftp://wiki.example/api.php" } }),
    ).toThrow(/HTTP or HTTPS/u);
    expect(() =>
      validateProjectConfig({ site: { apiUrl: "https://user@wiki.example/api.php" } }),
    ).toThrow(/without credentials/u);
    expect(() =>
      validateProjectConfig({ site: { cacheMaxAgeSeconds: -1 } }),
    ).toThrow(/non-negative/u);
  });

  it("validates direct resolver overrides at runtime", async () => {
    await expect(
      resolveProjectConfiguration({
        siteOverrides: { cacheMaxAgeSeconds: -1 },
      }),
    ).rejects.toThrow(/site\.cacheMaxAgeSeconds.*non-negative/u);
  });

  it("normalizes and stably serializes schema-versioned snapshots", () => {
    const normalized = normalizeSiteConfigurationSnapshot({
      ...snapshot("https://wiki.example/api.php?token=secret#fragment"),
      fetchedAt: "2026-08-02T08:00:00+08:00",
    });
    expect(normalized.apiUrl).toBe("https://wiki.example/api.php");
    expect(normalized.fetchedAt).toBe("2026-08-02T00:00:00.000Z");
    const serialized = serializeSiteConfigurationSnapshot(normalized);
    expect(serialized).toBe(`${JSON.stringify(normalized, null, 2)}\n`);
    expect(serialized).not.toContain("secret");
    const reordered = {
      ...normalized,
      formatterData: {
        interlanguagePrefixes: [...normalized.formatterData.interlanguagePrefixes],
        localizationAliases: {
          fileNamespaces:
            normalized.formatterData.localizationAliases.fileNamespaces,
          categoryNamespaces:
            normalized.formatterData.localizationAliases.categoryNamespaces,
        },
      },
    };
    expect(serializeSiteConfigurationSnapshot(reordered)).toBe(serialized);
    expect(() =>
      normalizeSiteConfigurationSnapshot({ ...snapshot(), schemaVersion: 2 }),
    ).toThrow(/Unsupported.*schemaVersion/u);
    expect(() =>
      normalizeSiteConfigurationSnapshot(
        snapshot(),
        "https://other.example/api.php",
      ),
    ).toThrow(/URL mismatch/u);
  });

  it("applies site aliases and prefixes with explicit override precedence", () => {
    expect(
      applySiteFormattingData(
        {
          localizationAliases: { categoryNamespaces: ["Explicit"] },
          interlanguagePrefixes: ["explicit"],
        },
        snapshot().formatterData,
      ),
    ).toMatchObject({
      localizationSource: "custom",
      localizationAliases: {
        categoryNamespaces: ["Category", "Kategorie", "Explicit"],
      },
      interlanguagePrefixes: ["explicit"],
    });
    expect(
      applySiteFormattingData(
        { localizationSource: "builtin" },
        snapshot().formatterData,
      ),
    ).toMatchObject({
      localizationSource: "builtin",
      interlanguagePrefixes: ["de", "file"],
    });
  });

  it("loads snapshots without network and excludes namespace conflicts", async () => {
    const directory = await temporaryDirectory();
    const path = join(directory, "site.json");
    await writeFile(path, serializeSiteConfigurationSnapshot(snapshot()));
    const resolved = await resolveProjectConfiguration({
      projectConfig: { site: { snapshotPath: path } },
      fetchImplementation: async () => {
        throw new Error("network must not be used");
      },
    });
    expect(resolved.siteConfiguration).toMatchObject({
      source: "snapshot",
      stale: false,
      aliasesApplied: true,
      prefixesApplied: true,
      excludedInterlanguagePrefixes: ["file"],
    });
    expect(resolved.options.interlanguagePrefixes).toEqual(["de"]);
    expect(resolved.options.localizationSource).toBe("custom");
  });

  it("uses fresh disk cache before network", async () => {
    const directory = await temporaryDirectory();
    const cachePath = join(directory, "cache.json");
    const now = () => new Date("2026-08-02T00:00:10.000Z");
    let requests = 0;
    const first = await resolveProjectConfiguration({
      projectConfig: {
        site: {
          apiUrl: "https://wiki.example/api.php",
          cachePath,
          cacheMaxAgeSeconds: 60,
        },
      },
      now,
      fetchImplementation: async () => {
        requests++;
        return siteInfoResponse();
      },
    });
    expect(first.siteConfiguration.source).toBe("network");
    expect(requests).toBe(1);
    clearSiteConfigurationMemoryCache();
    const second = await resolveProjectConfiguration({
      projectConfig: {
        site: {
          apiUrl: "https://wiki.example/api.php",
          cachePath,
          cacheMaxAgeSeconds: 60,
        },
      },
      now,
      fetchImplementation: async () => {
        throw new Error("fresh cache should be used");
      },
    });
    expect(second.siteConfiguration.source).toBe("fresh-cache");
    expect(JSON.parse(await readFile(cachePath, "utf8"))).toMatchObject({
      schemaVersion: 1,
      apiUrl: "https://wiki.example/api.php",
    });
  });

  it("deduplicates concurrent requests and revalidates TTL zero on refresh", async () => {
    let requests = 0;
    const options = {
      projectConfig: {
        site: {
          apiUrl: "https://wiki.example/api.php",
          cacheMaxAgeSeconds: 0,
        },
      },
      now: () => new Date("2026-08-02T00:00:10.000Z"),
      fetchImplementation: async () => {
        requests++;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
        return siteInfoResponse();
      },
    } as const;
    await Promise.all([
      resolveProjectConfiguration(options),
      resolveProjectConfiguration(options),
    ]);
    expect(requests).toBe(1);
    await resolveProjectConfiguration(options);
    expect(requests).toBe(1);
    await resolveProjectConfiguration({ ...options, refresh: true });
    expect(requests).toBe(2);
  });

  it("falls back only to an allowed valid stale cache", async () => {
    const directory = await temporaryDirectory();
    const cachePath = join(directory, "cache.json");
    await writeFile(cachePath, serializeSiteConfigurationSnapshot(snapshot()));
    const resolved = await resolveProjectConfiguration({
      projectConfig: {
        site: {
          apiUrl: "https://wiki.example/api.php",
          cachePath,
          cacheMaxAgeSeconds: 1,
          allowStaleCache: true,
        },
      },
      now: () => new Date("2026-08-03T00:00:00.000Z"),
      fetchImplementation: async () => {
        throw new Error("offline");
      },
    });
    expect(resolved.siteConfiguration.source).toBe("stale-cache");
    expect(resolved.siteConfiguration.stale).toBe(true);
    expect(resolved.siteConfiguration.diagnostics.join(" ")).toMatch(/offline/u);
  });

  it("redacts API query data from network errors and stale diagnostics", async () => {
    const directory = await temporaryDirectory();
    const cachePath = join(directory, "cache.json");
    await writeFile(cachePath, serializeSiteConfigurationSnapshot(snapshot()));
    const apiUrl = "https://wiki.example/api.php?token=secret";
    const resolved = await resolveProjectConfiguration({
      projectConfig: {
        site: {
          apiUrl,
          cachePath,
          cacheMaxAgeSeconds: 1,
          allowStaleCache: true,
        },
      },
      now: () => new Date("2026-08-03T00:00:00.000Z"),
      fetchImplementation: async () => {
        throw new Error(`offline at ${apiUrl}`);
      },
    });
    expect(JSON.stringify(resolved)).not.toContain("secret");
    expect(resolved.siteConfiguration.diagnostics.join(" ")).toContain(
      "https://wiki.example/api.php",
    );
  });

  it("does not use corrupt or URL-mismatched cache data", async () => {
    const directory = await temporaryDirectory();
    const cachePath = join(directory, "cache.json");
    await writeFile(cachePath, "{broken");
    const recovered = await resolveProjectConfiguration({
      projectConfig: {
        site: { apiUrl: "https://wiki.example/api.php", cachePath },
      },
      fetchImplementation: async () => siteInfoResponse(),
    });
    expect(recovered.siteConfiguration.source).toBe("network");
    expect(recovered.siteConfiguration.diagnostics.join(" ")).toMatch(
      /Could not read site configuration/u,
    );

    clearSiteConfigurationMemoryCache();
    await writeFile(
      cachePath,
      serializeSiteConfigurationSnapshot(
        snapshot("https://different.example/api.php"),
      ),
    );
    await expect(
      resolveProjectConfiguration({
        projectConfig: {
          site: {
            apiUrl: "https://wiki.example/api.php",
            cachePath,
            allowStaleCache: true,
          },
        },
        fetchImplementation: async () => {
          throw new Error("offline");
        },
      }),
    ).rejects.toThrow(/offline/u);
  });

  it("does not disguise an atomic write failure as stale network fallback", async () => {
    await expect(
      resolveProjectConfiguration({
        projectConfig: {
          site: {
            apiUrl: "https://wiki.example/api.php",
            cachePath: "/virtual/cache.json",
            cacheMaxAgeSeconds: 1,
            allowStaleCache: true,
          },
        },
        fetchImplementation: async () => siteInfoResponse(),
        storage: {
          async read() {
            return serializeSiteConfigurationSnapshot(snapshot());
          },
          async writeAtomic() {
            throw new Error("atomic write failed");
          },
        },
        now: () => new Date("2026-08-03T00:00:00.000Z"),
      }),
    ).rejects.toThrow(/atomic write failed/u);
  });

  it("uses formatter, project, site, and default parser precedence", async () => {
    await expect(
      resolveProjectConfiguration({
        projectConfig: {
          parserConfig: "mediawiki",
          site: { parserConfig: "not-a-real-parser-config" },
        },
        formatterOverrides: { parserConfig: "mediawiki" },
      }),
    ).resolves.toMatchObject({
      siteConfiguration: {
        parserConfig: "mediawiki",
        parserConfigSource: "override",
      },
    });
    await expect(
      resolveProjectConfiguration({
        projectConfig: {
          parserConfig: "mediawiki",
          site: { parserConfig: "not-a-real-parser-config" },
        },
      }),
    ).resolves.toMatchObject({
      siteConfiguration: {
        parserConfig: "mediawiki",
        parserConfigSource: "project",
      },
    });
    await expect(
      resolveProjectConfiguration({
        projectConfig: { parserConfig: "not-a-real-parser-config" },
        siteOverrides: { parserConfig: "mediawiki" },
      }),
    ).resolves.toMatchObject({
      siteConfiguration: {
        parserConfig: "mediawiki",
        parserConfigSource: "override",
      },
    });
  });

  it("validates parser ConfigData before returning resolved options", async () => {
    const directory = await temporaryDirectory();
    const parserConfig = join(directory, "invalid-parser.json");
    await writeFile(parserConfig, "{}");
    await expect(
      resolveProjectConfiguration({
        projectConfig: { site: { parserConfig } },
      }),
    ).rejects.toThrow(/Invalid parser configuration.*invalid-parser\.json/u);
  });
});
