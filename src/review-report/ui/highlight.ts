import { createHighlighterCoreSync } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import typescript from "shiki/langs/typescript.mjs";
import tsx from "shiki/langs/tsx.mjs";
import githubLight from "shiki/themes/github-light.mjs";

const highlighter = createHighlighterCoreSync({ langs: [typescript, tsx], themes: [githubLight], engine: createJavaScriptRegexEngine() });
const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

export function highlightLines(source: string, file = ""): string[] {
  return highlighter.codeToTokens(source.replace(/\r\n|\r/g, "\n"), { lang: /\.[jt]sx$/i.test(file) ? "tsx" : "typescript", theme: "github-light" }).tokens.map(tokens => tokens.map(token => {
    const font = token.fontStyle ?? 0;
    const style = [`color:${token.color}`, ...(font & 1 ? ["font-style:italic"] : []), ...(font & 2 ? ["font-weight:600"] : []), ...(font & 4 ? ["text-decoration:underline"] : [])].join(";");
    return `<span style="${escape(style)}">${escape(token.content)}</span>`;
  }).join(""));
}
export function highlightSource(source: string, file = ""): string {
  const lines = highlightLines(source, file);
  return source.split(/(\r\n|\r|\n)/).map((text, index) => index % 2 ? text : lines[index / 2]).join("");
}
export function highlightDiff(lines: { kind: string; text: string }[], file = ""): string[] {
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
