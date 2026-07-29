import { readFile } from "node:fs/promises";

import { beforeAll, describe, expect, it } from "vitest";

let checksWorkflow;
let releaseWorkflow;

beforeAll(async () => {
  [checksWorkflow, releaseWorkflow] = await Promise.all([
    readFile(".github/workflows/checks.yml", "utf8"),
    readFile(".github/workflows/release-core.yml", "utf8"),
  ]);
});

describe("ordinary checks workflow", () => {
  it("is read-only, branch-oriented, and has no tag release trigger", () => {
    expect(checksWorkflow).toContain("name: Checks");
    expect(checksWorkflow).toContain("branches:");
    expect(checksWorkflow).not.toContain("tags:");
    expect(checksWorkflow).toContain("permissions:\n  contents: read");
    expect(checksWorkflow).not.toMatch(/\bpublish\b/u);
  });

  it("separates core, corpus, and VS Code package verification", () => {
    expect(checksWorkflow).toContain("\n  core:");
    expect(checksWorkflow).toContain("\n  corpus:");
    expect(checksWorkflow).toContain("\n  vscode-package:");
    expect(checksWorkflow.match(/pnpm corpus/gu)).toHaveLength(1);
  });
});

describe("core release workflow", () => {
  it("uses tag pushes and verification-only manual dispatch", () => {
    expect(releaseWorkflow).toContain('- "core-v*"');
    expect(releaseWorkflow).toContain("workflow_dispatch:");
    expect(releaseWorkflow).not.toContain("pull_request:");
    expect(releaseWorkflow).toMatch(
      /publish-npm:\n    if: github\.event_name == 'push' && github\.ref_type == 'tag' && startsWith\(github\.ref, 'refs\/tags\/core-v'\)/u,
    );
    expect(releaseWorkflow).toMatch(
      /github-release:\n    if: github\.event_name == 'push' && github\.ref_type == 'tag' && startsWith\(github\.ref, 'refs\/tags\/core-v'\)/u,
    );
  });

  it("keeps npm OIDC and repository write permission in separate jobs", () => {
    expect(releaseWorkflow).toMatch(
      /publish-npm:[\s\S]*?permissions:\n      contents: read\n      id-token: write[\s\S]*?\n  github-release:/u,
    );
    expect(releaseWorkflow).toMatch(
      /github-release:[\s\S]*?permissions:\n      contents: write/u,
    );
    const githubReleaseJob = releaseWorkflow.slice(
      releaseWorkflow.indexOf("\n  github-release:"),
    );
    expect(githubReleaseJob).not.toContain("id-token: write");
  });

  it("publishes only the verified tarball and never recursively", () => {
    expect(releaseWorkflow).toContain("pnpm publish \\");
    expect(releaseWorkflow).not.toMatch(/pnpm (?:-r|--recursive) publish/u);
    expect(releaseWorkflow.match(/pnpm publish/gu)).toHaveLength(1);
  });
});
