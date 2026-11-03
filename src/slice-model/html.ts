import type { SliceReview } from "./collect.js";
import type { SliceModel } from "./model.js";

const esc = (v: unknown) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const number = (v: number) => Number.isFinite(v) ? Math.max(-10000, Math.min(10000, v)) : 0;

function picture(model: SliceModel | null, added: string[] = []): string {
  if (!model) return '<p class="model-empty">No slice diagram existed at this revision.</p>';
  const boxes = model.concepts;
  const width = Math.max(400, ...boxes.map(c => number(c.x + c.width + 40)));
  const height = Math.max(200, ...boxes.map(c => number(c.y + c.height + 40)));
  const arrows = `<defs><marker id="slice-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#667085"/></marker><marker id="slice-arrow-added" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#2e7d32"/></marker></defs>`;
  const lines = model.edges.map(edge => {
    const from = boxes.find(c => c.name === edge.from), to = boxes.find(c => c.name === edge.to);
    if (!from || !to) return "";
    const x1 = number(from.x + from.width / 2), y1 = number(from.y + from.height / 2), x2 = number(to.x + to.width / 2), y2 = number(to.y + to.height / 2);
    const isAdded = added.includes(`association ${edge.key}`);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${isAdded ? "#2e7d32" : "#667085"}" stroke-width="2" marker-end="url(#${isAdded ? "slice-arrow-added" : "slice-arrow"})"/>`;
  }).join("");
  const nodes = boxes.map(c => `<g><rect x="${number(c.x)}" y="${number(c.y)}" width="${Math.max(1, number(c.width))}" height="${Math.max(1, number(c.height))}" rx="6" fill="${added.includes(`slice ${c.name}`) ? "#e0f6e8" : "#ffffff"}" stroke="${added.includes(`slice ${c.name}`) ? "#2e7d32" : "#667085"}" stroke-width="2"/><text text-anchor="middle" x="${number(c.x + c.width / 2)}" y="${number(c.y + c.height / 2 + 5)}">${esc(c.label)}</text></g>`).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Slice architecture diagram">${arrows}${lines}${nodes}</svg>`;
}

export function sliceHtml(review: SliceReview): string {
  const delta = review.delta;
  const status = review.guardrail.status;
  const messages = review.guardrail.diagnostics.map(item => `<li>${esc(item)}</li>`).join("");
  const unused = review.guardrail.unused.length ? `<p class="model-note">Allowed but unused: ${esc(review.guardrail.unused.join(", "))}</p>` : "";
  const items = delta ? [...delta.removed.map(x => `− ${x}`), ...delta.changed.map(x => `~ ${x}`)] : [];
  const changes = delta ? (items.length ? `<ul>${items.map(i => `<li>${esc(i)}</li>`).join("")}</ul>` : "") : "<p>Comparison unavailable: no verified base revision.</p>";
  return `<div class="panel model-panel"><div class="panel-head"><h2>Slice architecture</h2>${status === "passed" ? '<span class="status-dot" role="img" aria-label="Slice guardrail passed" title="Slice guardrail passed"></span>' : `<span class="badge warning">Guardrail ${esc(status)}</span>`}</div>${messages ? `<ul>${messages}</ul>` : ""}${unused}
  <div class="model-controls"><input type="radio" id="slice-diff" name="slice-view" checked><label for="slice-diff">Changes</label><input type="radio" id="slice-before" name="slice-view"><label for="slice-before">Before</label><input type="radio" id="slice-after" name="slice-view"><label for="slice-after">After</label><div class="model-panes"><div class="model-diff">${picture(review.after, delta?.added)}${changes}</div><div class="model-before">${review.base ? picture(review.before) : '<p>Base revision unavailable.</p>'}</div><div class="model-after">${picture(review.after)}</div></div></div>
  </div>`;
}

export const sliceCss = `.model-controls:has(#slice-diff:checked) .model-diff,.model-controls:has(#slice-before:checked) .model-before,.model-controls:has(#slice-after:checked) .model-after{display:block}`;
