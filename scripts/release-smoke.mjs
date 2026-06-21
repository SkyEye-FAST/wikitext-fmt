#!/usr/bin/env node
import { access } from "node:fs/promises";

const entry = await import("../dist/index.js");
if (entry.formatWikitext("==Title==\n") !== "== Title ==\n") {
  throw new Error("dist/index.js formatWikitext smoke failed");
}
if (typeof entry.loadSiteInfoAliases !== "function") {
  throw new Error("loadSiteInfoAliases is not exported from dist/index.js");
}

await access("dist/localization/generated/mediawiki-aliases.json");
const aliases = await import(
  "../dist/localization/generated/mediawiki-aliases.json",
  {
    with: { type: "json" },
  }
);
if (!aliases.default.categoryNamespaces.includes("Kategorie")) {
  throw new Error("generated localization aliases were not emitted to dist");
}

console.log("release smoke ok");
