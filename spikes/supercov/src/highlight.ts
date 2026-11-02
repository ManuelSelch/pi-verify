import { createHighlighterCoreSync } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import typescript from "shiki/langs/typescript.mjs";
import tsx from "shiki/langs/tsx.mjs";
import githubLight from "shiki/themes/github-light.mjs";
import type { DiffLine } from "./analysis.ts";
import { escapeHtml as e } from "./html.ts";

// Loaded once in the generator. No Shiki runtime, grammar or engine is sent to the browser.
const highlighter = createHighlighterCoreSync({
  langs: [typescript, tsx],
  themes: [githubLight],
  engine: createJavaScriptRegexEngine(),
});

export function highlightLines(source: string, file = ""): string[] {
  // Normalize only for lexical analysis; highlightSource restores the original separators.
  return highlighter.codeToTokens(source.replace(/\r\n|\r/g, "\n"), { lang: /\.[jt]sx$/i.test(file) ? "tsx" : "typescript", theme: "github-light" }).tokens.map(tokens => tokens.map(token => {
    const font = token.fontStyle ?? 0;
    const style = [
      `color:${token.color}`,
      ...(font & 1 ? ["font-style:italic"] : []),
      ...(font & 2 ? ["font-weight:600"] : []),
      ...(font & 4 ? ["text-decoration:underline"] : []),
    ].join(";");
    // Token content is always escaped, even when the source looks like HTML or script tags.
    return `<span style="${e(style)}">${e(token.content)}</span>`;
  }).join(""));
}

export function highlightSource(source: string, file = ""): string {
  const lines = highlightLines(source, file);
  // Preserve original line separators, blank lines, indentation and trailing newline.
  return source.split(/(\r\n|\r|\n)/).map((text, index) => index % 2 ? text : lines[index / 2]).join("");
}

export function highlightDiff(lines: DiffLine[], file = ""): string[] {
  // Lex each complete side independently so removed lines cannot change the syntax
  // state of the added side (for example multiline comments and template strings).
  const before = highlightLines(lines.filter(line => line.kind !== "added").map(line => line.text).join("\n"), file);
  const after = highlightLines(lines.filter(line => line.kind !== "removed").map(line => line.text).join("\n"), file);
  let oldLine = 0, newLine = 0;
  return lines.map(line => {
    const html = line.kind === "removed" ? before[oldLine] : after[newLine];
    if (line.kind !== "added") oldLine++;
    if (line.kind !== "removed") newLine++;
    return html;
  });
}
