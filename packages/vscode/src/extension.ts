import * as vscode from "vscode";
import {
  formatWikitext,
  formatWikitextSafe,
  type FormatLevel,
  type FormatOptions,
  type HtmlVoidTagStyle,
} from "wikitext-fmt";

interface ExtensionSettings {
  safe: boolean;
  options: FormatOptions;
}

function getSettings(): ExtensionSettings {
  const config = vscode.workspace.getConfiguration("wikitextFmt");

  return {
    safe: config.get<boolean>("safe", true),
    options: {
      level: config.get<FormatLevel>("level", "normal"),
      htmlVoidTagStyle: config.get<HtmlVoidTagStyle>(
        "htmlVoidTagStyle",
        "html5",
      ),
      formatTables: config.get<boolean>("formatTables", false),
      formatReferences: config.get<boolean>("formatReferences", false),
      formatSectionSpacing: config.get<boolean>("formatSectionSpacing", false),
      formatTemplateParameters: config.get<boolean>(
        "formatTemplateParameters",
        false,
      ),
    },
  };
}

function fullDocumentRange(document: vscode.TextDocument): vscode.Range {
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
  const settings = getSettings();
  const result = settings.safe
    ? formatWikitextSafe(source, settings.options)
    : {
        formatted: formatWikitext(source, settings.options),
        warning: undefined,
      };

  if (result.warning) {
    void vscode.window.showWarningMessage(`wikitext-fmt: ${result.warning}`);
    return [];
  }

  if (result.formatted === source) {
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
