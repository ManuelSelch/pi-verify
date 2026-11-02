import type { ConceptualReview } from "./collect.js";
import type { Model } from "./model.js";

const esc = (v: unknown) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const number = (v: number) => Number.isFinite(v) ? Math.max(-10000, Math.min(10000, v)) : 0;

function picture(model: Model | null, added: string[] = []): string {
  if (!model) return '<p class="model-empty">No diagram existed at this revision.</p>';
  const boxes = model.concepts;
  const width = Math.max(400, ...boxes.map(c => number(c.x + c.width + 40)));
  const height = Math.max(200, ...boxes.map(c => number(c.y + c.height + 40)));
  const lines = model.associations.map(a => {
    const from = boxes.find(c => c.name === a.from), to = boxes.find(c => c.name === a.to);
    if (!from || !to) return "";
    const x1 = number(from.x + from.width / 2), y1 = number(from.y + from.height / 2), x2 = number(to.x + to.width / 2), y2 = number(to.y + to.height / 2);
    const color = added.includes(`association ${a.key}`) ? "#2e7d32" : "#637a6e";
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2"/><text x="${x1 * .25 + x2 * .75}" y="${y1 * .25 + y2 * .75 - 6}">${esc(a.toMarker)}</text><text x="${x1 * .75 + x2 * .25}" y="${y1 * .75 + y2 * .25 - 6}">${esc(a.fromMarker)}</text>`;
  }).join("");
  const nodes = boxes.map(c => `<g><rect x="${number(c.x)}" y="${number(c.y)}" width="${Math.max(1, number(c.width))}" height="${Math.max(1, number(c.height))}" rx="6" fill="${added.includes(`concept ${c.name}`) ? "#e0f6e8" : "#f0f8f4"}" stroke="${added.includes(`concept ${c.name}`) ? "#2e7d32" : "#709687"}" stroke-width="2"/><text text-anchor="middle" x="${number(c.x + c.width / 2)}" y="${number(c.y + c.height / 2 + 5)}">${esc(c.label)}</text></g>`).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Conceptual model diagram">${lines}${nodes}</svg>`;
}

export function conceptualHtml(review: ConceptualReview): string {
  const delta = review.delta;
  const status = review.guardrail.status;
  const messages = review.guardrail.diagnostics.map(item => `<li>${esc(item)}</li>`).join("");
  const items = delta ? [...delta.removed.map(x => `− ${x}`), ...delta.changed.map(x => `~ ${x}`)] : [];
  const changes = delta ? (items.length ? `<ul>${items.map(i => `<li>${esc(i)}</li>`).join("")}</ul>` : "") : "<p>Comparison unavailable: no verified base revision.</p>";
  return `<div class="panel model-panel"><div class="panel-head"><h2>Conceptual model</h2>${status === "passed" ? '<span class="status-dot" role="img" aria-label="Guardrail passed" title="Guardrail passed"></span>' : `<span class="badge warning">Guardrail ${esc(status)}</span>`}</div>${messages ? `<ul>${messages}</ul>` : ""}
  <div class="model-controls"><input type="radio" id="model-diff" name="model-view" checked><label for="model-diff">Changes</label><input type="radio" id="model-before" name="model-view"><label for="model-before">Before</label><input type="radio" id="model-after" name="model-view"><label for="model-after">After</label><div class="model-panes"><div class="model-diff">${picture(review.after, delta?.added)}${changes}</div><div class="model-before">${review.base ? picture(review.before) : '<p>Base revision unavailable.</p>'}</div><div class="model-after">${picture(review.after)}</div></div></div>
  </div>`;
}

export const conceptualCss = `.status-dot{display:block;width:10px;height:10px;border-radius:50%;background:#2e9b5f;flex:none;margin:4px 2px}.model-controls{display:flex;flex-wrap:wrap;gap:4px;margin-top:20px}.model-controls input{position:absolute;opacity:0}.model-controls label{cursor:pointer;padding:7px 12px;background:#f0f5f2;border-radius:5px}.model-controls input:checked+label{background:#dcefe5;color:#176e5c;font-weight:700}.model-controls input:focus-visible+label{outline:3px solid #167b67}.model-panes{flex-basis:100%;margin-top:12px}.model-panes>div{display:none}.model-controls:has(#model-diff:checked) .model-diff,.model-controls:has(#model-before:checked) .model-before,.model-controls:has(#model-after:checked) .model-after{display:block}.model-panes svg{display:block;width:100%;max-height:450px;border:1px solid #e5eeea;border-radius:7px;background:#fcfdfc}.model-panes svg text{font:14px sans-serif;fill:#192b27}.model-note{font-size:12px;margin-top:16px}.model-empty{padding:24px;background:#f6f8f7}`;
