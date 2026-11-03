import type { ArchitectureReview } from "./collect.js";
import type { ArchitectureModel, ArchitectureSlice } from "./model.js";

const esc = (v: unknown) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const number = (v: number) => Number.isFinite(v) ? Math.max(-10000, Math.min(10000, v)) : 0;

/** Where the ray from a box centre toward (tx, ty) crosses that box's border. */
function borderPoint(slice: ArchitectureSlice, tx: number, ty: number): { x: number; y: number } | null {
  const cx = number(slice.x + slice.width / 2), cy = number(slice.y + slice.height / 2);
  const dx = tx - cx, dy = ty - cy;
  if (dx === 0 && dy === 0) return null;
  const halfWidth = Math.max(1, number(slice.width)) / 2, halfHeight = Math.max(1, number(slice.height)) / 2;
  const scale = Math.min(dx === 0 ? Infinity : halfWidth / Math.abs(dx), dy === 0 ? Infinity : halfHeight / Math.abs(dy));
  return { x: cx + dx * scale, y: cy + dy * scale };
}

function picture(model: ArchitectureModel | null, added: string[] = []): string {
  if (!model) return '<p class="model-empty">No architecture diagram existed at this revision.</p>';
  const slices = model.slices;
  const width = Math.max(400, ...slices.map(s => number(s.x + s.width + 40)));
  const height = Math.max(200, ...slices.map(s => number(s.y + s.height + 40)));
  const arrows = `<defs><marker id="arch-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#667085"/></marker><marker id="arch-arrow-added" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#2e7d32"/></marker></defs>`;
  const lines = model.edges.map(edge => {
    const from = slices.find(s => s.name === edge.from), to = slices.find(s => s.name === edge.to);
    if (!from || !to) return "";
    const start = borderPoint(from, number(to.x + to.width / 2), number(to.y + to.height / 2));
    const end = borderPoint(to, number(from.x + from.width / 2), number(from.y + from.height / 2));
    if (!start || !end) return "";
    const dx = end.x - start.x, dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length < 5) return "";
    const gap = 2, ux = dx / length, uy = dy / length;
    const x1 = start.x + ux * gap, y1 = start.y + uy * gap, x2 = end.x - ux * gap, y2 = end.y - uy * gap;
    const isAdded = added.includes(`association ${edge.key}`);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${isAdded ? "#2e7d32" : "#667085"}" stroke-width="2" marker-end="url(#${isAdded ? "arch-arrow-added" : "arch-arrow"})"/>`;
  }).join("");
  const nodes = slices.map(s => `<g><rect x="${number(s.x)}" y="${number(s.y)}" width="${Math.max(1, number(s.width))}" height="${Math.max(1, number(s.height))}" rx="6" fill="${added.includes(`slice ${s.name}`) ? "#e0f6e8" : "#ffffff"}" stroke="${added.includes(`slice ${s.name}`) ? "#2e7d32" : "#667085"}" stroke-width="2"${s.placed === "auto" ? ' stroke-dasharray="5 3"' : ""}/><text text-anchor="middle" x="${number(s.x + s.width / 2)}" y="${number(s.y + s.height / 2 + 5)}">${esc(s.label)}</text></g>`).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Architecture diagram">${arrows}${lines}${nodes}</svg>`;
}

export function architectureHtml(review: ArchitectureReview): string {
  const delta = review.delta;
  const status = review.guardrail.status;
  const messages = review.guardrail.diagnostics.map(item => `<li>${esc(item)}</li>`).join("");
  const unused = review.guardrail.unused.length ? `<p class="model-note">Allowed but unused: ${esc(review.guardrail.unused.join(", "))}</p>` : "";
  const staged = (review.after?.slices ?? []).filter(slice => slice.placed === "auto").map(slice => slice.name);
  const awaiting = staged.length ? `<p class="model-note">Awaiting human placement: ${esc(staged.join(", "))}</p>` : "";
  const items = delta ? [...delta.removed.map(x => `− ${x}`), ...delta.changed.map(x => `~ ${x}`)] : [];
  const changes = delta ? (items.length ? `<ul>${items.map(i => `<li>${esc(i)}</li>`).join("")}</ul>` : "") : "<p>Comparison unavailable: no verified base revision.</p>";
  return `<div class="panel model-panel"><div class="panel-head"><h2>Architecture</h2>${status === "passed" ? '<span class="status-dot" role="img" aria-label="Architecture guardrail passed" title="Architecture guardrail passed"></span>' : `<span class="badge warning">Guardrail ${esc(status)}</span>`}</div>${messages ? `<ul>${messages}</ul>` : ""}${unused}${awaiting}
  <div class="model-controls"><input type="radio" id="arch-diff" name="arch-view" checked><label for="arch-diff">Changes</label><input type="radio" id="arch-before" name="arch-view"><label for="arch-before">Before</label><input type="radio" id="arch-after" name="arch-view"><label for="arch-after">After</label><div class="model-panes"><div class="model-diff">${picture(review.after, delta?.added)}${changes}</div><div class="model-before">${review.base ? picture(review.before) : '<p>Base revision unavailable.</p>'}</div><div class="model-after">${picture(review.after)}</div></div></div>
  </div>`;
}

export const architectureCss = `.status-dot{display:block;width:10px;height:10px;border-radius:50%;background:#2e9b5f;flex:none;margin:4px 2px}.model-controls{display:flex;flex-wrap:wrap;gap:4px;margin-top:20px}.model-controls input{position:absolute;opacity:0}.model-controls label{cursor:pointer;padding:7px 12px;background:#f0f5f2;border-radius:5px}.model-controls input:checked+label{background:#dcefe5;color:#176e5c;font-weight:700}.model-controls input:focus-visible+label{outline:3px solid #167b67}.model-panes{flex-basis:100%;margin-top:12px}.model-panes>div{display:none}.model-controls:has(#arch-diff:checked) .model-diff,.model-controls:has(#arch-before:checked) .model-before,.model-controls:has(#arch-after:checked) .model-after{display:block}.model-panes svg{display:block;width:100%;max-height:450px;border:1px solid #e5eeea;border-radius:7px;background:#fcfdfc}.model-panes svg text{font:14px sans-serif;fill:#192b27}.model-note{font-size:12px;margin-top:16px}.model-empty{padding:24px;background:#f6f8f7}`;
