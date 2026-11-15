export type Size = { width: number; height: number };

export function fitDiagram(diagram: Size, viewport: Size, maxWidth: number): Size {
  if (![diagram.width, diagram.height, viewport.width, viewport.height, maxWidth].every(n => Number.isFinite(n) && n > 0)) return { width: 0, height: 0 };
  const scale = Math.min(viewport.width / diagram.width, viewport.height / diagram.height, maxWidth / diagram.width);
  return { width: diagram.width * scale, height: diagram.height * scale };
}
