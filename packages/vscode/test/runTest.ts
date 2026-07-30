import { runTests } from "@vscode/test-electron";
import { resolve } from "node:path";

const packageRoot = resolve(__dirname, "../..");
const vscodeVersion = process.env.VSCODE_TEST_VERSION ?? "stable";

delete process.env.ELECTRON_RUN_AS_NODE;
delete process.env.VSCODE_IPC_HOOK_CLI;
delete process.env.VSCODE_IPC_HOOK;
process.env.DONT_PROMPT_WSL_INSTALL = "1";

async function main(): Promise<void> {
  await runTests({
    cachePath: resolve(packageRoot, ".vscode-test"),
    extensionDevelopmentPath: packageRoot,
    extensionTestsPath: resolve(__dirname, "suite/index.js"),
    launchArgs: ["--disable-extensions"],
    version: vscodeVersion,
  });
}

void main();
