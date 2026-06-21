export function formatHeadings(source: string): string {
  return source.replace(
    /^(={2,6})[ \t]*(.*?)[ \t]*\1[ \t]*$/gmu,
    (_, marks: string, title: string) => {
      const trimmed = title.trim();
      return trimmed && !trimmed.startsWith("=") && !trimmed.endsWith("=") ?
          `${marks} ${trimmed} ${marks}`
        : _;
    },
  );
}
