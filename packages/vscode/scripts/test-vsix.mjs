import {
  downloadAndUnzipVSCode,
  resolveCliArgsFromVSCodeExecutablePath,
  resolveCliPathFromVSCodeExecutablePath,
  runTests,
} from "@vscode/test-electron";
import { spawn } from "node:child_process";
import { access, mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
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
    .filter((entry) => /^wikitext-formatter-.*\.vsix$/.test(entry))
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

function stripCliOption(args, option) {
  const stripped = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === option) {
      index += 1;
      continue;
    }
    if (args[index]?.startsWith(`${option}=`)) {
      continue;
    }
    stripped.push(args[index]);
  }
  return stripped;
}

async function installVsix(vscodeExecutablePath, vsix, extensionsDir) {
  const [cli, ...profileArgs] =
    resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);
  if (!cli) {
    throw new Error("Could not resolve VS Code CLI path");
  }
  const installProfileArgs = stripCliOption(profileArgs, "--extensions-dir");

  const child = spawn(
    cli,
    [
      ...installProfileArgs,
      "--extensions-dir",
      extensionsDir,
      "--install-extension",
      vsix,
      "--force",
    ],
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
const extensionsDir = await mkdtemp(
  resolve(tmpdir(), "wikitext-formatter-ext-"),
);
await installVsix(vscodeExecutablePath, vsix, extensionsDir);

await runTests({
  extensionTestsPath: resolve(packageRoot, "dist-test/test/suite/index.js"),
  launchArgs: ["--extensions-dir", extensionsDir],
  vscodeExecutablePath: resolveCliPathFromVSCodeExecutablePath(
    vscodeExecutablePath,
  ).replace(/\/bin\/code$/, "/code"),
});
