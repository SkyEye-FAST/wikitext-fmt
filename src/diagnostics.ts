import type { StructuralEquivalenceResult } from "./equivalence.js";
import type {
  FormatDetailedResult,
  FormatFailure,
  FormatResult,
} from "./formatter.js";
import type { FooterDiagnostics } from "./rules/categories.js";
import type { ExternalLinkDiagnostics } from "./rules/externalLinks.js";
import type { FileLinkDiagnostics } from "./rules/fileLinks.js";
import type { ListDiagnostics } from "./rules/lists.js";
import type { RedirectDiagnostics } from "./rules/redirects.js";
import type { ReferenceDiagnostics } from "./rules/references.js";
import type { SectionSpacingDiagnostics } from "./rules/sectionSpacing.js";
import type {
  TableDiagnostic,
  TableFormatDiagnostics,
} from "./rules/tables.js";
import type { TemplateParameterDiagnostics } from "./rules/templateParameters.js";
import type { WikilinkDiagnostics } from "./rules/wikilinks.js";

export interface DetailedDiagnostics {
  tableDiagnostics: TableDiagnostic[];
  tableFormatDiagnostics: TableFormatDiagnostics;
  footerDiagnostics: FooterDiagnostics;
  redirectDiagnostics: RedirectDiagnostics;
  fileLinkDiagnostics: FileLinkDiagnostics;
  wikilinkDiagnostics: WikilinkDiagnostics;
  externalLinkDiagnostics: ExternalLinkDiagnostics;
  referenceDiagnostics: ReferenceDiagnostics;
  listDiagnostics: ListDiagnostics;
  sectionSpacingDiagnostics: SectionSpacingDiagnostics;
  templateParameterDiagnostics: TemplateParameterDiagnostics;
  equivalenceDiagnostics: StructuralEquivalenceResult[];
}

export function emptyDetailedDiagnostics(): DetailedDiagnostics {
  return {
    tableDiagnostics: [],
    tableFormatDiagnostics: {
      tablesInspected: 0,
      tablesEligible: 0,
      tablesChanged: 0,
      tablesAlreadyCanonical: 0,
      tablesSkippedAmbiguous: 0,
      formattingPassesUsed: 0,
      convergenceLimitReached: false,
      tableSemanticIds: [],
      changedTableSemanticIds: [],
    },
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
    wikilinkDiagnostics: {
      wikilinksInspected: 0,
      wikilinksEligible: 0,
      wikilinksFormatted: 0,
      underscoresReplaced: 0,
      wikilinksWithFragmentsFormatted: 0,
      wikilinksSkippedUnsafe: 0,
      skipReasons: {},
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
    listDiagnostics: {
      listLinesInspected: 0,
      listLinesEligible: 0,
      listLinesChanged: 0,
      listLinesAlreadyCanonical: 0,
      listLinesSkipped: 0,
      mixedMarkerLinesChanged: 0,
      commentBearingLinesChanged: 0,
      structuredContentLinesChanged: 0,
      skipReasons: {},
    },
    sectionSpacingDiagnostics: {
      sectionSpacingBeforeHeadingsInserted: 0,
      sectionSpacingAfterHeadingsInserted: 0,
    },
    templateParameterDiagnostics: {
      templatesInspected: 0,
      templatesEligible: 0,
      templatesChanged: 0,
      templatesAlreadyCanonical: 0,
      templatesSkippedAmbiguous: 0,
      uniqueTemplatesFormatted: 0,
      templatesFormatted: 0,
      templatesExpandedToMultiline: 0,
      existingMultilineTemplatesNormalized: 0,
      templatesSkipped: 0,
      skipReasons: {},
      formattingPassesUsed: 0,
      convergenceLimitReached: false,
      templateParametersFormatted: 0,
      templateParameterLinesFormatted: 0,
      templateParameterLinesSkippedUnsafe: 0,
      templateSemanticIds: [],
      changedTemplateSemanticIds: [],
    },
    equivalenceDiagnostics: [],
  };
}

export function stripDiagnostics(result: FormatDetailedResult): FormatResult {
  const {
    tableDiagnostics: _tableDiagnostics,
    tableFormatDiagnostics: _tableFormatDiagnostics,
    footerDiagnostics: _footerDiagnostics,
    redirectDiagnostics: _redirectDiagnostics,
    fileLinkDiagnostics: _fileLinkDiagnostics,
    wikilinkDiagnostics: _wikilinkDiagnostics,
    externalLinkDiagnostics: _externalLinkDiagnostics,
    referenceDiagnostics: _referenceDiagnostics,
    listDiagnostics: _listDiagnostics,
    sectionSpacingDiagnostics: _sectionSpacingDiagnostics,
    templateParameterDiagnostics: _templateParameterDiagnostics,
    equivalenceDiagnostics: _equivalenceDiagnostics,
    ...stripped
  } = result;
  return stripped;
}

export function fallbackDetailedResult(
  source: string,
  failure: FormatFailure,
  diagnostics: DetailedDiagnostics = emptyDetailedDiagnostics(),
): FormatDetailedResult {
  return {
    formatted: source,
    failure,
    warning: failure.message,
    ...diagnostics,
  };
}
