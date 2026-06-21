import { stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import fg from "fast-glob";

export async function expandInputPaths(
  patterns: readonly string[],
  cwd = process.cwd(),
): Promise<string[]> {
  const directory = resolve(cwd);
  const files = new Set<string>();

  for (const pattern of patterns) {
    if (fg.isDynamicPattern(pattern)) {
      const matches = await fg(pattern, {
        cwd: directory,
        onlyFiles: true,
        unique: true,
        dot: true,
        followSymbolicLinks: true,
      });
      if (matches.length === 0)
        throw new Error(`Glob pattern matched no files: ${pattern}`);
      for (const match of matches)
        files.add(isAbsolute(match) ? match : resolve(directory, match));
      continue;
    }

    const path = isAbsolute(pattern) ? pattern : resolve(directory, pattern);
    try {
      if (!(await stat(path)).isFile())
        throw new Error(`Input path is not a file: ${pattern}`);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("Input path is not a file:")
      )
        throw error;
      throw new Error(`Input file not found: ${pattern}`);
    }
    files.add(path);
  }

  return [...files].sort((a, b) => {
    const left = relative(directory, a);
    const right = relative(directory, b);
    return left < right ? -1 : left > right ? 1 : 0;
  });
}
