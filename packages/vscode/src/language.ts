export type SupportedWikitextLanguageId = "wikitext" | "mediawiki";

export function isSupportedLanguageId(
  languageId: string,
): languageId is SupportedWikitextLanguageId {
  return languageId === "wikitext" || languageId === "mediawiki";
}

export function isSupportedDocument(document: {
  languageId: string;
}): boolean {
  return isSupportedLanguageId(document.languageId);
}

