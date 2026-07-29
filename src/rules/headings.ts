export function formatHeadings(source: string): string {
  return source.replace(
    /^(={2,6})[ \t]*(.*?)[ \t]*\1[ \t]*$/gmu,
    (_, marks: string, title: string) =>
      title && !title.startsWith("=") && !title.endsWith("=")
        ? `${marks} ${title} ${marks}`
        : _,
  );
}
