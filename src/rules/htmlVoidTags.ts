import type { HtmlVoidTagStyle } from "../options.js";

const XHTML_VOID_TAG = /<(br|hr|wbr)[ \t]*\/[ \t]*>/giu;
const SIMPLE_VOID_TAG = /<(br|hr|wbr)[ \t]*(?:\/[ \t]*)?>/giu;

export function formatHtmlVoidTags(
  source: string,
  style: HtmlVoidTagStyle,
): string {
  if (style === "preserve") return source;
  if (style === "html5") {
    return source.replace(XHTML_VOID_TAG, (_, tag: string) => `<${tag}>`);
  }
  return source.replace(SIMPLE_VOID_TAG, (_, tag: string) => `<${tag} />`);
}
