import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const cli = resolve("dist/cli.js");
const temporaryDirectories: string[] = [];

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

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("CLI production behavior", () => {
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

    const aggressive = await runCli(
      ["--profile", "aggressive", "--check", "--debug", file],
      { cwd: root },
    );
    expect(aggressive.code).toBe(0);
    expect(aggressive.stderr).toContain("mode=safe");

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

    const warning = await runCli(["--safe", "--stdin", "--fail-on-warning"], {
      stdin: "==Title==\r\nText\r\n",
    });
    expect(warning.code).toBe(1);
    expect(warning.stdout).toBe("==Title==\r\nText\r\n");
    expect(warning.stderr).toMatch(/^warning: .*round-trip/imu);
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

  it("makes --safe --check --fail-on-warning fail on fallback warnings", async () => {
    const root = await temporaryDirectory();
    const file = join(root, "crlf.wiki");
    await writeFile(file, "==Title==\r\nText\r\n");

    const defaultWarning = await runCli(["--safe", "--check", file], {
      cwd: root,
    });
    expect(defaultWarning.code).toBe(0);
    expect(defaultWarning.stdout).toBe("");
    expect(defaultWarning.stderr).toMatch(/warning: .*round-trip/iu);

    const failingWarning = await runCli(
      ["--safe", "--check", "--fail-on-warning", file],
      { cwd: root },
    );
    expect(failingWarning.code).toBe(1);
    expect(failingWarning.stdout).toBe("");
    expect(failingWarning.stderr).toMatch(/warning: .*round-trip/iu);
  });
});
