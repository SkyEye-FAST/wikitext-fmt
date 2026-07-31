import * as vscode from "vscode";
import { TextDecoder } from "node:util";
import {
  buildEditorConfigLoadOptions,
  getEditorDocumentFormattingResult,
  resolveEditorSettings,
  type EditorDocumentFormattingResult,
  type EditorSettingsResolution,
} from "./format.js";
import { isSupportedDocument } from "./language.js";
import {
  renderDocumentReport,
  renderResolvedConfigurationReport,
} from "./report.js";

const SHOW_DETAILS = "Show Details";
const PREVIEW_SCHEME = "wikitext-fmt-preview";

let outputChannel: vscode.OutputChannel;
let lastReport: string | undefined;

export interface ExtensionTestApi {
  getLastReport(): string | undefined;
}

class PreviewContentProvider implements vscode.TextDocumentContentProvider {
  private readonly contents = new Map<string, string>();
  private readonly insertionOrder: string[] = [];
  private sequence = 0;

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.toString()) ?? "";
  }

  create(document: vscode.TextDocument, content: string): vscode.Uri {
    const filename =
      document.uri.path.split("/").filter(Boolean).at(-1) ?? "preview.wiki";
    const uri = vscode.Uri.from({
      scheme: PREVIEW_SCHEME,
      path: `/${++this.sequence}/${filename}`,
    });
    const key = uri.toString();
    this.contents.set(key, content);
    this.insertionOrder.push(key);
    if (this.insertionOrder.length > 20) {
      const oldest = this.insertionOrder.shift();
      if (oldest) this.contents.delete(oldest);
    }
    return uri;
  }
}

async function getSettings(
  document: vscode.TextDocument,
): Promise<EditorSettingsResolution> {
  const config = vscode.workspace.getConfiguration("wikitextFmt", document.uri);
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  const configOptions = buildEditorConfigLoadOptions(config);

  return resolveEditorSettings(config, {
    ...configOptions,
    documentPath:
      document.uri.scheme === "file" ? document.uri.fsPath : undefined,
    workspaceFolderPath: workspaceFolder?.uri.fsPath,
  });
}

async function analyzeDocument(
  document: vscode.TextDocument,
): Promise<EditorDocumentFormattingResult> {
  const resolution = await getSettings(document);
  const source = await sourceForAnalysis(document);
  return getEditorDocumentFormattingResult(source, resolution);
}

function normalizeForDocumentModel(
  source: string,
  lineEnding: vscode.EndOfLine,
): string {
  const eol = lineEnding === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
  return source.replace(/\r\n|\r|\n/gu, eol);
}

async function sourceForAnalysis(
  document: vscode.TextDocument,
): Promise<string> {
  const modelSource = document.getText();
  if (document.uri.scheme !== "file" || document.isDirty) return modelSource;

  try {
    const bytes = await vscode.workspace.fs.readFile(document.uri);
    const diskSource = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return normalizeForDocumentModel(diskSource, document.eol) === modelSource
      ? diskSource
      : modelSource;
  } catch {
    return modelSource;
  }
}

function writeOutput(content: string, reveal: boolean): void {
  outputChannel.clear();
  outputChannel.appendLine(content);
  if (reveal) outputChannel.show(true);
}

function rememberDocumentReport(
  document: vscode.TextDocument,
  result: EditorDocumentFormattingResult,
  reveal = false,
): void {
  lastReport = renderDocumentReport({
    uri: document.uri.toString(),
    languageId: document.languageId,
    result,
  });
  writeOutput(lastReport, reveal);
}

function resultWarning(result: EditorDocumentFormattingResult): string | undefined {
  if (result.kind === "settings-warning" || result.kind === "warning") {
    return result.warning;
  }
  if (result.kind === "failed") return result.failure.message;
  return undefined;
}

async function showWarningWithDetails(message: string): Promise<void> {
  const action = await vscode.window.showWarningMessage(
    `wikitext-fmt: ${message}`,
    SHOW_DETAILS,
  );
  if (action === SHOW_DETAILS) outputChannel.show(true);
}

function activeSupportedEditor(): vscode.TextEditor | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showInformationMessage(
      "Wikitext Formatter: no active document.",
    );
    return undefined;
  }
  if (!isSupportedDocument(editor.document)) {
    void vscode.window.showInformationMessage(
      "Wikitext Formatter commands only support wikitext and mediawiki documents.",
    );
    return undefined;
  }
  return editor;
}

export function fullDocumentRange(document: vscode.TextDocument): vscode.Range {
  if (document.lineCount === 0) {
    return new vscode.Range(
      new vscode.Position(0, 0),
      new vscode.Position(0, 0),
    );
  }

  return new vscode.Range(
    new vscode.Position(0, 0),
    document.lineAt(document.lineCount - 1).rangeIncludingLineBreak.end,
  );
}

