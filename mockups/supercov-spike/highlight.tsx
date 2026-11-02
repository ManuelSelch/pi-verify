import React from "react";
import { createHighlighterCoreSync } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import typescript from "shiki/langs/typescript.mjs";
import githubLight from "shiki/themes/github-light.mjs";

const highlighter = createHighlighterCoreSync({
  langs: [typescript],
  themes: [githubLight],
  engine: createJavaScriptRegexEngine(),
});

export function highlight(source: string) {
  return highlighter.codeToTokens(source, { lang: "typescript", theme: "github-light" }).tokens;
}

type TokenLine = ReturnType<typeof highlight>[number];
export function SyntaxLine({ tokens }: { tokens: TokenLine }) {
  return <>{tokens.map((token, index) => <span key={index} style={{
    color: token.color,
    fontStyle: token.fontStyle && token.fontStyle & 1 ? "italic" : undefined,
    fontWeight: token.fontStyle && token.fontStyle & 2 ? 600 : undefined,
    textDecoration: token.fontStyle && token.fontStyle & 4 ? "underline" : undefined,
  }}>{token.content}</span>)}</>;
}

export function HighlightedSource({ source }: { source: string }) {
  const lines = highlight(source);
  return <pre className="test-source"><code>{lines.map((tokens, index) => <React.Fragment key={index}>
    <SyntaxLine tokens={tokens}/>{index < lines.length - 1 ? "\n" : ""}
  </React.Fragment>)}</code></pre>;
}
