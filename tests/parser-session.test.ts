import bundledDefaultConfig from "wikiparser-node/config/default.json" with {
  type: "json",
};
import { describe, expect, it } from "vitest";

import { createFormatter } from "../src/formatterEngine.js";
import {
  createNodeParserRuntime,
  nodeParserRuntime,
} from "../src/parser.node.js";
import { createParserContext } from "../src/parserContext.js";
import type {
  ParserRuntime,
  ParserSession,
} from "../src/parserRuntime.js";

interface RuntimeEvents {
  resolutionNames: string[];
  sessions: ParserSession[];
  contextSessions: ParserSession[];
  parsedConfigs: ParserSession["config"][];
}

function createCountingRuntime(): {
  runtime: ParserRuntime;
  events: RuntimeEvents;
} {
  const events: RuntimeEvents = {
    resolutionNames: [],
    sessions: [],
    contextSessions: [],
    parsedConfigs: [],
  };
  const runtime: ParserRuntime = {
    createSession(name) {
      events.resolutionNames.push(name);
      const inner = nodeParserRuntime.createSession(name);
      let session: ParserSession;
      const parse: ParserSession["parse"] = (source) => {
        events.parsedConfigs.push(session.config);
        return inner.parse(source);
      };
      session = Object.freeze({
        config: inner.config,
        parse,
        createContext(source: string) {
          const context = createParserContext(source, session);
          events.contextSessions.push(context.session);
          return context;
        },
        isRoundTripSafe: (source: string) => parse(source).toString() === source,
      });
      events.sessions.push(session);
      return session;
    },
  };
  return { runtime, events };
}

describe("parser sessions", () => {
  it.each(["formatWikitextSafe", "formatWikitextSafeDetailed"] as const)(
    "%s resolves its parser configuration once",
    (method) => {
      const { runtime, events } = createCountingRuntime();
      const formatter = createFormatter(runtime);

      const result = formatter[method]("==Title==\n");

      expect(result.formatted).toBe("== Title ==\n");
      expect(events.resolutionNames).toEqual(["mediawiki"]);
      expect(events.sessions).toHaveLength(1);
    },
  );

  it("reuses one immutable session and configuration for both safe passes", () => {
    const { runtime, events } = createCountingRuntime();
    const formatter = createFormatter(runtime);

    const result = formatter.formatWikitextSafeDetailed(
      "==Title==\n*item\n{{T|a=1|b=2}}\n",
    );

    expect(result.failure).toBeUndefined();
    const [session] = events.sessions;
    expect(session).toBeDefined();
    expect(Object.isFrozen(session)).toBe(true);
    expect(events.contextSessions.length).toBeGreaterThan(1);
    expect(new Set(events.contextSessions)).toEqual(new Set([session!]));
    expect(events.parsedConfigs.length).toBeGreaterThan(1);
    expect(new Set(events.parsedConfigs)).toEqual(new Set([session!.config]));
  });

  it("creates separate sessions for formatter calls with separate configurations", () => {
    const { runtime, events } = createCountingRuntime();
    const formatter = createFormatter(runtime);

    expect(
      formatter.formatWikitextSafe("==First==\n", {
        parserConfig: "mediawiki",
      }).formatted,
    ).toBe("== First ==\n");
    expect(
      formatter.formatWikitextSafe("==Second==\n", {
        parserConfig: "default",
      }).formatted,
    ).toBe("== Second ==\n");

    expect(events.resolutionNames).toEqual(["mediawiki", "default"]);
    expect(events.sessions).toHaveLength(2);
    expect(events.sessions[0]).not.toBe(events.sessions[1]);
    expect(events.sessions[0]!.config).not.toBe(events.sessions[1]!.config);
  });

  it("keeps separate and interleaved sessions isolated", () => {
    const { runtime, events } = createCountingRuntime();
    const first = runtime.createSession("mediawiki");
    const second = runtime.createSession("default");

    const firstBefore = first.createContext("==First==\n");
    const secondContext = second.createContext("==Second==\n");
    const firstAfter = first.createContext("==First again==\n");

    expect(first).not.toBe(second);
    expect(first.config).not.toBe(second.config);
    expect(firstBefore.session).toBe(first);
    expect(firstAfter.session).toBe(first);
    expect(secondContext.session).toBe(second);
    expect(events.resolutionNames).toEqual(["mediawiki", "default"]);
  });

  it.each(["formatWikitextSafe", "formatWikitextSafeDetailed"] as const)(
    "%s loads a custom Node parser configuration once",
    (method) => {
      let reads = 0;
      const runtime = createNodeParserRuntime({
        readFile: () => {
          reads++;
          return JSON.stringify(bundledDefaultConfig);
        },
        resolvePackageJson: () => {
          throw new Error("package lookup should not be used for explicit paths");
        },
      });
      const formatter = createFormatter(runtime);

      const result = formatter[method]("==Title==\n", {
        parserConfig: "/virtual/wikitext-fmt-parser.json",
      });

      expect(result.formatted).toBe("== Title ==\n");
      expect(result.failure).toBeUndefined();
      expect(reads).toBe(1);
    },
  );
});
