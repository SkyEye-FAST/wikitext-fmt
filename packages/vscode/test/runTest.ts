import { runTests } from "@vscode/test-electron";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

delete process.env.ELECTRON_RUN_AS_NODE;
delete process.env.VSCODE_IPC_HOOK_CLI;
delete process.env.VSCODE_IPC_HOOK;
process.env.DONT_PROMPT_WSL_INSTALL = "1";

await runTests({
  extensionDevelopmentPath: resolve(__dirname, "../.."),
  extensionTestsPath: resolve(__dirname, "suite/index.js"),
  launchArgs: ["--disable-extensions"],
});
