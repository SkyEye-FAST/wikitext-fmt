import {
  downloadAndUnzipVSCode,
  resolveCliArgsFromVSCodeExecutablePath,
  resolveCliPathFromVSCodeExecutablePath,
  runTests,
} from "@vscode/test-electron";
import { spawn } from "node:child_process";
import { access, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");

delete process.env.ELECTRON_RUN_AS_NODE;
delete process.env.VSCODE_IPC_HOOK_CLI;
delete process.env.VSCODE_IPC_HOOK;
process.env.DONT_PROMPT_WSL_INSTALL = "1";

async function findVsix() {
  const entries = await readdir(packageRoot);
  const candidates = entries
    .filter((entry) => /^wikitext-fmt-vscode-.*\.vsix$/.test(entry))
    .sort();
  const latest = candidates.at(-1);
  if (!latest) {
    throw new Error("Packaged VSIX was not found");
  }
  return resolve(packageRoot, latest);
}

async function assertCopiedRuntimeAssetsExist() {
  await access(resolve(packageRoot, "dist/extension.js"));
  await access(
    resolve(packageRoot, "dist/node_modules/wikiparser-node/package.json"),
  );
  await access(
    resolve(
      packageRoot,
      "dist/node_modules/wikiparser-node/config/default.json",
    ),
  );
}

async function waitForProcess(child, description, timeoutMs = 30_000) {
  const timeout = setTimeout(() => {
    child.kill("SIGTERM");
  }, timeoutMs);

  try {
    await new Promise((resolvePromise, reject) => {
      child.on("error", reject);
      child.on("exit", (code, signal) => {
        if (code === 0) {
          resolvePromise();
          return;
        }
        reject(
          new Error(
            `${description} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}`,
          ),
        );
      });
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function installVsix(vscodeExecutablePath, vsix) {
  const [cli, ...profileArgs] =
    resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);
  if (!cli) {
    throw new Error("Could not resolve VS Code CLI path");
  }

  const child = spawn(
    cli,
    [...profileArgs, "--install-extension", vsix, "--force"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: undefined,
        VSCODE_IPC_HOOK_CLI: undefined,
        VSCODE_IPC_HOOK: undefined,
        DONT_PROMPT_WSL_INSTALL: "1",
      },
    },
  );

  await waitForProcess(child, "VSIX install");
}

await assertCopiedRuntimeAssetsExist();

const vsix = await findVsix();
const vscodeExecutablePath = await downloadAndUnzipVSCode();
await installVsix(vscodeExecutablePath, vsix);

await runTests({
  extensionTestsPath: resolve(packageRoot, "dist-test/test/suite/index.js"),
  launchArgs: [],
  vscodeExecutablePath: resolveCliPathFromVSCodeExecutablePath(
    vscodeExecutablePath,
  ).replace(/\/bin\/code$/, "/code"),
});
