import { fromMarkdown } from 'mdast-util-from-markdown';
import type { Root, RootContent } from 'mdast';
import type { Diagram } from './model.js';

function text(node: RootContent): string {
  if ('value' in node) return node.value;
  if ('children' in node) return node.children.map(text).join('');
  if (node.type === 'image') return node.alt ?? '';
  return '';
}

export function parseDiagrams(markdown: string, file: string): Diagram[] {
  const diagrams: Diagram[] = [];
  let heading = '';
  function visit(node: Root | RootContent) {
    if (node.type === 'heading') heading = text(node).trim();
    if (node.type === 'code' && node.lang?.toLowerCase() === 'mermaid') {
      diagrams.push({
        title: heading || `${file.split('/').at(-1)} — diagram ${diagrams.length + 1}`,
        file,
        line: node.position!.start.line,
        source: node.value.replace(/\r\n|\r/g, '\n'),
      });
    }
    if ('children' in node) node.children.forEach(visit);
  }
  visit(fromMarkdown(markdown));
  return diagrams;
}
