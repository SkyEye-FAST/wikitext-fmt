import { describe, expect, it } from "vitest";

import {
  readmeMarkdownLinks,
  validateCorePackageEntries,
} from "../scripts/check-core-package-content.mjs";

const required = [
  "package/package.json",
  "package/README.md",
  "package/CHANGELOG.md",
  "package/LICENSE",
  "package/dist/index.js",
  "package/dist/index.d.ts",
  "package/dist/browser.js",
  "package/dist/browser.d.ts",
  "package/dist/publicTypes.d.ts",
  "package/dist/parser.browser.js",
  "package/dist/cli.js",
  "package/dist/localization/generated/mediawiki-aliases.json",
  "package/docs/README.md",
  "package/docs/cli.md",
  "package/docs/configuration.md",
  "package/docs/versioning.md",
  "package/docs/releasing.md",
];

describe("core package content", () => {
  it("accepts the explicit package allowlist and packaged README links", () => {
    expect(
      validateCorePackageEntries(
        required,
        "[CLI](docs/cli.md) [Release](docs/releasing.md#release)",
      ),
    ).toEqual([]);
  });

  it("rejects repository-only and credential-bearing files", () => {
    const errors = validateCorePackageEntries(
      [...required, "package/tests/example.test.ts", "package/.npmrc"],
      "",
    );
    expect(errors).toContain(
      "file is outside the package allowlist: package/tests/example.test.ts",
    );
    expect(errors).toContain("forbidden package file: package/.npmrc");
  });

  it("rejects outputs from removed runtime-binding modules", () => {
    const removedTemplateOutput = `package/dist/rules/template${"Parameters"}.js`;
    const errors = validateCorePackageEntries(
      [
        ...required,
        "package/dist/formatterCore.js",
        "package/dist/parserContext.node.d.ts",
        "package/dist/rules/tables.node.js.map",
        removedTemplateOutput,
      ],
      "",
    );
    expect(errors).toContain(
      "obsolete internal output: package/dist/formatterCore.js",
    );
    expect(errors).toContain(
      "obsolete internal output: package/dist/parserContext.node.d.ts",
    );
    expect(errors).toContain(
      "obsolete internal output: package/dist/rules/tables.node.js.map",
    );
    expect(errors).toContain(`obsolete internal output: ${removedTemplateOutput}`);
  });

  it("requires relative Markdown links from the packaged README", () => {
    expect(readmeMarkdownLinks("[Docs](docs/missing.md)")).toEqual([
      "package/docs/missing.md",
    ]);
    expect(
      validateCorePackageEntries(required, "[Docs](docs/missing.md)"),
    ).toContain(
      "README link is not included in the package: package/docs/missing.md",
    );
  });
});
