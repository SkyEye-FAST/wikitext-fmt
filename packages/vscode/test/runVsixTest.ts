import {
  downloadAndUnzipVSCode,
  resolveCliArgsFromVSCodeExecutablePath,
  resolveCliPathFromVSCodeExecutablePath,
  runTests,
} from "@vscode/test-electron";
import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "../..");

delete process.env.ELECTRON_RUN_AS_NODE;
delete process.env.VSCODE_IPC_HOOK_CLI;
delete process.env.VSCODE_IPC_HOOK;
process.env.DONT_PROMPT_WSL_INSTALL = "1";

async function findVsix(): Promise<string> {
  const entries = await readdir(packageRoot);
  const candidates = entries
    .filter((entry) => /^wikitext-fmt-vscode-.*\.vsix$/.test(entry))
    .sort();
  const latest = candidates.at(-1);
  if (!latest) throw new Error("Packaged VSIX was not found");
  return resolve(packageRoot, latest);
}

const vsix = await findVsix();
const vscodeExecutablePath = await downloadAndUnzipVSCode();

async function installVsix(): Promise<void> {
  const [cli, ...profileArgs] =
    resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);
  if (!cli) throw new Error("Could not resolve VS Code CLI path");
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

  const timeout = setTimeout(() => {
    child.kill("SIGTERM");
  }, 30_000);

  try {
    await new Promise<void>((resolvePromise, reject) => {
      child.on("error", reject);
      child.on("exit", (code, signal) => {
        if (code === 0) {
          resolvePromise();
          return;
        }
        reject(
          new Error(
            `VSIX install failed with ${signal ? `signal ${signal}` : `exit code ${code}`}`,
          ),
        );
      });
    });
  } finally {
    clearTimeout(timeout);
  }
}

await installVsix();

await runTests({
  extensionTestsPath: resolve(__dirname, "suite/index.js"),
  launchArgs: [],
  // Force @vscode/test-electron to use the downloaded desktop executable, not
  // a remote CLI wrapper from this environment. The current type definition
  // requires extensionDevelopmentPath even though installed-extension smoke
  // tests intentionally do not use one.
  vscodeExecutablePath: resolveCliPathFromVSCodeExecutablePath(
    vscodeExecutablePath,
  ).replace(/\/bin\/code$/, "/code"),
} as unknown as Parameters<typeof runTests>[0]);
