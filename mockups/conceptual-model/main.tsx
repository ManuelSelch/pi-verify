import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider, Button, Badge, SegmentedControl } from "@mantine/core";
import { IconGitBranch, IconExternalLink } from "@tabler/icons-react";
import { Agentation } from "agentation";
import "@mantine/core/styles.css";
import "./styles.css";

function Diagram({view}: {view: string}) {
  return <svg viewBox="0 0 720 310" role="img" aria-label="Illustrative conceptual model, not collected data">
    <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="none" stroke="#637a6e"/></marker></defs>
    <path d="M208 93 L310 93 M438 93 L532 93 M375 130 L375 214" fill="none" stroke="#637a6e" strokeWidth="2" markerEnd="url(#arrow)"/>
    <g className="box"><rect x="55" y="56" width="153" height="74" rx="6"/><text x="131" y="100">Extension</text></g>
    <g className="box"><rect x="310" y="56" width="128" height="74" rx="6"/><text x="374" y="100">Verification</text></g>
    <g className="box"><rect x="532" y="56" width="145" height="74" rx="6"/><text x="604" y="100">Git scope</text></g>
    <g className={view === "Changes" ? "box added" : "box"}><rect x="300" y="214" width="150" height="74" rx="6"/><text x="375" y="258">Review report</text></g>
  </svg>;
}
function App() {
  const [view, setView] = useState("Changes");
  return <MantineProvider><div className="app"><aside><strong className="brand">✓ &nbsp; verify</strong><small>REVIEW</small><a>Overview</a><a>Changes</a><a>Tests &amp; coverage</a><a>Complexity</a><a className="active">Architecture</a><a>Evidence</a></aside><main>
    <div className="crumb">pi-verify &nbsp; / &nbsp; verification report</div><h1>Conceptual model</h1><p>Hand-arranged architecture checked against code</p>
    <div className="context"><IconGitBranch size={16}/> Illustrative branch &nbsp; · &nbsp; Base abc123 &nbsp; · &nbsp; Target def456</div>
    <section><div className="heading"><div><h2>Conceptual model</h2><p>Static component relationships · sample data</p></div><Badge color="green">Guardrail passed</Badge></div>
    <div className="toolbar"><SegmentedControl value={view} onChange={setView} data={["Changes", "Before", "After"]}/><Button variant="light" rightSection={<IconExternalLink size={15}/>}>Open draw.io file</Button></div>
    <div className="diagram"><Diagram view={view}/></div><div className="legend"><span className="dot"/> Added &nbsp;&nbsp; <span className="removed"/> Removed &nbsp;&nbsp; Layout changes are not semantic changes</div>
    <div className="summary"><b>1 added component</b><span>Review report</span><b>0 removed</b></div>
    <div className="foot">Illustrative only — not a real comparison or guardrail result. The first introduction of a diagram will be labelled as absent on the base rather than presented as historical evidence.</div></section>
  </main></div>{import.meta.env.DEV && <Agentation/>}</MantineProvider>;
}
createRoot(document.getElementById("root")!).render(<App/>);
