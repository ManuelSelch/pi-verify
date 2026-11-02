import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider, createTheme, Badge, SegmentedControl } from "@mantine/core";
import { IconActivity, IconBox, IconCheck, IconGitBranch } from "@tabler/icons-react";
import { Agentation } from "agentation";
import "@mantine/core/styles.css";
import "./styles.css";

type Page = "Tests & coverage" | "Architecture";
const navigation: {name: Page; icon: typeof IconBox}[] = [
  {name: "Tests & coverage", icon: IconActivity}, {name: "Architecture", icon: IconBox},
];
const theme = createTheme({ primaryColor: "teal", defaultRadius: "md", fontFamily: "Inter, system-ui, sans-serif" });

function Sidebar({page, select}: {page: Page; select: (page: Page) => void}) {
  return <aside><div className="brand"><span><IconCheck size={18}/></span><strong>verify</strong></div><div className="side-label">REVIEW</div><nav aria-label="Report sections">{navigation.map(({name, icon: Icon}) => <button type="button" className={page === name ? "selected" : ""} key={name} onClick={() => select(name)}><Icon size={18}/>{name}</button>)}</nav></aside>;
}
function Context() {
  return <><div className="breadcrumb">pi-verify <span>/</span> verification report</div><header><div className="eyebrow">● &nbsp; VERIFICATION REPORT</div><h1>Review</h1><div className="context"><span><IconGitBranch size={15}/> feat/review-model</span><span>Base <b>a91f104</b></span><span>Target <b>e036326</b></span><Badge size="sm" color="gray" variant="light">Illustrative data</Badge></div></header></>;
}
const tests = [
  {name: "records a report section", file: "tests/review-report.test.ts:12", changed: false, hits: 3},
  {name: "checks model associations", file: "tests/conceptual-model.test.ts:18", changed: true, hits: 2},
  {name: "preserves attached evidence", file: "tests/report.test.ts:34", changed: false, hits: 0},
];
function Coverage() {
  const [filter, setFilter] = useState("Tests covering changes");
  const shown = tests.filter(test => filter === "All tests" || (filter === "Changed tests" ? test.changed : test.hits > 0));
  return <section className="panel"><div className="panel-heading"><h2>Tests &amp; coverage</h2></div><div className="filter"><SegmentedControl fullWidth value={filter} onChange={setFilter} data={["Tests covering changes", "Changed tests", "All tests"]}/></div><div className="test-list" key={filter}>{shown.map(test => <details key={test.name}><summary><IconCheck size={16} className="success"/><b>{test.name}</b><span>{test.hits ? `${test.hits} changed-line hits` : "No changed-line hits"}</span></summary><div className="test-detail"><small>{test.file} · passed · {test.changed ? "changed test" : "unchanged test"}</small><pre>{`test("${test.name}", async () => {\n  // Illustrative test source\n  assert.equal(result.status, "available");\n});`}</pre>{test.hits > 0 && <details><summary>Show changed-code hits</summary><pre className="hit">{`  const result = collectReviewReport(scope);\n  return { ...result, conceptualModel };\n}`}</pre></details>}</div></details>)}</div><details className="gaps"><summary><span>1 uncovered changed line</span><Badge color="yellow" variant="light">Review</Badge></summary><pre>{`src/review-report/infra/collect.ts\n  42  return unavailable("Conceptual model");`}</pre></details></section>;
}
function Diagram({view}: {view: string}) {
  return <svg viewBox="0 0 700 220" role="img" aria-label="Illustrative conceptual model">
    <path d="M250 110 H450" stroke="#728c80" strokeWidth="2"/>
    <rect x="70" y="75" width="180" height="70" rx="6" fill="#f2f8f5" stroke="#769989" strokeWidth="2"/>
    <text x="160" y="117" textAnchor="middle">ReviewReport</text>
    <rect x="450" y="75" width="180" height="70" rx="6" fill="#f2f8f5" stroke="#769989" strokeWidth="2"/>
    <text x="540" y="117" textAnchor="middle">ReviewSection</text>
    {view !== "Before" && <><path d="M250 110 H450" stroke={view === "Changes" ? "#2e9b5f" : "#728c80"} strokeWidth="3"/><text x="425" y="102">*</text></>}
  </svg>;
}
function Architecture() {
  const [view, setView] = useState("Changes");
  return <section className="panel"><div className="panel-heading"><h2>Conceptual model</h2><span className="status-dot" role="img" aria-label="Guardrail passed" title="Guardrail passed"/></div><div className="toolbar"><SegmentedControl value={view} onChange={setView} data={["Changes", "Before", "After"]}/></div><div className="diagram"><Diagram view={view}/></div></section>;
}
function App() {
  const params = new URLSearchParams(window.location.search);
  const initial: Page = params.get("view") === "architecture" ? "Architecture" : "Tests & coverage";
  const [page, setPage] = useState<Page>(initial);
  return <MantineProvider theme={theme}><div className="app"><Sidebar page={page} select={setPage}/><main><Context/>{page === "Tests & coverage" ? <Coverage/> : <Architecture/>}</main></div>{import.meta.env.DEV && <Agentation/>}</MantineProvider>;
}
createRoot(document.getElementById("root")!).render(<App/>);
