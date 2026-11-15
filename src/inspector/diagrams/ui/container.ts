import mermaid from 'mermaid';
import zoomOut from '@tabler/icons/outline/zoom-out.svg?raw';
import zoomIn from '@tabler/icons/outline/zoom-in.svg?raw';
import closeIcon from '@tabler/icons/outline/x.svg?raw';
import { fitDiagram, type Size } from '../domain/fit.js';
import type { Diagram } from '../domain/model.js';
import { presentationHtml } from './components/html.js';

mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  suppressErrorRendering: true,
  theme: 'base',
  fontFamily: 'system-ui, sans-serif',
  htmlLabels: false,
  flowchart: { htmlLabels: false },
  themeVariables: { primaryColor: '#edf6ef', primaryTextColor: '#365740', primaryBorderColor: '#86a591', lineColor: '#6d8a78' },
});

let renderId = 0;

function present(diagram: Diagram, svg: SVGSVGElement, natural: Size, preview: HTMLElement, onRestore: () => void): HTMLDialogElement {
  const dialog = document.createElement('dialog');
  dialog.className = 'diagram-dialog';
  dialog.setAttribute('aria-labelledby', 'diagram-dialog-title');
  dialog.innerHTML = presentationHtml(diagram.title, { minus: zoomOut, plus: zoomIn, close: closeIcon });
  document.body.append(dialog);
  const stage = dialog.querySelector<HTMLElement>('.diagram-stage-canvas')!;
  stage.append(svg); // Move, rather than duplicate, Mermaid's SVG IDs.
  let zoom = 1;
  let viewport: Size = { width: 0, height: 0 };
  const resize = () => {
    const fit = fitDiagram(natural, viewport, 1000);
    svg.style.width = `${fit.width * zoom}px`;
    svg.style.height = `${fit.height * zoom}px`;
  };
  const observer = new ResizeObserver(([entry]) => {
    viewport = { width: entry.contentRect.width, height: entry.contentRect.height };
    resize();
  });
  const reset = dialog.querySelector<HTMLButtonElement>('[data-zoom="reset"]')!;
  dialog.querySelectorAll<HTMLButtonElement>('[data-zoom]').forEach(button => button.onclick = () => {
    zoom = button.dataset.zoom === 'reset' ? 1 : Math.max(.25, Math.min(3, zoom + (button.dataset.zoom === 'in' ? .25 : -.25)));
    reset.textContent = `${Math.round(zoom * 100)}%`;
    resize();
  });
  dialog.querySelector<HTMLButtonElement>('[data-close-diagram]')!.onclick = () => dialog.close();
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    observer.disconnect();
    preview.append(svg);
    onRestore();
    document.body.classList.remove('diagram-presenting');
    dialog.remove();
  }, { once: true });
  dialog.showModal();
  document.body.classList.add('diagram-presenting');
  observer.observe(stage);
  return dialog;
}

export function mountDiagrams(root: HTMLElement, diagrams: Diagram[]): () => void {
  let active = true;
  let dialog: HTMLDialogElement | undefined;
  const observers: ResizeObserver[] = [];
  const render = async () => {
    for (const [index, diagram] of diagrams.entries()) {
      if (!active) return;
      const preview = root.querySelector<HTMLElement>(`[data-diagram="${index}"]`)!;
      const expand = root.querySelector<HTMLButtonElement>(`[data-expand-diagram="${index}"]`)!;
      const host = document.createElement('div');
      host.className = 'diagram-render-host';
      document.body.append(host);
      try {
        const result = await mermaid.render(`inspector-mermaid-${++renderId}`, diagram.source, host);
        if (!active) return;
        preview.innerHTML = result.svg;
        const svg = preview.querySelector<SVGSVGElement>('svg');
        if (!svg) throw new Error('Mermaid did not produce an SVG');
        const bounds = svg.viewBox.baseVal;
        const natural = { width: bounds.width, height: bounds.height };
        if (!(natural.width > 0 && natural.height > 0)) throw new Error('Invalid diagram dimensions');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', diagram.title);
        svg.style.maxWidth = 'none';
        preview.removeAttribute('role');
        const sizePreview = () => {
          if (svg.parentElement !== preview) return;
          const size = fitDiagram(natural, { width: Math.max(1, preview.clientWidth - 24), height: 240 }, 560);
          svg.style.width = `${size.width}px`;
          svg.style.height = `${size.height}px`;
        };
        sizePreview();
        const observer = new ResizeObserver(sizePreview);
        observer.observe(preview);
        observers.push(observer);
        expand.disabled = false;
        expand.onclick = () => { dialog = present(diagram, svg, natural, preview, sizePreview); };
      } catch {
        if (!active) return;
        // Mermaid errors can contain source text; never display the raw error.
        preview.replaceChildren();
        const error = document.createElement('p');
        error.className = 'diagram-error';
        error.textContent = 'Unable to render this diagram. Check its Mermaid syntax in the document. Other diagrams are still available.';
        preview.append(error);
        preview.setAttribute('role', 'status');
        expand.hidden = true;
      } finally {
        host.remove();
      }
    }
  };
  void render();
  return () => {
    active = false;
    observers.forEach(observer => observer.disconnect());
    if (dialog?.open) dialog.close();
  };
}
