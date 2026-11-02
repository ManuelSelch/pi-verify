import path from "node:path";
import type { ArtifactEntry, VerificationReport } from "../../report.js";
import { conceptualCss, conceptualHtml } from "../../conceptual-model/html.js";

const escape = (value: unknown): string => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

const sections = [
  ["overview", "Overview", "◫"], ["changes", "Changes", "⌘"], ["tests-coverage", "Tests & coverage", "◉"],
  ["complexity", "Complexity", "⌁"], ["architecture", "Architecture", "▦"], ["evidence", "Evidence", "▧"],
] as const;

// Only files copied into this bundle's artifacts directory can become links.
function artifactLink(artifact: ArtifactEntry, directory: string): string | null {
  const artifactRoot = path.resolve(directory, "..", "artifacts");
  const absolute = path.resolve(artifact.path);
  const inside = path.relative(artifactRoot, absolute);
  if (!inside || inside.startsWith(`..${path.sep}`) || inside === ".." || path.isAbsolute(inside)) return null;
  return path.relative(directory, absolute).split(path.sep).map(encodeURIComponent).join("/");
}

function evidenceCard(artifact: ArtifactEntry, directory: string): string {
  const href = artifactLink(artifact, directory);
  const title = escape(artifact.label);
  const description = escape(artifact.description || artifact.type || "File");
  if (!href) return `<article class="evidence-item"><h3>${title}</h3><p>Artifact unavailable: not inside this bundle.</p></article>`;
  const safeHref = escape(href);
  const image = artifact.type === "screenshot" && /\.(png|jpe?g|gif|webp)$/i.test(artifact.path);
  return `<article class="evidence-item"><div class="evidence-heading"><div><h3>${title}</h3><p>${description}</p></div><a href="${safeHref}" download>Download</a></div>${image ? `<a href="${safeHref}" download aria-label="Download ${title}"><img src="${safeHref}" alt="${title}"></a>` : `<p><a href="${safeHref}" download>Download ${title}</a></p>`}</article>`;
}

function unavailable(title: string, limitations: string[] = []): string {
  return `<div class="panel"><div class="panel-head"><h2>${escape(title)}</h2><span class="badge warning">Unavailable</span></div><p>${escape(limitations.join(" ") || "Analysis has not been collected.")}</p></div>`;
}

