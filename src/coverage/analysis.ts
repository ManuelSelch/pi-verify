import ts from "typescript";

export interface Definition {
  name: string;
  line: number;
  source: string;
}
export interface Context {
  file: string;
  startLine: number;
  endLine: number;
  source: string;
}
export interface DiffLine { kind: "context" | "added" | "removed"; text: string }

// Deliberately narrow: static node:test test()/it()/describe() declarations.
// Dynamic names, aliases, and generated/parameterized tests need another adapter.
export function testDefinitions(file: string, source: string): Definition[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const result: Definition[] = [];
  function visit(node: ts.Node, suites: string[]): void {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const call = node.expression.text;
      const name = node.arguments[0];
      if ((call === "describe" || call === "test" || call === "it") && name && ts.isStringLiteralLike(name)) {
        const callback = node.arguments.find(arg => ts.isArrowFunction(arg) || ts.isFunctionExpression(arg));
        if (callback && (call === "test" || call === "it")) {
          result.push({ name: [...suites, name.text].join(" > "), line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1, source: node.getText(tree) });
          return;
        }
        if (callback && call === "describe") {
          visit(callback, [...suites, name.text]);
          return;
        }
      }
    }
    ts.forEachChild(node, child => visit(child, suites));
  }
  visit(tree, []);
  return result;
}

export function functionContext(file: string, source: string, line: number): Context {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  let found: Context | undefined;
  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
      const startLine = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
      const endLine = tree.getLineAndCharacterOfPosition(node.end).line + 1;
      if (startLine <= line && endLine >= line && (!found || endLine - startLine < found.endLine - found.startLine))
        found = { file, startLine, endLine, source: source.split("\n").slice(startLine - 1, endLine).join("\n") };
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  if (found) return found;
  const startLine = Math.max(1, line - 3);
  const endLine = Math.min(source.split("\n").length, line + 3);
  return { file, startLine, endLine, source: source.split("\n").slice(startLine - 1, endLine).join("\n") };
}

export function changedLineNumbers(diff: string): number[] {
  const result: number[] = [];
  let line = 0;
  for (const text of diff.split("\n")) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
    if (hunk) { line = Number(hunk[1]); continue; }
    if (!line || text.startsWith("---") || text.startsWith("+++")) continue;
    if (text.startsWith("+")) { result.push(line); line++; }
    else if (text.startsWith(" ")) line++;
  }
  return result;
}

// LCS over one test definition, not entire project files. Bound work for huge tests.
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before ? before.split("\n") : [];
  const b = after ? after.split("\n") : [];
  if (a.length * b.length > 1_000_000)
    return [...a.map(text => ({ kind: "removed" as const, text })), ...b.map(text => ({ kind: "added" as const, text }))];
  const table = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const result: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { result.push({ kind: "context", text: a[i] }); i++; j++; }
    else if (i < a.length && (j >= b.length || table[i + 1][j] >= table[i][j + 1])) { result.push({ kind: "removed", text: a[i] }); i++; }
    else { result.push({ kind: "added", text: b[j] }); j++; }
  }
  return result;
}
