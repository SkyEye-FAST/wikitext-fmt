import type { FormatDetailedResult, FormatResult } from "./formatter.js";
import type { FooterDiagnostics } from "./rules/categories.js";
import type { ExternalLinkDiagnostics } from "./rules/externalLinks.js";
import type { FileLinkDiagnostics } from "./rules/fileLinks.js";
import type { ReferenceDiagnostics } from "./rules/references.js";
import type { RedirectDiagnostics } from "./rules/redirects.js";
import type { SectionSpacingDiagnostics } from "./rules/sectionSpacing.js";
import type { TableDiagnostic } from "./rules/tables.js";
import type { TemplateParameterDiagnostics } from "./rules/templateParameters.js";

export interface DetailedDiagnostics {
  tableDiagnostics: TableDiagnostic[];
  footerDiagnostics: FooterDiagnostics;
  redirectDiagnostics: RedirectDiagnostics;
  fileLinkDiagnostics: FileLinkDiagnostics;
  externalLinkDiagnostics: ExternalLinkDiagnostics;
  referenceDiagnostics: ReferenceDiagnostics;
  sectionSpacingDiagnostics: SectionSpacingDiagnostics;
  templateParameterDiagnostics: TemplateParameterDiagnostics;
}

export function emptyDetailedDiagnostics(): DetailedDiagnostics {
  return {
    tableDiagnostics: [],
    footerDiagnostics: {
      behaviorSwitchesMoved: 0,
      behaviorSwitchesFormatted: 0,
      defaultsortMoved: 0,
      categoriesMoved: 0,
      localizedCategoryAliasesCanonicalized: 0,
      localizedDefaultsortAliasesCanonicalized: 0,
      localizedBehaviorSwitchesCanonicalized: 0,
      interlanguageLinksMoved: 0,
      interlanguageLinksFormatted: 0,
    },
    redirectDiagnostics: {
      redirectsFormatted: 0,
      localizedRedirectAliasesCanonicalized: 0,
    },
    fileLinkDiagnostics: {
      fileLinksFormatted: 0,
      localizedFileNamespaceAliasesCanonicalized: 0,
      localizedImageOptionsCanonicalized: 0,
    },
    externalLinkDiagnostics: {
      externalLinksFormatted: 0,
      externalLinksSkippedUnsafe: 0,
    },
    referenceDiagnostics: {
      referencesFormatted: 0,
      referenceGroupsFormatted: 0,
      referenceLinesSkippedUnsafe: 0,
    },
    sectionSpacingDiagnostics: {
      sectionSpacingBeforeHeadingsInserted: 0,
      sectionSpacingAfterHeadingsInserted: 0,
    },
    templateParameterDiagnostics: {
      templateParametersFormatted: 0,
      templateParameterLinesFormatted: 0,
      templateParameterLinesSkippedUnsafe: 0,
    },
  };
}

export function stripDiagnostics(result: FormatDetailedResult): FormatResult {
  const {
    tableDiagnostics: _tableDiagnostics,
    footerDiagnostics: _footerDiagnostics,
    redirectDiagnostics: _redirectDiagnostics,
    fileLinkDiagnostics: _fileLinkDiagnostics,
    externalLinkDiagnostics: _externalLinkDiagnostics,
    referenceDiagnostics: _referenceDiagnostics,
    sectionSpacingDiagnostics: _sectionSpacingDiagnostics,
    templateParameterDiagnostics: _templateParameterDiagnostics,
    ...stripped
  } = result;
  return stripped;
}

export function fallbackDetailedResult(
  source: string,
  warning: string,
  diagnostics: DetailedDiagnostics = emptyDetailedDiagnostics(),
): FormatDetailedResult {
  return {
    formatted: source,
    warning,
    ...diagnostics,
  };
}