export function reportHtml(report: VerificationReport, directory: string): string {
  const review = report.review;
  const comparison = review?.comparison;
  const checks = report.checks ?? [];
  const changes = report.changes ?? [];
  const artifacts = report.artifacts ?? [];
  const limitations = [...(report.limitations ?? []), ...(report.skipped ?? []).map((item) => `Skipped: ${item}`)];
  const source = report.source ?? {};
  const branch = typeof source.branch === "string" ? source.branch : "Unknown branch";
  const base = comparison?.base ?? "Unavailable";
  const target = comparison?.target ?? "Unavailable";
  const checksList = checks.length ? checks.map((check) => `<li><div><strong>${escape(check.command)}</strong>${check.note ? `<p>${escape(check.note)}</p>` : ""}</div><span class="badge">${escape(check.outcome)}</span></li>`).join("") : "<li>No checks reported.</li>";
  const changesList = changes.length ? changes.map((change) => `<details><summary>${escape(change.file)}</summary><p>${escape(change.summary)}</p></details>`).join("") : "<p>No agent-reported changes provided.</p>";
  const evidenceList = artifacts.length ? artifacts.map((artifact) => evidenceCard(artifact, directory)).join("") : "<p>No evidence attached.</p>";
  const limitationsList = limitations.length ? `<div class="notice"><h2>Limitations</h2><ul>${limitations.map((item) => `<li>${escape(item)}</li>`).join("")}</ul></div>` : "";
  const changeNotice = review?.sections.changes.limitations.join(" ") || "Independent changed-file analysis is unavailable.";
  const unavailableSection = (id: "testsCoverage" | "complexity" | "architecture", title: string) => unavailable(title, review?.sections[id].limitations);
  const nav = sections.map(([id, label, icon]) => `<a href="#${id}"><span aria-hidden="true">${icon}</span>${escape(label)}</a>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Verification report</title><style>${css}${conceptualCss}</style></head>
<body><a class="skip" href="#main">Skip to report</a><div class="app"><aside class="sidebar"><div class="brand"><span class="brand-icon">✓</span><strong>verify</strong><span class="brand-tag">REPORT</span></div><p class="side-label">WORKSPACE</p><div class="project"><b>${escape(branch)}</b><small>Local review</small></div><p class="side-label">REVIEW</p><nav aria-label="Report sections">${nav}</nav><p class="side-bottom">Generated locally<br><small>Your selected evidence stays with the report</small></p></aside>
<main id="main"><div class="breadcrumb">pi-verify <span>/</span> verification report</div><header><div class="eyebrow">● &nbsp; VERIFICATION REPORT</div><h1>Review</h1><div class="context"><span>${escape(branch)}</span><span>Base <b>${escape(base)}</b></span><span>Target <b>${escape(target)}</b></span></div></header>
<section class="page" id="overview"><div class="summary"><div><h2>${escape(report.verdict)} <span class="badge">Agent-reported checks</span></h2><p>${escape(report.goal)}</p></div><div class="stats"><div><b>${checks.filter((item) => item.outcome === "passed").length} / ${checks.length}</b><small>checks passed</small></div><div><b>${artifacts.length}</b><small>attachments</small></div></div></div><div class="section-title"><h2>Review at a glance</h2><span>Evidence from this run</span></div><div class="grid">${unavailableSection("testsCoverage", "Changed-line coverage")}<div class="panel"><div class="panel-head"><div><h2>Checks run</h2><p>Agent-reported, not independently collected</p></div></div><ul class="checks">${checksList}</ul></div></div>${limitationsList}</section>
<section class="page" id="changes"><div class="panel"><div class="panel-head"><div><h2>Changed files</h2><p>Agent-reported summaries; not independently collected</p></div></div><p class="note">${escape(changeNotice)}</p><div class="file-list">${changesList}</div></div></section>
<section class="page" id="tests-coverage">${unavailableSection("testsCoverage", "Tests & coverage")}</section>
<section class="page" id="complexity">${unavailableSection("complexity", "Complexity")}</section>
<section class="page" id="architecture">${review?.conceptualModel ? conceptualHtml(review.conceptualModel) : unavailableSection("architecture", "Architecture")}</section>
<section class="page" id="evidence"><div class="panel"><div class="panel-head"><div><h2>Evidence</h2><p>Selected artifacts from this review</p></div><span class="badge">${artifacts.length} items</span></div><div class="evidence-list">${evidenceList}</div></div></section>
<footer>PI VERIFY <span>·</span> A local, evidence-first review</footer></main></div></body></html>\n`;
}

const css = `
*{box-sizing:border-box}body{margin:0;background:#f8faf9;color:#192b27;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:#176e5c}a:focus-visible,summary:focus-visible{outline:3px solid #167b67;outline-offset:3px}.skip{position:absolute;top:-100px;left:8px;background:white;padding:8px;z-index:3}.skip:focus{top:8px}.app{display:flex;min-height:100vh}.sidebar{width:235px;flex:none;background:#fff;border-right:1px solid #e2ebe6;padding:26px 16px;display:flex;flex-direction:column}.brand{display:flex;align-items:center;gap:9px;padding:0 8px;font-size:21px;letter-spacing:-1px}.brand-icon{background:#167b67;color:#fff;border-radius:8px;width:30px;height:30px;text-align:center}.brand-tag,.badge{font-size:10px;letter-spacing:.4px;color:#176e5c;background:#e8f5ee;padding:4px 7px;border-radius:5px}.side-label{font-size:10px;letter-spacing:1px;color:#61776c;font-weight:700;margin:38px 8px 12px}.project{padding:10px;border:1px solid #e5eeea;border-radius:8px;overflow-wrap:anywhere}.project b,.project small{display:block}.project small,.side-bottom{font-size:11px;color:#627a6e}nav{display:grid;gap:4px}nav a{border-radius:7px;color:#526c5f;padding:10px;display:flex;align-items:center;gap:10px;text-decoration:none}nav a:hover,nav a:focus-visible{background:#edf7f3;color:#176e5c}nav a span{font-size:17px;width:20px}.side-bottom{margin-top:auto;border-top:1px solid #edf1ef;padding:20px 6px 0}main{min-width:0;width:100%;max-width:1500px;margin:auto;padding:30px 48px}.breadcrumb{font-size:12px;color:#647b6f}.breadcrumb span,footer span{margin:0 8px;color:#99aaa1}header{margin:42px 0 27px}.eyebrow{color:#528470;font-size:10px;letter-spacing:1px;font-weight:700}h1{font-size:29px;letter-spacing:-1px;margin:10px 0 18px}h2{font-size:15px;margin:0}h3{font-size:14px;margin:0}p{color:#566d61;margin:5px 0}.context{display:flex;flex-wrap:wrap;gap:16px;color:#64796f;font-size:12px;overflow-wrap:anywhere}.context b{font-weight:600}.page:not(#overview){display:none}main:has(.page:target) .page{display:none}main:has(.page:target) .page:target{display:block}.summary{background:#f0f8f4;border:1px solid #dbeee4;border-radius:10px;padding:21px 24px;display:flex;justify-content:space-between;align-items:center;gap:25px}.summary p{margin-top:8px}.stats{display:flex;gap:36px}.stats b,.stats small{display:block}.stats b{font-size:21px}.stats small{font-size:11px;color:#60796c;white-space:nowrap}.section-title{display:flex;justify-content:space-between;margin:35px 0 14px}.section-title span{font-size:11px;color:#61786c}.grid{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(260px,.85fr);gap:17px}.panel{background:#fff;border:1px solid #e2ebe6;border-radius:10px;box-shadow:0 3px 12px #274b3a07;padding:20px;min-width:0;overflow-wrap:anywhere}.panel-head,.evidence-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:15px}.panel-head p{font-size:12px}.warning{background:#fff4de;color:#825a05}.checks{list-style:none;margin:0;padding:0}.checks li{border-top:1px solid #edf2ef;padding:12px 0;display:flex;justify-content:space-between;gap:10px}.checks p{font-size:12px}.notice{margin-top:20px;border:1px solid #f1dfb8;background:#fffbf1;border-radius:10px;padding:18px}.notice ul{margin-bottom:0}.note{background:#f6f8f7;padding:12px;border-radius:6px}.file-list details{border-top:1px solid #edf2ef;padding:14px 0}.file-list summary{cursor:pointer;font-weight:600}.file-list details p{padding-left:18px}.evidence-item{border-top:1px solid #edf2ef;padding:18px 0}.evidence-item img{display:block;width:auto;max-width:100%;height:auto;margin-top:15px;border:1px solid #e2ebe6;border-radius:6px}.evidence-item a{overflow-wrap:anywhere}footer{padding:42px 0 8px;font-size:10px;letter-spacing:.4px;color:#627a6e}@media(max-width:760px){.app{display:block}.sidebar{width:auto;border-right:0;border-bottom:1px solid #e2ebe6;padding:16px}.side-label,.project,.side-bottom{display:none}nav{display:flex;overflow-x:auto;margin-top:14px}nav a{white-space:nowrap;padding:9px}main{padding:24px 20px}header{margin:25px 0}.grid{grid-template-columns:1fr}.summary{align-items:flex-start;flex-direction:column}.stats{gap:24px}.section-title{gap:10px}.context{gap:8px;flex-direction:column}}
`;
