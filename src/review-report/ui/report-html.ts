import path from "node:path";
import type { ArtifactEntry, VerificationReport } from "../../report.js";
import { conceptualCss, conceptualHtml } from "../../conceptual-model/html.js";
import { sliceCss, sliceHtml } from "../../slice-model/html.js";
import { coverageCss, coverageHtml } from "./coverage-html.js";

const escape = (value: unknown): string => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
function unavailable(title: string, notes: string[] = []): string {
  return `<div class="panel"><div class="panel-head"><h2>${escape(title)}</h2><span class="badge warning">Unavailable</span></div><p>${escape(notes.join(" ") || "Analysis has not been collected.")}</p></div>`;
}
function evidenceCard(artifact: ArtifactEntry, directory: string): string {
  const root = path.resolve(directory, "..", "artifacts");
  const absolute = path.resolve(artifact.path);
  const relative = path.relative(root, absolute);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return `<p>${escape(artifact.label)}: Artifact unavailable: not inside this bundle.</p>`;
  const href = escape(path.relative(directory, absolute).split(path.sep).map(encodeURIComponent).join("/"));
  const image = artifact.type === "screenshot" && /\.(png|jpe?g|gif|webp)$/i.test(artifact.path);
  return `<article><h3>${escape(artifact.label)}</h3><p>${escape(artifact.description ?? artifact.type ?? "File")}</p><a href="${href}" download>Download</a>${image ? `<a href="${href}" download><img src="${href}" alt="${escape(artifact.label)}"></a>` : ""}</article>`;
}
export function reportHtml(report: VerificationReport, directory: string): string {
  const review = report.review;
  const branch = typeof report.source?.branch === "string" ? report.source.branch : "Unknown branch";
  const base = review?.comparison.base ?? "Unavailable", target = review?.comparison.target ?? "Unavailable";
  const coverage = review?.coverage ? coverageHtml(review.coverage) : unavailable("Tests & coverage", review?.sections.testsCoverage.limitations);
  const architecture = review?.conceptualModel || review?.sliceModel
    ? `${review.conceptualModel ? conceptualHtml(review.conceptualModel) : ""}${review.sliceModel ? sliceHtml(review.sliceModel) : ""}`
    : unavailable("Architecture", review?.sections.architecture.limitations);
  const details = `<details class="other-details"><summary>Verification details</summary><h2>${escape(report.verdict)}</h2><p>${escape(report.goal)}</p><p>Checks and changes are agent-reported.</p><ul>${(report.checks ?? []).map(c => `<li>${escape(c.command)} · ${escape(c.outcome)}</li>`).join("")}</ul><h3>Changed files</h3>${(report.changes ?? []).map(c => `<p>${escape(c.file)}: ${escape(c.summary)}</p>`).join("")}<h3>Evidence</h3>${(report.artifacts ?? []).map(a => evidenceCard(a, directory)).join("")}<h3>Limitations</h3><ul>${[...(report.limitations ?? []), ...(report.skipped ?? []).map(x => `Skipped: ${x}`)].map(x => `<li>${escape(x)}</li>`).join("")}</ul></details>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Verification report</title><style>${css}${conceptualCss}${sliceCss}${coverageCss}</style></head>
<body><a class="skip" href="#main">Skip to report</a><div class="app"><aside class="sidebar"><div class="brand"><span class="brand-icon">✓</span><strong>verify</strong></div><p class="side-label">REVIEW</p><nav aria-label="Report sections"><a href="#tests-coverage">◉ &nbsp; Tests &amp; coverage</a><a href="#architecture">▦ &nbsp; Architecture</a></nav></aside>
<main id="main"><div class="breadcrumb">pi-verify / verification report</div><header><div class="eyebrow">● &nbsp; VERIFICATION REPORT</div><h1>Review</h1><div class="context"><span>${escape(branch)}</span><span>Base <b>${escape(base)}</b></span><span>Target <b>${escape(target)}</b></span></div></header>
<section class="page" id="tests-coverage">${coverage}${details}</section><section class="page" id="architecture">${architecture}</section></main></div></body></html>\n`;
}
const css = `
.other-details{margin-top:18px;border:1px solid #e2ebe6;border-radius:10px;padding:16px}.other-details summary{cursor:pointer;font-weight:600}.other-details h2,.other-details h3{margin-top:16px}.other-details img{display:block;max-width:100%;height:auto;margin-top:12px}.other-details article{border-top:1px solid #e2ebe6;padding:12px 0}
*{box-sizing:border-box}body{margin:0;background:#fff;color:#192b27;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:#176e5c}a:focus-visible,summary:focus-visible{outline:3px solid #167b67;outline-offset:3px}.skip{position:absolute;top:-100px;left:8px;background:white;padding:8px;z-index:3}.skip:focus{top:8px}.app{display:flex;min-height:100vh}.sidebar{width:235px;flex:none;background:#fff;border-right:1px solid #e2ebe6;padding:26px 16px}.brand{display:flex;align-items:center;gap:9px;padding:0 8px;font-size:21px;letter-spacing:-1px}.brand-icon{background:#167b67;color:#fff;border-radius:8px;width:30px;height:30px;text-align:center}.side-label{font-size:10px;letter-spacing:1px;color:#61776c;font-weight:700;margin:38px 8px 12px}nav{display:grid;gap:4px}nav a{border-radius:7px;color:#526c5f;padding:10px;text-decoration:none}nav a:hover,nav a:focus-visible{background:#edf7f3;color:#176e5c}main{min-width:0;width:100%;max-width:1500px;margin:0;padding:30px 48px;align-self:flex-start}.breadcrumb{font-size:12px;color:#647b6f}header{margin:42px 0 27px}.eyebrow{color:#528470;font-size:10px;letter-spacing:1px;font-weight:700}h1{font-size:29px;letter-spacing:-1px;margin:10px 0 18px}h2{font-size:15px;margin:0}p{color:#566d61;margin:5px 0}.context{display:flex;flex-wrap:wrap;gap:16px;color:#64796f;font-size:12px;overflow-wrap:anywhere}.context b{font-weight:600}.page:not(#tests-coverage):not(:target){display:none}main:has(.page:target) #tests-coverage:not(:target){display:none}.panel{background:#fff;border:1px solid #e2ebe6;border-radius:10px;box-shadow:0 3px 12px #274b3a07;padding:20px;min-width:0;overflow-wrap:anywhere}.panel-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:15px}.badge{font-size:10px;letter-spacing:.4px;padding:4px 7px;border-radius:5px}.warning{background:#fff4de;color:#825a05}@media(max-width:760px){.app{display:block}.sidebar{width:auto;border-right:0;border-bottom:1px solid #e2ebe6;padding:16px}.side-label{display:none}nav{display:flex;overflow-x:auto;margin-top:14px}nav a{white-space:nowrap;padding:9px}main{padding:24px 20px}header{margin:25px 0}.context{gap:8px;flex-direction:column}}
`;
