declare module "vscode" {
  export interface Disposable {
    dispose(): unknown;
  }

  export interface ExtensionContext {
    subscriptions: Disposable[];
  }

  export interface TextLine {
    readonly text: string;
    readonly range: Range;
    readonly rangeIncludingLineBreak: Range;
    readonly firstNonWhitespaceCharacterIndex: number;
    readonly isEmptyOrWhitespace: boolean;
  }

  export interface TextDocument {
    readonly languageId: string;
    readonly lineCount: number;
    getText(range?: Range): string;
    lineAt(line: number): TextLine;
  }

  export interface TextEdit {
    readonly range: Range;
    readonly newText: string;
  }

  export namespace TextEdit {
    function replace(range: Range, newText: string): TextEdit;
  }

  export interface DocumentFormattingEditProvider {
    provideDocumentFormattingEdits(
      document: TextDocument,
    ): ProviderResult<TextEdit[]>;
  }

  export type ProviderResult<T> =
    | T
    | undefined
    | null
    | Thenable<T | undefined | null>;

  export interface Thenable<T> {
    then<TResult1 = T, TResult2 = never>(
      onfulfilled?:
        | ((value: T) => TResult1 | Thenable<TResult1>)
        | undefined
        | null,
      onrejected?:
        | ((reason: unknown) => TResult2 | Thenable<TResult2>)
        | undefined
        | null,
    ): Thenable<TResult1 | TResult2>;
  }

  export class Position {
    constructor(line: number, character: number);
    readonly line: number;
    readonly character: number;
  }

  export class Range {
    constructor(start: Position, end: Position);
    readonly start: Position;
    readonly end: Position;
  }

  export interface TextEditor {
    readonly document: TextDocument;
    edit(callback: (editBuilder: TextEditorEdit) => void): Thenable<boolean>;
  }

  export interface TextEditorEdit {
    replace(range: Range, value: string): void;
  }

  export namespace window {
    const activeTextEditor: TextEditor | undefined;
    function showWarningMessage(message: string): Thenable<string | undefined>;
  }

  export interface WorkspaceConfiguration {
    get<T>(section: string, defaultValue: T): T;
  }

  export namespace workspace {
    function getConfiguration(section?: string): WorkspaceConfiguration;
  }

  export type DocumentSelector =
    | ReadonlyArray<DocumentFilter>
    | DocumentFilter
    | string;

  export interface DocumentFilter {
    readonly language?: string;
    readonly scheme?: string;
    readonly pattern?: string;
  }

  export namespace languages {
    function registerDocumentFormattingEditProvider(
      selector: DocumentSelector,
      provider: DocumentFormattingEditProvider,
    ): Disposable;
  }

  export namespace commands {
    function registerCommand(
      command: string,
      callback: (...args: unknown[]) => unknown,
    ): Disposable;
  }
}
