import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as vscode from "vscode";

const expectedCommands = [
  "wikitext-fmt.formatDocument",
  "wikitext-fmt.checkDocument",
  "wikitext-fmt.previewDocument",
  "wikitext-fmt.showLastReport",
  "wikitext-fmt.showResolvedConfiguration",
  "wikitext-fmt.openConfiguration",
] as const;

async function waitForExtensionActivation(): Promise<void> {
  const extension = vscode.extensions.getExtension(
    "skyeyefast.wikitext-formatter",
  );
  assert.ok(extension, "extension should be discoverable by id");
  await extension.activate();

  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const commands = await vscode.commands.getCommands(true);
    if (expectedCommands.every((command) => commands.includes(command))) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("wikitext-fmt commands were not registered");
}

export async function run(): Promise<void> {
  const document = await vscode.workspace.openTextDocument({
    content: "==Title==",
    language: "wikitext",
  });

  const editor = await vscode.window.showTextDocument(document);
  await waitForExtensionActivation();

  const commands = await vscode.commands.getCommands(true);
  for (const command of expectedCommands) {
    assert.ok(commands.includes(command), `${command} should be registered`);
  }

  await vscode.commands.executeCommand("wikitext-fmt.checkDocument");
  assert.equal(
    editor.document.getText(),
    "==Title==",
    "checkDocument must not edit the document",
  );

  await vscode.commands.executeCommand("wikitext-fmt.previewDocument");
  assert.equal(
    document.getText(),
    "==Title==",
    "previewDocument must not edit the source document",
  );
  await vscode.window.showTextDocument(document);

  await vscode.commands.executeCommand(
    "wikitext-fmt.showResolvedConfiguration",
  );
  assert.equal(
    document.getText(),
    "==Title==",
    "configuration inspection must not edit the document",
  );
  await vscode.commands.executeCommand("wikitext-fmt.showLastReport");

  await vscode.commands.executeCommand("wikitext-fmt.formatDocument");

  assert.equal(editor.document.getText(), "== Title ==");

  const unsupportedDocument = await vscode.workspace.openTextDocument({
    content: "==Title==",
    language: "plaintext",
  });
  const unsupportedEditor =
    await vscode.window.showTextDocument(unsupportedDocument);
  for (const command of [
    "wikitext-fmt.formatDocument",
    "wikitext-fmt.checkDocument",
    "wikitext-fmt.previewDocument",
    "wikitext-fmt.showResolvedConfiguration",
    "wikitext-fmt.openConfiguration",
  ]) {
    await vscode.commands.executeCommand(command);
    assert.equal(
      unsupportedEditor.document.getText(),
      "==Title==",
      `${command} must not edit unsupported languages`,
    );
    assert.equal(
      vscode.window.activeTextEditor?.document.uri.toString(),
      unsupportedDocument.uri.toString(),
      `${command} must not replace the active unsupported document`,
    );
  }

  const root = await mkdtemp(join(tmpdir(), "wikitext-formatter-host-"));
  const configPath = join(root, ".wikitextfmtrc");
  await writeFile(
    configPath,
    JSON.stringify({ htmlVoidTagStyle: "xhtml" }),
  );
  await writeFile(join(root, "config-page.wiki"), "<br>");

  const configuredDocument = await vscode.workspace.openTextDocument(
    vscode.Uri.file(join(root, "config-page.wiki")),
  );
  const configuredEditor =
    await vscode.window.showTextDocument(configuredDocument);

  await vscode.commands.executeCommand("wikitext-fmt.formatDocument");

  assert.equal(configuredEditor.document.getText(), "<br />");

  await vscode.commands.executeCommand("wikitext-fmt.openConfiguration");
  assert.equal(
    vscode.window.activeTextEditor?.document.uri.fsPath,
    configPath,
    "openConfiguration should open the active config file",
  );

  const invalidRoot = await mkdtemp(
    join(tmpdir(), "wikitext-formatter-invalid-host-"),
  );
  await writeFile(
    join(invalidRoot, ".wikitextfmtrc"),
    JSON.stringify({ unknownOption: true }),
  );
  await writeFile(join(invalidRoot, "invalid-config-page.wiki"), "==Title==");
  const invalidDocument = await vscode.workspace.openTextDocument(
    vscode.Uri.file(join(invalidRoot, "invalid-config-page.wiki")),
  );
  const invalidEditor = await vscode.window.showTextDocument(invalidDocument);

  await vscode.commands.executeCommand("wikitext-fmt.formatDocument");
  assert.equal(
    invalidEditor.document.getText(),
    "==Title==",
    "invalid configuration must fail closed without an edit",
  );
}
