import { readFile } from "node:fs/promises";

import { beforeAll, describe, expect, it } from "vitest";

let checksWorkflow;
let releaseWorkflow;
let vscodeReleaseWorkflow;

beforeAll(async () => {
  [checksWorkflow, releaseWorkflow, vscodeReleaseWorkflow] = await Promise.all([
    readFile(".github/workflows/checks.yml", "utf8"),
    readFile(".github/workflows/release-core.yml", "utf8"),
    readFile(".github/workflows/release-vscode.yml", "utf8"),
  ]);
});

describe("VS Code release workflow", () => {
  it("uses component tags and keeps manual dispatch verification-only", () => {
    expect(vscodeReleaseWorkflow).toContain('- "vscode-v*"');
    expect(vscodeReleaseWorkflow).toContain("workflow_dispatch:");
    expect(vscodeReleaseWorkflow).not.toContain("pull_request:");
    expect(vscodeReleaseWorkflow).toContain("--component vscode");
    expect(vscodeReleaseWorkflow).toMatch(
      /github-release:\n    if: github\.event_name == 'push' && github\.ref_type == 'tag' && startsWith\(github\.ref, 'refs\/tags\/vscode-v'\)/u,
    );
  });

  it("never publishes to the Marketplace", () => {
    expect(vscodeReleaseWorkflow).not.toMatch(/\bvsce publish\b/u);
    expect(vscodeReleaseWorkflow).not.toContain("VSCE_PAT");
    expect(vscodeReleaseWorkflow).not.toMatch(/\bazure\b/iu);
  });

  it("tests the minimum and stable VS Code versions", () => {
    expect(vscodeReleaseWorkflow).toContain(
      'vscode-version: ["1.100.0", stable]',
    );
    expect(vscodeReleaseWorkflow).toContain(
      "VSCODE_TEST_VERSION: ${{ matrix.vscode-version }}",
    );
    expect(vscodeReleaseWorkflow).toContain(
      "VSCODE_TEST_VSIX: ${{ runner.temp }}/release-artifacts/${{ needs.verify.outputs.vsix_filename }}",
    );
  });

  it("passes one verified VSIX to tests and the GitHub Release job", () => {
    expect(vscodeReleaseWorkflow.match(/vsce package/gu)).toHaveLength(1);
    expect(vscodeReleaseWorkflow).toContain(
      "name: ${{ needs.verify.outputs.artifact_name }}",
    );
    const githubReleaseJob = vscodeReleaseWorkflow.slice(
      vscodeReleaseWorkflow.indexOf("\n  github-release:"),
    );
    expect(githubReleaseJob).toContain("actions/download-artifact@v8");
    expect(githubReleaseJob).not.toContain("vsce package");
    expect(githubReleaseJob).not.toContain("--clobber");
  });

  it("separates read-only verification from GitHub Release writes", () => {
    expect(vscodeReleaseWorkflow).toMatch(
      /verify:[\s\S]*?permissions:\n      contents: read[\s\S]*?\n  vscode-tests:/u,
    );
    expect(vscodeReleaseWorkflow).toMatch(
      /vscode-tests:[\s\S]*?permissions:\n      contents: read[\s\S]*?\n  github-release:/u,
    );
    expect(vscodeReleaseWorkflow).toMatch(
      /github-release:[\s\S]*?permissions:\n      contents: write/u,
    );
    expect(vscodeReleaseWorkflow).not.toContain("id-token: write");
  });
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
    expect(checksWorkflow).toContain(
      'vscode-version: ["1.100.0", stable]',
    );
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
    const dryRunStep = releaseWorkflow.match(
      /      - name: Dry-run the exact publish command[\s\S]*?(?=\n      - (?:name:|uses:))/u,
    )?.[0];
    const productionPublishStep = releaseWorkflow.match(
      /      - name: Publish the verified core tarball with OIDC[\s\S]*?(?=\n      - name:)/u,
    )?.[0];

    expect(dryRunStep).toContain(
      '"release-artifacts/$TARBALL_FILENAME" \\',
    );
    expect(dryRunStep).toContain('--tag "$DIST_TAG" \\');
    expect(dryRunStep).toContain("--provenance \\");
    expect(dryRunStep).toContain("--no-git-checks \\");
    expect(dryRunStep).toContain("--dry-run");
    expect(productionPublishStep).toContain(
      '"$ARTIFACT_DIRECTORY/$TARBALL_FILENAME" \\',
    );
    expect(productionPublishStep).toContain('--tag "$DIST_TAG" \\');
    expect(productionPublishStep).toContain("--provenance \\");
    expect(productionPublishStep).toContain("--no-git-checks");
    expect(productionPublishStep).not.toContain("--dry-run");
    expect(releaseWorkflow).not.toMatch(/pnpm (?:-r|--recursive) publish/u);
    expect(releaseWorkflow.match(/pnpm publish/gu)).toHaveLength(2);
  });
});
