import type { Config } from "wikiparser-node";

import type {
  DocumentFingerprint,
  StructuralEquivalenceKind,
  StructuralEquivalenceResult,
} from "./equivalenceCore.js";
import {
  documentStructuralFingerprint as documentStructuralFingerprintWithRuntime,
  tableStructuralFingerprint as tableStructuralFingerprintWithRuntime,
  templateStructuralFingerprint as templateStructuralFingerprintWithRuntime,
  templateTokenStructuralFingerprint,
  verifyStructuralEquivalence as verifyStructuralEquivalenceWithRuntime,
} from "./equivalenceCore.js";
import type { ResolvedFormatOptions } from "./options.js";
import { nodeParserRuntime } from "./parser.node.js";

export type {
  StructuralEquivalenceKind,
  StructuralEquivalenceResult,
} from "./equivalenceCore.js";

export { templateTokenStructuralFingerprint };

export function templateStructuralFingerprint(
  source: string,
  config: Config,
): string {
  return templateStructuralFingerprintWithRuntime(
    source,
    config,
    nodeParserRuntime,
  );
}

export function tableStructuralFingerprint(
  source: string,
  config: Config,
): string {
  return tableStructuralFingerprintWithRuntime(
    source,
    config,
    nodeParserRuntime,
  );
}

export function documentStructuralFingerprint(
  source: string,
  config: Config,
  options: ResolvedFormatOptions,
): DocumentFingerprint {
  return documentStructuralFingerprintWithRuntime(
    source,
    config,
    options,
    nodeParserRuntime,
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
    config,
    structure,
    nodeParserRuntime,
    options,
  );
}
