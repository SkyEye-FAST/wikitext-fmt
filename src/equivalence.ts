import type { Config } from "wikiparser-node";

import type {
  DocumentFingerprint,
  StructuralEquivalenceKind,
  StructuralEquivalenceResult,
} from "./equivalenceEngine.js";
import {
  documentStructuralFingerprint as documentStructuralFingerprintWithRuntime,
  tableStructuralFingerprint as tableStructuralFingerprintWithRuntime,
  templateStructuralFingerprint as templateStructuralFingerprintWithRuntime,
  templateTokenStructuralFingerprint,
  verifyStructuralEquivalence as verifyStructuralEquivalenceWithRuntime,
} from "./equivalenceEngine.js";
import type { ResolvedFormatOptions } from "./options.js";
import { createNodeParserSession } from "./parser.node.js";
import { parserConfigWithInterwikiPrefixes } from "./parserRuntime.js";

export type {
  StructuralEquivalenceKind,
  StructuralEquivalenceResult,
} from "./equivalenceEngine.js";

export { templateTokenStructuralFingerprint };

export function templateStructuralFingerprint(
  source: string,
  config: Config,
): string {
  return templateStructuralFingerprintWithRuntime(
    source,
    createNodeParserSession(config),
  );
}

export function tableStructuralFingerprint(
  source: string,
  config: Config,
): string {
  return tableStructuralFingerprintWithRuntime(
    source,
    createNodeParserSession(config),
  );
}

export function documentStructuralFingerprint(
  source: string,
  config: Config,
  options: ResolvedFormatOptions,
): DocumentFingerprint {
  return documentStructuralFingerprintWithRuntime(
    source,
    options,
    createNodeParserSession(
      parserConfigWithInterwikiPrefixes(
        config,
        options.interlanguagePrefixes,
      ),
    ),
  );
}

export function verifyStructuralEquivalence(
  before: string,
  after: string,
  config: Config,
  structure: StructuralEquivalenceKind,
  options?: ResolvedFormatOptions,
): StructuralEquivalenceResult {
  return verifyStructuralEquivalenceWithRuntime(
    before,
    after,
    structure,
    createNodeParserSession(
      parserConfigWithInterwikiPrefixes(
        config,
        options?.interlanguagePrefixes,
      ),
    ),
    options,
  );
}