async function formatDocument(
  document: vscode.TextDocument,
): Promise<vscode.TextEdit[]> {
  if (!isSupportedDocument(document)) return [];

  const result = await analyzeDocument(document);
  rememberDocumentReport(document, result);
  const warning = resultWarning(result);
  if (warning) {
    void showWarningWithDetails(warning);
    return [];
  }
  if (result.kind !== "changed") return [];

  return [
    vscode.TextEdit.replace(fullDocumentRange(document), result.formatted),
  ];
}

async function checkDocument(document: vscode.TextDocument): Promise<void> {
  const result = await analyzeDocument(document);
  rememberDocumentReport(document, result, true);
  const warning = resultWarning(result);
  if (warning) void showWarningWithDetails(warning);
}

async function previewDocument(
  document: vscode.TextDocument,
  previewProvider: PreviewContentProvider,
): Promise<void> {
  const result = await analyzeDocument(document);
  rememberDocumentReport(document, result);
  const warning = resultWarning(result);
  if (warning) {
    void showWarningWithDetails(warning);
    return;
  }
  if (result.kind !== "changed") {
    void vscode.window.showInformationMessage(
      "Wikitext Formatter: the document is already formatted.",
    );
    return;
  }

  const previewUri = previewProvider.create(document, result.formatted);
  await vscode.commands.executeCommand(
    "vscode.diff",
    document.uri,
    previewUri,
    `Wikitext Formatter Preview: ${document.fileName}`,
    { preview: true },
  );
}

async function showResolvedConfiguration(
  document: vscode.TextDocument,
): Promise<void> {
  const resolution = await getSettings(document);
  const report = renderResolvedConfigurationReport(
    document.uri.toString(),
    resolution,
  );
  writeOutput(report, true);
  if (resolution.kind === "warning") {
    void showWarningWithDetails(resolution.warning);
  }
}

async function openConfiguration(document: vscode.TextDocument): Promise<void> {
  const resolution = await getSettings(document);
  if (resolution.kind === "warning") {
    writeOutput(
      renderResolvedConfigurationReport(document.uri.toString(), resolution),
      false,
    );
    void showWarningWithDetails(resolution.warning);
  }
  if (!resolution.configPath) {
    if (resolution.kind !== "warning") {
      void vscode.window.showInformationMessage(
        "Wikitext Formatter: this document does not use a configuration file.",
      );
    }
    return;
  }
  const configDocument = await vscode.workspace.openTextDocument(
    vscode.Uri.file(resolution.configPath),
  );
  await vscode.window.showTextDocument(configDocument);
}

export function activate(
  context: vscode.ExtensionContext,
): ExtensionTestApi | undefined {
  outputChannel = vscode.window.createOutputChannel("Wikitext Formatter");
  const previewProvider = new PreviewContentProvider();
  const provider: vscode.DocumentFormattingEditProvider = {
    provideDocumentFormattingEdits(document) {
      return formatDocument(document);
    },
  };

  context.subscriptions.push(
    outputChannel,
    vscode.workspace.registerTextDocumentContentProvider(
      PREVIEW_SCHEME,
      previewProvider,
    ),
    vscode.languages.registerDocumentFormattingEditProvider(
      { language: "wikitext" },
      provider,
    ),
    vscode.languages.registerDocumentFormattingEditProvider(
      { language: "mediawiki" },
      provider,
    ),
    vscode.commands.registerCommand("wikitext-fmt.formatDocument", async () => {
      const editor = activeSupportedEditor();
      if (!editor) return;
      const edits = await formatDocument(editor.document);
      if (edits.length === 0) return;

      await editor.edit((editBuilder) => {
        for (const edit of edits) {
          editBuilder.replace(edit.range, edit.newText);
        }
      });
    }),
    vscode.commands.registerCommand("wikitext-fmt.checkDocument", async () => {
      const editor = activeSupportedEditor();
      if (editor) await checkDocument(editor.document);
    }),
    vscode.commands.registerCommand(
      "wikitext-fmt.previewDocument",
      async () => {
        const editor = activeSupportedEditor();
        if (editor) await previewDocument(editor.document, previewProvider);
      },
    ),
    vscode.commands.registerCommand("wikitext-fmt.showLastReport", () => {
      if (!lastReport) {
        void vscode.window.showInformationMessage(
          "Wikitext Formatter: no report is available yet.",
        );
        return;
      }
      writeOutput(lastReport, true);
    }),
    vscode.commands.registerCommand(
      "wikitext-fmt.showResolvedConfiguration",
      async () => {
        const editor = activeSupportedEditor();
        if (editor) await showResolvedConfiguration(editor.document);
      },
    ),
    vscode.commands.registerCommand(
      "wikitext-fmt.openConfiguration",
      async () => {
        const editor = activeSupportedEditor();
        if (editor) await openConfiguration(editor.document);
      },
    ),
  );

  return process.env.WIKITEXT_FMT_EXTENSION_TEST === "1"
    ? { getLastReport: () => lastReport }
    : undefined;
}

export function deactivate(): void {}
