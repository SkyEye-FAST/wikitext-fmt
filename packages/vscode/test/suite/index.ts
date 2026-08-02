import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
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
  "wikitext-fmt.refreshSiteConfiguration",
  "wikitext-fmt.generateSiteParserConfig",
  "wikitext-fmt.checkSiteParserConfig",
] as const;

interface ExtensionTestApi {
  getLastReport(): string | undefined;
}

interface DocumentReport {
  status: string;
  changed: boolean;
  failure: {
    code: string;
    stage: string | null;
  } | null;
  warning: string | null;
}

async function waitForExtensionActivation(): Promise<ExtensionTestApi> {
  const extension = vscode.extensions.getExtension(
    "skyeyefast.wikitext-formatter",
  );
  assert.ok(extension, "extension should be discoverable by id");
  const api = (await extension.activate()) as ExtensionTestApi | undefined;
  assert.ok(
    api && typeof api.getLastReport === "function",
    "extension should expose its report in the extension test environment",
  );

  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const commands = await vscode.commands.getCommands(true);
    if (expectedCommands.every((command) => commands.includes(command))) {
      return api;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("wikitext-fmt commands were not registered");
}

function getLastDocumentReport(api: ExtensionTestApi): DocumentReport {
  const report = api.getLastReport();
  assert.ok(report, "a document report should be available");
  return JSON.parse(report) as DocumentReport;
}

function assertRuntimeLocaleBundle(): void {
  const language = vscode.env.language.toLowerCase();
  const details = vscode.l10n.t("Show Details");
  if (language.startsWith("zh-cn")) {
    assert.equal(details, "显示详细信息");
  } else if (language.startsWith("zh-tw")) {
    assert.equal(details, "顯示詳細資料");
  } else {
    assert.equal(details, "Show Details");
  }
}

function assertOnlyCrlf(source: string, label: string): void {
  assert.doesNotMatch(source, /(^|[^\r])\n/u, `${label} contains isolated LF`);
  assert.doesNotMatch(source, /\r(?!\n)/u, `${label} contains bare CR`);
  assert.doesNotMatch(source, /\r\r\n/u, `${label} contains CRCRLF`);
}

async function openFileDocument(
  root: string,
  filename: string,
  source: string,
): Promise<{ document: vscode.TextDocument; editor: vscode.TextEditor; path: string }> {
  const path = join(root, filename);
  await writeFile(path, source, "utf8");
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(path));
  const editor = await vscode.window.showTextDocument(document);
  return { document, editor, path };
}

export async function run(): Promise<void> {
  const document = await vscode.workspace.openTextDocument({
    content: "==Title==",
    language: "wikitext",
  });

  const editor = await vscode.window.showTextDocument(document);
  const extensionApi = await waitForExtensionActivation();
  assertRuntimeLocaleBundle();

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
  const checkReport = getLastDocumentReport(extensionApi);
  assert.equal(checkReport.status, "changed");
  assert.equal(checkReport.changed, true);

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

  const crlfInput = "==Title==\r\n:item\r\n";
  const crlfExpected = "== Title ==\r\n: item\r\n";
  const crlf = await openFileDocument(
    root,
    "crlf-page.wiki",
    crlfInput,
  );
  assert.equal(crlf.document.eol, vscode.EndOfLine.CRLF);

  await vscode.commands.executeCommand("wikitext-fmt.checkDocument");
  assert.equal(
    crlf.document.getText(),
    crlfInput,
    "checkDocument must not edit a CRLF document",
  );
  assert.equal(await readFile(crlf.path, "utf8"), crlfInput);
  const crlfCheckReport = getLastDocumentReport(extensionApi);
  assert.equal(crlfCheckReport.status, "changed");
  assert.equal(crlfCheckReport.changed, true);
  assert.equal(crlfCheckReport.failure, null);
  assert.equal(crlfCheckReport.warning, null);

  const previewsBefore = new Set(
    vscode.workspace.textDocuments
      .filter(({ uri }) => uri.scheme === "wikitext-fmt-preview")
      .map(({ uri }) => uri.toString()),
  );
  await vscode.commands.executeCommand("wikitext-fmt.previewDocument");
  const preview = vscode.workspace.textDocuments.find(
    ({ uri }) =>
      uri.scheme === "wikitext-fmt-preview" &&
      !previewsBefore.has(uri.toString()),
  );
  assert.ok(preview, "previewDocument should open a new preview document");
  assert.equal(preview.getText(), crlfExpected);
  assert.equal(preview.eol, vscode.EndOfLine.CRLF);
  assert.equal(
    crlf.document.getText(),
    crlfInput,
    "previewDocument must not edit a CRLF source document",
  );
  assert.equal(await readFile(crlf.path, "utf8"), crlfInput);
  const crlfPreviewReport = getLastDocumentReport(extensionApi);
  assert.equal(crlfPreviewReport.status, "changed");
  assert.equal(crlfPreviewReport.changed, true);
  assert.equal(crlfPreviewReport.failure, null);

  await vscode.window.showTextDocument(crlf.document);
  await vscode.commands.executeCommand("wikitext-fmt.formatDocument");
  assert.equal(crlf.editor.document.getText(), crlfExpected);
  assert.equal(crlf.document.eol, vscode.EndOfLine.CRLF);
  assert.equal(await crlf.document.save(), true);
  const savedCrlf = await readFile(crlf.path, "utf8");
  assert.equal(savedCrlf, crlfExpected);
  assertOnlyCrlf(savedCrlf, "saved CRLF document");

  for (const [filename, unsupportedSource] of [
    ["mixed-eol-page.wiki", "==Title==\r\n:item\n"],
    ["bare-cr-page.wiki", "==Title==\r:item\r"],
  ] as const) {
    const unsupported = await openFileDocument(
      root,
      filename,
      unsupportedSource,
    );
    const modelBefore = unsupported.document.getText();
    const bytesBefore = await readFile(unsupported.path, "utf8");

    await vscode.commands.executeCommand("wikitext-fmt.formatDocument");

    const report = getLastDocumentReport(extensionApi);
    assert.equal(report.status, "failed");
    assert.equal(report.changed, false);
    assert.equal(report.failure?.code, "unsupported-line-endings");
    assert.equal(report.failure?.stage, "input-normalization");
    assert.match(report.warning ?? "", /unsupported/u);
    assert.equal(
      unsupported.document.getText(),
      modelBefore,
      `${filename} must not receive a TextEdit`,
    );
    assert.equal(
      unsupported.document.isDirty,
      false,
      `${filename} must remain unmodified`,
    );
    assert.equal(
      await readFile(unsupported.path, "utf8"),
      bytesBefore,
      `${filename} must remain byte-for-byte unchanged`,
    );
  }

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
