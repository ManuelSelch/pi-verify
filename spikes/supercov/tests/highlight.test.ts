import assert from "node:assert/strict";
import test from "node:test";
import { highlightSource, highlightLines, highlightDiff } from "../src/highlight.ts";

const textOf = (html: string) => html.replace(/<[^>]*>/g, "").replace(/&(?:amp|lt|gt|quot|#39);/g, entity => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" })[entity]!);

for (const separator of ["\n", "\r\n", "\r"]) {
  test(`preserves indentation, empty lines and trailing ${JSON.stringify(separator)} separators`, () => {
    const source = `\tconst a: number = 1;${separator}${separator}const b = 2;${separator}`;

    const html = highlightSource(source);

    assert.equal(textOf(html), source);
    assert.equal(highlightLines(source).length, 4);
  });
}

test("preserves an empty snippet without fabricated text", () => {
  assert.equal(highlightSource(""), "");
});

test("diff sides retain independent multiline syntax state", () => {
  const lines = [
    { kind: "removed" as const, text: "/* old multiline comment" },
    { kind: "removed" as const, text: "ends here */" },
    { kind: "added" as const, text: "const n: number = 1;" },
    { kind: "context" as const, text: "consume(n);" },
  ];

  const highlighted = highlightDiff(lines);
  const oldSide = highlightLines("/* old multiline comment\nends here */\nconsume(n);");
  const newSide = highlightLines("const n: number = 1;\nconsume(n);");

  assert.deepEqual(highlighted, [oldSide[0], oldSide[1], newSide[0], newSide[1]]);
  assert.deepEqual(highlighted.map(textOf), lines.map(line => line.text));
});
