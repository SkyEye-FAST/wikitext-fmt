import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const cli = resolve("dist/cli.js");
const temporaryDirectories: string[] = [];
const testServers: Server[] = [];

function siteSnapshot(apiUrl = "https://wiki.example/api.php"): string {
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      apiUrl,
      fetchedAt: "2026-08-02T00:00:00.000Z",
      formatterData: {
        localizationAliases: {
          categoryNamespaces: ["Category", "Kategorie"],
          fileNamespaces: ["File"],
        },
        interlanguagePrefixes: ["de"],
      },
    },
    null,
    2,
  )}\n`;
}

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "wikitext-fmt-cli-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function runCli(
  args: string[],
  options: { cwd?: string; stdin?: string } = {},
): Promise<CliResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: options.cwd,
      stdio: "pipe",
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolveResult({ code: code ?? -1, stdout, stderr });
    });
    child.stdin.end(options.stdin ?? "");
  });
}

async function siteInfoApi(): Promise<string> {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        query: {
          namespaces: [
            { id: 6, canonical: "File" },
            { id: 14, canonical: "Category" },
          ],
          interwikimap: [
            { prefix: "de", language: "Deutsch" },
            { prefix: "en", local: true },
          ],
        },
      }),
    );
  });
  testServers.push(server);
  await new Promise<void>((resolveListen) => {
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}/api.php`;
}

