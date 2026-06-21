import { describe, it } from "vitest";
import {
  expectRealPageRegression,
  listRealPages,
} from "./helpers/realPages.js";

const pages = await listRealPages();
const options = { level: "experimental", formatTables: true } as const;

describe("experimental table formatting on real pages", () => {
  for (const page of pages) {
    it(`${page} remains parseable and idempotent`, async () => {
      await expectRealPageRegression(page, options);
    });
  }
});
