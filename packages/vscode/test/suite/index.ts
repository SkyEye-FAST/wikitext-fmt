import assert from "node:assert/strict";
import * as vscode from "vscode";

async function waitForExtensionActivation(): Promise<void> {
  const extension = vscode.extensions.getExtension(
    "skyeye-fast.wikitext-fmt-vscode",
  );
  assert.ok(extension, "extension should be discoverable by id");
  await extension.activate();

  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const commands = await vscode.commands.getCommands(true);
    if (commands.includes("wikitext-fmt.formatDocument")) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("wikitext-fmt.formatDocument was not registered");
}

export async function run(): Promise<void> {
  const document = await vscode.workspace.openTextDocument({
    content: "==Title==",
    language: "wikitext",
  });

  const editor = await vscode.window.showTextDocument(document);
  await waitForExtensionActivation();

  const commands = await vscode.commands.getCommands(true);
  assert.ok(
    commands.includes("wikitext-fmt.formatDocument"),
    "format command should be registered",
  );

  await vscode.commands.executeCommand("wikitext-fmt.formatDocument");

  assert.equal(editor.document.getText(), "== Title ==");
}
