import type { FormatDetailedResult, FormatOptions } from "wikitext-fmt";
import type {
  EditorDocumentFormattingResult,
  EditorSettingsResolution,
} from "./format.js";

export interface DocumentReportInput {
  uri: string;
  languageId: string;
  result: EditorDocumentFormattingResult;
}

export interface DiagnosticsReport {
  ruleChanges: Record<string, number>;
  skippedOrAmbiguous: Record<string, number>;
  skipReasons: Record<string, number>;
}

function addReason(
  target: Record<string, number>,
  rule: string,
  reason: string,
  count: number,
): void {
  if (count <= 0) return;
  const key = `${rule}: ${reason}`;
  target[key] = (target[key] ?? 0) + count;
}

export function createDiagnosticsReport(
  details: FormatDetailedResult,
): DiagnosticsReport {
  const template = details.templateParameterDiagnostics;
  const table = details.tableFormatDiagnostics;
  const footer = details.footerDiagnostics;
  const skipReasons: Record<string, number> = {};

  for (const [reason, count] of Object.entries(template.skipReasons)) {
    addReason(skipReasons, "templates", reason, count);
  }
  for (const [reason, count] of Object.entries(
    details.wikilinkDiagnostics.skipReasons,
  )) {
    addReason(skipReasons, "wikilinks", reason, count ?? 0);
  }
  for (const diagnostic of details.tableDiagnostics) {
    if (diagnostic.reason) {
      addReason(skipReasons, "tables", diagnostic.reason, 1);
    }
    for (const line of diagnostic.lineDiagnostics ?? []) {
      if (line.reason) addReason(skipReasons, "table lines", line.reason, 1);
    }
  }

  return {
    ruleChanges: {
      tablesChanged: table.tablesChanged,
      templatesChanged: template.templatesChanged,
      behaviorSwitchesMoved: footer.behaviorSwitchesMoved,
      behaviorSwitchesFormatted: footer.behaviorSwitchesFormatted,
      defaultsortMoved: footer.defaultsortMoved,
      categoriesMoved: footer.categoriesMoved,
      interlanguageLinksMoved: footer.interlanguageLinksMoved,
      interlanguageLinksFormatted: footer.interlanguageLinksFormatted,
      redirectsFormatted: details.redirectDiagnostics.redirectsFormatted,
      fileLinksFormatted: details.fileLinkDiagnostics.fileLinksFormatted,
      wikilinksFormatted: details.wikilinkDiagnostics.wikilinksFormatted,
      externalLinksFormatted:
        details.externalLinkDiagnostics.externalLinksFormatted,
      referencesFormatted: details.referenceDiagnostics.referencesFormatted,
      sectionSpacingBeforeHeadingsInserted:
        details.sectionSpacingDiagnostics
          .sectionSpacingBeforeHeadingsInserted,
      sectionSpacingAfterHeadingsInserted:
        details.sectionSpacingDiagnostics.sectionSpacingAfterHeadingsInserted,
    },
    skippedOrAmbiguous: {
      tablesSkippedAmbiguous: table.tablesSkippedAmbiguous,
      templatesSkippedAmbiguous: template.templatesSkippedAmbiguous,
      wikilinksSkippedUnsafe:
        details.wikilinkDiagnostics.wikilinksSkippedUnsafe,
      externalLinksSkippedUnsafe:
        details.externalLinkDiagnostics.externalLinksSkippedUnsafe,
      referenceLinesSkippedUnsafe:
        details.referenceDiagnostics.referenceLinesSkippedUnsafe,
      templateParameterLinesSkippedUnsafe:
        template.templateParameterLinesSkippedUnsafe,
    },
    skipReasons,
  };
}

export function reportedProfileAndLevel(options: FormatOptions): {
  profile: NonNullable<FormatOptions["profile"]>;
  level: NonNullable<FormatOptions["level"]>;
} {
  const profile = options.profile ?? "default";
  return {
    profile,
    level:
      options.level ??
      (profile === "aggressive" ? "experimental" : "normal"),
  };
}

export function createDocumentReport(input: DocumentReportInput): object {
  const common = {
    documentUri: input.uri,
    languageId: input.languageId,
    activeConfigPath: input.result.configPath ?? null,
  };

  if (input.result.kind === "settings-warning") {
    return {
      ...common,
      status: "failed",
      changed: false,
      warning: input.result.warning,
    };
  }

  const resolved = reportedProfileAndLevel(input.result.settings.options);
  const failure =
    input.result.kind === "failed"
      ? {
          code: input.result.failure.code,
          stage: input.result.failure.stage ?? null,
          message: input.result.failure.message,
        }
      : null;

  return {
    ...common,
    resolvedProfile: resolved.profile,
    resolvedLevel: resolved.level,
    explicitVscodeOptions: input.result.settings.explicitOptions,
    status:
      input.result.kind === "failed" || input.result.kind === "warning"
        ? "failed"
        : input.result.kind,
    changed: input.result.changed,
    failure,
    warning:
      input.result.kind === "warning" ||
      input.result.kind === "failed"
        ? (input.result.warning ?? null)
        : null,
    diagnostics: createDiagnosticsReport(input.result.details),
  };
}

export function renderDocumentReport(input: DocumentReportInput): string {
  return JSON.stringify(createDocumentReport(input), null, 2);
}

export function createResolvedConfigurationReport(
  uri: string,
  resolution: EditorSettingsResolution,
): object {
  if (resolution.kind === "warning") {
    return {
      documentUri: uri,
      activeConfigPath: resolution.configPath ?? null,
      status: "failed",
      warning: resolution.warning,
    };
  }
  const resolved = reportedProfileAndLevel(resolution.settings.options);
  return {
    documentUri: uri,
    activeConfigPath: resolution.configPath ?? null,
    resolvedProfile: resolved.profile,
    resolvedLevel: resolved.level,
    vscodeOverrides: resolution.settings.explicitOptions,
    configFileOptions: resolution.settings.configOptions,
    coreOptions: resolution.settings.options,
    editorOnly: {
      safe: resolution.settings.safe,
    },
  };
}

export function renderResolvedConfigurationReport(
  uri: string,
  resolution: EditorSettingsResolution,
): string {
  return JSON.stringify(
    createResolvedConfigurationReport(uri, resolution),
    null,
    2,
  );
}

