import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  getParserConfig,
  loadParserConfigDataForTesting,
} from "../src/parser.js";

describe("parser config loading", () => {
  it.each(["mediawiki", "default"] as const)(
    "loads the normal %s parser config",
    (name) => {
      expect(() => getParserConfig(name)).not.toThrow();
    },
  );

  it("loads explicit path-based parser config files", async () => {
    const root = await mkdtemp(join(tmpdir(), "wikitext-fmt-parser-"));
    const source = JSON.parse(
      await readFile(
        new URL(
          "../node_modules/wikiparser-node/config/default.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as unknown;
    const filename = join(root, "parser-config.json");
    await writeFile(filename, JSON.stringify(source));

    const loaded = loadParserConfigDataForTesting(filename, {
      readFile: (path) => {
        return JSON.stringify(source);
      },
      resolvePackageJson: () => {
        throw new Error("package lookup should not be used for paths");
      },
    });

    expect(loaded).toEqual(source);
    expect(() => getParserConfig(filename)).not.toThrow();
  });

  it.each(["mediawiki", "default"] as const)(
    "uses bundled default fallback for %s when package config lookup is unavailable",
    (name) => {
      const loaded = loadParserConfigDataForTesting(name, {
        readFile: () => {
          throw new Error("file lookup should not be used by fallback");
        },
        resolvePackageJson: () => {
          throw new Error("simulated missing package.json");
        },
      });

      expect(loaded).toHaveProperty("namespaces");
      expect(loaded).toHaveProperty("parserFunction");
    },
  );

  it("does not silently fallback for unknown named parser configs", () => {
    expect(() =>
      loadParserConfigDataForTesting("zhwiki", {
        readFile: () => {
          throw new Error("file lookup should not be used");
        },
        resolvePackageJson: () => {
          throw new Error("simulated missing package.json");
        },
      }),
    ).toThrow(
      /Named parser config "zhwiki" requires wikiparser-node config assets or an explicit JSON config path/u,
    );
  });
});
