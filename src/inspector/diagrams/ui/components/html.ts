import type { Diagram } from '../../domain/model.js';

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export function diagramsHtml(diagrams: Diagram[], expandIcon: string): string {
  if (!diagrams.length) return '<section class="panel diagrams-empty"><h3>No Mermaid diagrams found</h3><p>Add a fenced mermaid block to a Markdown document, then regenerate the inspector report.</p></section>';
  const groups = new Map<string, number[]>();
  diagrams.forEach((diagram, index) => groups.set(diagram.file, [...(groups.get(diagram.file) ?? []), index]));
  return [...groups].map(([file, indices]) => `<section class="diagram-document"><h2>${escape(file)}</h2>${indices.map(index => {
    const diagram = diagrams[index];
    return `<section class="panel diagram-card"><div class="diagram-card-header"><div><h3>${escape(diagram.title)}</h3><span class="diagram-location">${escape(file)}:${diagram.line}</span></div><button class="diagram-expand" data-expand-diagram="${index}" aria-label="Expand ${escape(diagram.title)}" disabled>${expandIcon}</button></div><div class="diagram-preview" data-diagram="${index}" role="status"><p>Rendering diagram…</p></div></section>`;
  }).join('')}</section>`).join('');
}

export function presentationHtml(title: string, icons: { minus: string; plus: string; close: string }): string {
  return `<div class="diagram-dialog-header"><h2 id="diagram-dialog-title">${escape(title)}</h2><div class="diagram-zoom"><button data-zoom="out" aria-label="Zoom out">${icons.minus}</button><button data-zoom="reset" aria-label="Reset zoom to fit">100%</button><button data-zoom="in" aria-label="Zoom in">${icons.plus}</button></div><button data-close-diagram aria-label="Close diagram">${icons.close}</button></div><div class="diagram-stage"><div class="diagram-stage-canvas"></div></div>`;
}
