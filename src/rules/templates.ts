import type { Config } from "wikiparser-node";
import {
  createParserContext,
  type ParsedDocumentContext,
} from "../parserContext.js";

interface Replacement {
  start: number;
  end: number;
  value: string;
}

const RISKY =
  /(?:\uE000wikitext-fmt:|\{\||\|-|\|\}|<\/?(?:ref|gallery|nowiki)\b|\{\{|\}\}|<[^>]*$)/iu;

export function formatTemplates(
  source: string,
  config: Config,
  lineWidth: number,
  context?: ParsedDocumentContext,
): string {
  const root =
    context?.source === source
      ? context.root
      : createParserContext(source, config).root;
  const replacements: Replacement[] = [];

  for (const node of root.querySelectorAll("template")) {
    if (node.parentNode?.closest("template")) continue;
    const raw = node.toString();
    if (
      raw.includes("\n") ||
      !raw.startsWith("{{") ||
      !raw.endsWith("}}") ||
      RISKY.test(raw.slice(2, -2))
    ) {
      continue;
    }

    const args = node.getAllArgs();
    if (
      args.length === 0 ||
      args.some((arg) => RISKY.test(arg.value) || arg.value.includes("\n"))
    ) {
      continue;
    }

    const firstPipe = raw.indexOf("|");
    if (firstPipe < 0) continue;
    const name = raw.slice(2, firstPipe).trim();
    if (!name || name.startsWith("#")) continue;

    const lines = [`{{${name}`];
    let safe = true;
    for (const arg of args) {
      if (arg.anon) {
        const value = arg.toString().trim();
        if (!value) {
          safe = false;
          break;
        }
        lines.push(`| ${value}`);
      } else {
        const key = arg.firstChild.toString().trim();
        const value = arg.lastChild.toString().trim();
        if (!key) {
          safe = false;
          break;
        }
        lines.push(`| ${key} = ${value}`);
      }
    }
    lines.push("}}");
    if (!safe || lines.some((line) => line.length > lineWidth)) continue;

    const start = node.getAbsoluteIndex();
    replacements.push({
      start,
      end: start + raw.length,
      value: lines.join("\n"),
    });
  }

  let output = source;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    output =
      output.slice(0, replacement.start) +
      replacement.value +
      output.slice(replacement.end);
  }
  return output;
}