async function parserConfigApi(): Promise<string> {
  const codeMirrorConfig = {
    tags: { ref: true },
    tagModes: {},
    urlProtocols: "http://|https://|mailto:",
    functionSynonyms: [{ "#if": "#if" }, {}],
    doubleUnderscore: [{}, {}],
    functionHooks: ["msgnw"],
    variableIDs: ["pageid"],
    redirection: ["#redirect"],
    subst: { subst: "subst" },
    imageKeywords: { thumb: "thumbnail" },
  };
  const payload = {
    query: {
      general: { articlepath: "/wiki/$1", server: "http://127.0.0.1" },
      namespaces: [
        { id: 0, name: "", canonical: "" },
        { id: 6, name: "File", canonical: "File" },
        { id: 14, name: "Category", canonical: "Category" },
      ],
      namespacealiases: [],
      magicwords: [
        { name: "msgnw", aliases: ["msgnw"], "case-sensitive": false },
        { name: "msg", aliases: ["msg"], "case-sensitive": false },
        { name: "raw", aliases: ["raw"], "case-sensitive": false },
        { name: "subst", aliases: ["subst"], "case-sensitive": false },
        { name: "safesubst", aliases: ["safesubst"], "case-sensitive": false },
        { name: "redirect", aliases: ["#REDIRECT"], "case-sensitive": false },
        { name: "img_thumb", aliases: ["thumb"], "case-sensitive": false },
      ],
      interwikimap: [{ prefix: "w" }],
      languagevariants: [],
      extensiontags: ["ref"],
      functionhooks: ["msgnw"],
      variables: ["pageid"],
      doubleunderscores: [],
      protocols: ["http://", "https://", "mailto:"],
    },
  };
  const server = createServer((request, response) => {
    if (request.url?.startsWith("/load.php")) {
      response.setHeader("content-type", "application/javascript");
      response.end(
        `mw.config.set({ extCodeMirrorConfig: ${JSON.stringify(codeMirrorConfig)} });`,
      );
      return;
    }
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(payload));
  });
  testServers.push(server);
  await new Promise<void>((resolveListen) => {
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}/api.php`;
}

afterEach(async () => {
  await Promise.all(
    [
      ...temporaryDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
      ...testServers.splice(0).map(
        (server) =>
          new Promise<void>((resolveClose, reject) => {
            server.close((error) => {
              if (error) reject(error);
              else resolveClose();
            });
          }),
      ),
    ],
  );
});

describe("CLI production behavior", () => {
  it("reports the package version before processing irrelevant arguments", async () => {
    const packageMetadata = JSON.parse(
      await readFile(resolve("package.json"), "utf8"),
    ) as { version: string };
    const expected = `${packageMetadata.version}\n`;

    const longAlias = await runCli([
      "--version",
      "--config",
      "missing-config.json",
      "missing-input.wiki",
    ]);
    expect(longAlias).toEqual({ code: 0, stdout: expected, stderr: "" });

    const shortAlias = await runCli([
      "missing-input.wiki",
      "--write",
      "--check",
      "-v",
    ]);
    expect(shortAlias).toEqual({ code: 0, stdout: expected, stderr: "" });
  });

  it("advertises version reporting in CLI help", async () => {
    const result = await runCli(["--help"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("General:");
    expect(result.stdout).toContain("--version, -v");
    expect(result.stdout).toContain("Input and output:");
    expect(result.stdout).toContain("Safety and diagnostics:");
    expect(result.stdout).toContain("Configuration and localization:");
    expect(result.stdout).toContain("Formatter options:");
    expect(result.stdout).toContain("--format-tables, --no-format-tables");
    expect(result.stdout).toContain("--localized-syntax-style");
    expect(result.stderr).toBe("");
  });

  it("rejects removed template-parameter flags", async () => {
    for (const flag of [
      `--${["format", "template", "parameters"].join("-")}`,
      `--no-${["format", "template", "parameters"].join("-")}`,
    ]) {
      const result = await runCli([flag, "page.wiki"]);
      expect(result.code).toBe(2);
      expect(result.stderr).toContain(`Unknown option: ${flag}`);
    }
  });

  it("uses safe mode by default for production writes and allows an explicit unsafe override", async () => {
    const root = await temporaryDirectory();
    const file = join(root, "page.wiki");
    await writeFile(file, "==Title==\n");

    const production = await runCli(
      ["--profile", "production", "--write", "--debug", file],
      { cwd: root },
    );
    expect(production.code).toBe(0);
    expect(production.stderr).toContain("mode=safe");

    const removedProfile = await runCli(
      ["--profile", "aggressive", "--check", "--debug", file],
      { cwd: root },
    );
    expect(removedProfile.code).toBe(2);
    expect(removedProfile.stderr).toContain(
      "--profile must be default or production",
    );

    const unsafe = await runCli(
      ["--profile", "production", "--unsafe", "--check", "--debug", file],
      { cwd: root },
    );
    expect(unsafe.code).toBe(0);
    expect(unsafe.stderr).toContain("mode=unsafe");

    const contradictory = await runCli(
      ["--safe", "--unsafe", "--check", file],
      { cwd: root },
    );
    expect(contradictory.code).toBe(2);
    expect(contradictory.stderr).toContain(
      "--safe and --unsafe cannot be used together",
    );
  });

  it("uses intentional exit codes for --check and --write", async () => {
    const root = await temporaryDirectory();
    const file = join(root, "page.wiki");
    await writeFile(file, "==Title==\n");

    const checkChanged = await runCli(["--safe", "--check", file], {
      cwd: root,
    });
    expect(checkChanged).toEqual({ code: 1, stdout: "", stderr: "" });
    expect(await readFile(file, "utf8")).toBe("==Title==\n");

    const write = await runCli(["--safe", "--write", file], { cwd: root });
    expect(write).toEqual({ code: 0, stdout: "", stderr: "" });
    expect(await readFile(file, "utf8")).toBe("== Title ==\n");

    const checkClean = await runCli(["--safe", "--check", file], {
      cwd: root,
    });
    expect(checkClean).toEqual({ code: 0, stdout: "", stderr: "" });
  });

  it("emits diffs only on stdout", async () => {
    const root = await temporaryDirectory();
    const file = join(root, "page.wiki");
    await writeFile(file, "==Title==\n");

    const result = await runCli(["--safe", "--diff", file], { cwd: root });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain(`--- ${file}\n+++ ${file}\n`);
    expect(result.stdout).toContain("-==Title==\n+== Title ==");
    expect(result.stderr).toBe("");
  });

  it("formats stdin and keeps safe warnings off formatted stdout", async () => {
    const formatted = await runCli(["--safe", "--stdin"], {
      stdin: "==Title==\n",
    });
    expect(formatted).toEqual({
      code: 0,
      stdout: "== Title ==\n",
      stderr: "",
    });

    const crlf = await runCli(["--safe", "--stdin", "--fail-on-warning"], {
      stdin: "==Title==\r\nText\r\n",
    });
    expect(crlf).toEqual({
      code: 0,
      stdout: "== Title ==\r\nText\r\n",
      stderr: "",
    });
  });

  it("expands globs deterministically and fails on unmatched globs", async () => {
    const root = await temporaryDirectory();
    await mkdir(join(root, "pages"));
    await writeFile(join(root, "pages", "b.wiki"), "==Clean B==\n");
    await writeFile(join(root, "pages", "a.wiki"), "==Clean A==\n");

    const matched = await runCli(["--safe", "--check", "pages/*.wiki"], {
      cwd: root,
    });
    expect(matched).toEqual({ code: 1, stdout: "", stderr: "" });

    const unmatched = await runCli(["--check", "missing/*.wiki"], {
      cwd: root,
    });
    expect(unmatched.code).toBe(2);
    expect(unmatched.stdout).toBe("");
    expect(unmatched.stderr).toMatch(
      /Glob pattern matched no files: missing\/\*\.wiki/u,
    );
  });

  it("discovers config and lets --no-config bypass it", async () => {
    const root = await temporaryDirectory();
    const nested = join(root, "pages", "nested");
    await mkdir(nested, { recursive: true });
    await writeFile(
      join(root, ".wikitextfmtrc.json"),
      JSON.stringify({ formatHeadings: false }),
    );
    const file = join(nested, "page.wiki");
    await writeFile(file, "==Title==\n");

    const configured = await runCli([file], { cwd: nested });
    expect(configured).toEqual({
      code: 0,
      stdout: "==Title==\n",
      stderr: "",
    });

    const defaults = await runCli(["--no-config", file], { cwd: nested });
    expect(defaults).toEqual({
      code: 0,
      stdout: "== Title ==\n",
      stderr: "",
    });
  });

  it("uses siteinfo language prefixes unless the CLI explicitly overrides them", async () => {
    const api = await siteInfoApi();
    const input = "[[de:Deutsch]]\n[[en:English]]\nBody\n";
    const siteinfo = await runCli(
      [
        "--stdin",
        "--profile",
        "production",
        "--localization-source",
        "siteinfo",
        "--site-api",
        api,
      ],
      { stdin: input },
    );
    expect(siteinfo).toEqual({
      code: 0,
      stdout: "[[en:English]]\nBody\n\n[[de:Deutsch]]\n",
      stderr: "",
    });

    const explicit = await runCli(
      [
        "--stdin",
        "--profile",
        "production",
        "--localization-source",
        "siteinfo",
        "--site-api",
        api,
        "--interlanguage-prefixes",
        "en",
      ],
      { stdin: input },
    );
    expect(explicit).toEqual({
      code: 0,
      stdout: "[[de:Deutsch]]\nBody\n\n[[en:English]]\n",
      stderr: "",
    });
  });

  it("loads a relative project snapshot without network", async () => {
    const root = await temporaryDirectory();
    await writeFile(join(root, "site.json"), siteSnapshot());
    await writeFile(
      join(root, ".wikitextfmtrc"),
      JSON.stringify({
        profile: "production",
        site: { snapshotPath: "site.json" },
      }),
    );

    const result = await runCli(["--stdin"], {
      cwd: root,
      stdin: "[[de:Deutsch]]\nBody\n",
    });
    expect(result).toEqual({
      code: 0,
      stdout: "Body\n\n[[de:Deutsch]]\n",
      stderr: "",
    });
  });

  it("prints sanitized resolved site configuration", async () => {
    const root = await temporaryDirectory();
    const path = join(root, "site.json");
    await writeFile(
      path,
      siteSnapshot("https://wiki.example/api.php?token=secret"),
    );

    const result = await runCli([
      "--site-snapshot",
      path,
      "--print-site-configuration",
    ]);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("secret");
    expect(JSON.parse(result.stdout)).toMatchObject({
      siteConfiguration: {
        source: "snapshot",
        apiUrl: "https://wiki.example/api.php",
        snapshotPath: path,
        stale: false,
      },
    });
  });

  it("keeps resolver diagnostics inside JSON diagnostic records", async () => {
    const root = await temporaryDirectory();
    const path = join(root, "site.json");
    const conflicting = JSON.parse(siteSnapshot()) as {
      formatterData: { interlanguagePrefixes: string[] };
    };
    conflicting.formatterData.interlanguagePrefixes.push("file");
    await writeFile(path, `${JSON.stringify(conflicting, null, 2)}\n`);

    const result = await runCli(
      ["--stdin", "--diagnostics-json", "--site-snapshot", path],
      { stdin: "==Title==\n" },
    );
    expect(result.code).toBe(0);
    const lines = result.stderr.trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      siteConfiguration: {
        source: "snapshot",
        excludedInterlanguagePrefixes: ["file"],
      },
    });
  });

  it("refreshes and atomically writes an explicit site snapshot", async () => {
    const root = await temporaryDirectory();
    const path = join(root, "site.json");
    const api = await siteInfoApi();
    const result = await runCli([
      "--site-api",
      api,
      "--site-snapshot",
      path,
      "--refresh-site-configuration",
    ]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      siteConfiguration: { source: "network", snapshotPath: path },
    });
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({
      schemaVersion: 1,
      apiUrl: api,
    });
  });

  it("generates, checks, prints, and protects explicit parser configs", async () => {
    const root = await temporaryDirectory();
    const apiUrl = await parserConfigApi();
    const outputPath = join(root, "config", "site.parser.json");
    await writeFile(
      join(root, ".wikitext-fmt.json"),
      JSON.stringify({
        site: {
          apiUrl,
          parserConfig: "./config/site.parser.json",
          parserConfigGeneration: { outputPath: "./config/site.parser.json" },
        },
      }),
    );

    const generated = await runCli(["--generate-parser-config"], { cwd: root });
    expect(generated.code).toBe(0);
    expect(JSON.parse(generated.stdout)).toMatchObject({ outputPath });
    expect(JSON.parse(await readFile(outputPath, "utf8"))).toMatchObject({
      nsid: { "": 0 },
    });
    await expect(readFile(`${outputPath}.meta.json`, "utf8")).resolves.toContain(
      '"schemaVersion": 1',
    );

    const current = await runCli(["--check-parser-config"], { cwd: root });
    expect(current).toMatchObject({ code: 0, stdout: "" });
    const printed = await runCli(["--print-parser-config"], { cwd: root });
    expect(printed.code).toBe(0);
    expect(JSON.parse(printed.stdout)).toMatchObject({ nsid: { "": 0 } });

    const stale = JSON.parse(await readFile(outputPath, "utf8")) as {
      variable: string[];
    };
    stale.variable.push("drift");
    await writeFile(outputPath, `${JSON.stringify(stale, null, 2)}\n`);
    const drift = await runCli(["--check-parser-config"], { cwd: root });
    expect(drift.code).toBe(1);
    expect(drift.stdout).toContain("@@ variable @@");
    const overwrite = await runCli(["--generate-parser-config"], { cwd: root });
    expect(overwrite.code).toBe(2);
    const forced = await runCli(
      ["--generate-parser-config", "--force-parser-config"],
      { cwd: root },
    );
    expect(forced.code).toBe(0);
  });

  it("fails closed when configured site data cannot be loaded", async () => {
    const result = await runCli([
      "--site-api",
      "http://127.0.0.1:1/api.php",
      "--print-site-configuration",
    ]);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/Could not fetch MediaWiki siteinfo/u);
  });

  it("emits one diagnostics JSON object per input on stderr", async () => {
    const root = await temporaryDirectory();
    await writeFile(join(root, "a.wiki"), "==A==\n");
    await writeFile(join(root, "b.wiki"), "==B==\n");

    const result = await runCli(["--safe", "--diagnostics-json", "*.wiki"], {
      cwd: root,
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("== A ==\n== B ==\n");
    const records = result.stderr
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(records).toHaveLength(2);
    expect(records.map((record) => record.file)).toEqual([
      join(root, "a.wiki"),
      join(root, "b.wiki"),
    ]);
    expect(records.every((record) => record.warning === null)).toBe(true);
  });

  it("keeps JSON diagnostics separate from diff output", async () => {
    const result = await runCli(
      ["--safe", "--stdin", "--diff", "--diagnostics-json"],
      { stdin: "==Title==\n" },
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("--- stdin\n+++ stdin\n");
    expect(() => JSON.parse(result.stderr.trim())).not.toThrow();
    expect(result.stderr).not.toContain("--- stdin");
  });

  it("writes a valid batch report without corrupting normal output", async () => {
    const root = await temporaryDirectory();
    const reportPath = join(root, "report.json");
    const result = await runCli(["--safe", "--stdin", "--report", reportPath], {
      cwd: root,
      stdin: "==Title==\n",
    });
    expect(result).toEqual({
      code: 0,
      stdout: "== Title ==\n",
      stderr: "",
    });
    const report = JSON.parse(await readFile(reportPath, "utf8")) as {
      summary: { files: number; changedFiles: number; warningFiles: number };
      files: Array<{ file: string; changed: boolean; warning: null }>;
    };
    expect(report.summary).toMatchObject({
      files: 1,
      changedFiles: 1,
      warningFiles: 0,
    });
    expect(report.files).toEqual([
      { ...report.files[0], file: "stdin", changed: true, warning: null },
    ]);
  });

  it("preserves CRLF in --check and --write modes", async () => {
    const root = await temporaryDirectory();
    const file = join(root, "crlf.wiki");
    await writeFile(file, "==Title==\r\nText\r\n");

    const check = await runCli(["--safe", "--check", file], {
      cwd: root,
    });
    expect(check).toEqual({ code: 1, stdout: "", stderr: "" });
    expect(await readFile(file, "utf8")).toBe("==Title==\r\nText\r\n");

    const write = await runCli(["--safe", "--write", file], { cwd: root });
    expect(write).toEqual({ code: 0, stdout: "", stderr: "" });
    expect(await readFile(file, "utf8")).toBe("== Title ==\r\nText\r\n");
  });

  it.each([
    ["mixed", "==Title==\r\nText\n"],
    ["bare CR", "==Title==\rText"],
    ["CRLF and bare CR", "==Title==\r\nText\rTail"],
  ])("fails closed for unsupported %s line endings", async (_name, source) => {
    const root = await temporaryDirectory();
    const file = join(root, "unsupported.wiki");
    await writeFile(file, source);

    const check = await runCli(
      ["--safe", "--check", "--fail-on-warning", file],
      { cwd: root },
    );
    expect(check.code).toBe(1);
    expect(check.stdout).toBe("");
    expect(check.stderr).toMatch(/warning: .*unsupported/iu);
    expect(await readFile(file, "utf8")).toBe(source);

    const defaultWrite = await runCli(["--safe", "--write", file], {
      cwd: root,
    });
    expect(defaultWrite.code).toBe(0);
    expect(defaultWrite.stdout).toBe("");
    expect(defaultWrite.stderr).toMatch(/warning: .*unsupported/iu);
    expect(await readFile(file, "utf8")).toBe(source);

    const write = await runCli(
      ["--safe", "--write", "--fail-on-warning", file],
      { cwd: root },
    );
    expect(write.code).toBe(1);
    expect(write.stdout).toBe("");
    expect(write.stderr).toMatch(/warning: .*unsupported/iu);
    expect(await readFile(file, "utf8")).toBe(source);

    const diff = await runCli(
      ["--safe", "--diff", "--fail-on-warning", file],
      { cwd: root },
    );
    expect(diff.code).toBe(1);
    expect(diff.stdout).toBe("");
    expect(diff.stderr).toMatch(/warning: .*unsupported/iu);
    expect(await readFile(file, "utf8")).toBe(source);
  });
});
