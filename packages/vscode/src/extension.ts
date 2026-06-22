import * as vscode from "vscode";
import { buildEditorSettings, getEditorFormattingResult } from "./format.js";

function getSettings() {
  return buildEditorSettings(vscode.workspace.getConfiguration("wikitextFmt"));
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

function formatDocument(document: vscode.TextDocument): vscode.TextEdit[] {
  const source = document.getText();
  const result = getEditorFormattingResult(source, getSettings());

  if (result.kind === "warning") {
    void vscode.window.showWarningMessage(`wikitext-fmt: ${result.warning}`);
    return [];
  }

  if (result.kind === "unchanged") {
    return [];
  }

  return [
    vscode.TextEdit.replace(fullDocumentRange(document), result.formatted),
  ];
}

export function activate(context: vscode.ExtensionContext): void {
  const provider: vscode.DocumentFormattingEditProvider = {
    provideDocumentFormattingEdits(document) {
      return formatDocument(document);
    },
  };

  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(
      { language: "wikitext" },
      provider,
    ),
    vscode.languages.registerDocumentFormattingEditProvider(
      { language: "mediawiki" },
      provider,
    ),
    vscode.commands.registerCommand("wikitext-fmt.formatDocument", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const edits = formatDocument(editor.document);
      if (edits.length === 0) {
        return;
      }

      await editor.edit((editBuilder) => {
        for (const edit of edits) {
          editBuilder.replace(edit.range, edit.newText);
        }
      });
    }),
  );
}

export function deactivate(): void {}
