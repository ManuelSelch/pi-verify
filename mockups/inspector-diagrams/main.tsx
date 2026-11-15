import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider, createTheme, Button, ActionIcon, Modal, Group, Badge, Alert } from '@mantine/core';
import { IconArrowsMaximize, IconFileText, IconAlertCircle, IconZoomIn, IconZoomOut, IconSitemap } from '@tabler/icons-react';
import { Agentation } from 'agentation';
import '@mantine/core/styles.css';
import './styles.css';

type Diagram = { title: string; file: string; line: number; source: string; invalid?: boolean };
const diagrams: Diagram[] = [
  { title: 'System overview', file: 'docs/architecture.md', line: 12, source: 'flowchart LR\n  CLI[CLI & extension] --> Core[Collection & analysis]\n  Core --> Reports[HTML & JSON reports]' },
  { title: 'Report generation', file: 'docs/architecture.md', line: 34, source: 'flowchart LR\n  Discover[Discover reports] --> Parse[Parse evidence]\n  Parse --> Render[Render inspector]' },
  { title: 'Verification lifecycle', file: 'docs/verification.md', line: 18, source: 'stateDiagram-v2\n  [*] --> Pending\n  Pending --> Running\n  Running --> Passed' },
  { title: 'Dependency map', file: 'docs/verification.md', line: 43, source: 'flowchart LR\n  A --> [broken', invalid: true },
];
function DiagramPreview({ diagram, zoom = 1, presentation = false }: { diagram: Diagram; zoom?: number; presentation?: boolean }) {
  const canvas = useRef<HTMLDivElement>(null);
  const [fitWidth, setFitWidth] = useState(560);
  useEffect(() => {
    if (!presentation || !canvas.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setFitWidth(Math.max(1, Math.min(width, height * 700 / 160, 1000)));
    });
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, [presentation]);
  const width = zoom * (presentation ? fitWidth : 560);
  const labels = diagram.title === 'Report generation' ? ['Discover reports', 'Parse evidence', 'Render inspector'] : diagram.title === 'Verification lifecycle' ? ['Pending', 'Running', 'Passed'] : ['CLI & extension', 'Collection & analysis', 'HTML & JSON reports'];
  return <div className="diagram-canvas" ref={canvas}><svg role="img" aria-label={diagram.title} viewBox="0 0 700 160" style={{ width: `${width}px`, height: presentation ? `${width * 160 / 700}px` : undefined }}><defs><marker id={`arrow-${diagram.line}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#6d8a78"/></marker></defs>{labels.map((label, i) => <g key={label}><rect x={15 + i * 240} y="49" width="190" height="62" rx="5" fill={i === 1 ? '#edf6ef' : '#fff'} stroke="#86a591"/><text x={110 + i * 240} y="85" textAnchor="middle" fill="#365740" fontSize="13">{label}</text>{i < 2 && <path d={`M${205 + i * 240} 80h48`} stroke="#6d8a78" markerEnd={`url(#arrow-${diagram.line})`}/>}</g>)}</svg></div>;
}
function DiagramCard({ diagram, onExpand }: { diagram: Diagram; onExpand: () => void }) {
  return <section className="diagram-card"><div className="card-heading"><div><h3>{diagram.title}</h3><span className="document-location"><IconFileText size={14}/>{diagram.file}:{diagram.line}</span></div><Group gap="xs">{diagram.invalid ? <Badge color="red" variant="light">Invalid</Badge> : <ActionIcon className="expand-control" variant="subtle" color="gray" size={28} aria-label={`Expand ${diagram.title}`} onClick={onExpand}><IconArrowsMaximize size={15}/></ActionIcon>}</Group></div>{diagram.invalid ? <div className="error-body"><Alert color="red" icon={<IconAlertCircle size={17}/>} title="Unable to render this diagram">Unexpected token on Mermaid line 2. Other diagrams are still available.</Alert></div> : <DiagramPreview diagram={diagram}/>}</section>;
}
function App() {
  const state = new URLSearchParams(location.search).get('state');
  const [selected, setSelected] = useState<Diagram | null>(null);
  const [zoom, setZoom] = useState(1);
  const [view, setView] = useState('Diagrams');
  const open = (d: Diagram) => { setSelected(d); setZoom(1); };
  return <><div className="shell"><aside><div className="project"><strong>pi-verify</strong></div><div className="nav-label">WORKSPACE</div><nav>{['Metrics', 'Tests', 'Coverage', 'Diagrams'].map(name => <button key={name} className={view === name ? 'active' : ''} onClick={() => setView(name)}>{name}</button>)}</nav></aside><main><header>{view}</header><div className="content"><div className="eyebrow">LOCAL PROJECT</div><h1>{view}</h1>{view !== 'Diagrams' ? <div className="empty">Existing {view.toLowerCase()} view is unchanged. <Button variant="subtle" onClick={() => setView('Diagrams')}>Back to diagrams</Button></div> : <>{state === 'empty' ? <section className="empty"><IconSitemap size={30}/><h3>No Mermaid diagrams found</h3><p>Add a fenced mermaid block to a Markdown document, then regenerate the inspector report.</p></section> : ['docs/architecture.md', 'docs/verification.md'].map(file => <div className="document-group" key={file}><h2><IconFileText size={16}/>{file}</h2>{diagrams.filter(d => d.file === file).map(d => <DiagramCard key={d.line} diagram={d} onExpand={() => open(d)}/>)}</div>)}</>}</div></main></div><Modal opened={selected !== null} onClose={() => setSelected(null)} title={<div className="presentation-title"><span>{selected?.title}</span><Group gap="xs"><Button variant="default" size="xs" aria-label="Zoom out" onClick={() => setZoom(Math.max(.5, zoom - .25))}><IconZoomOut size={16}/></Button><Button variant="default" size="xs" aria-label="Reset zoom to fit" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</Button><Button variant="default" size="xs" aria-label="Zoom in" onClick={() => setZoom(Math.min(3, zoom + .25))}><IconZoomIn size={16}/></Button></Group></div>} size="calc(100vw - 48px)" classNames={{ content: 'presentation-dialog', body: 'presentation-body', header: 'presentation-header', title: 'presentation-title-slot' }} centered>{selected && <><div className="presentation-stage"><DiagramPreview diagram={selected} zoom={zoom} presentation/></div></>}</Modal>{import.meta.env.DEV && <Agentation/>}</>;
}
createRoot(document.getElementById('root')!).render(<MantineProvider theme={createTheme({ primaryColor: 'teal', fontFamily: 'system-ui, sans-serif', defaultRadius: 'sm' })}><App/></MantineProvider>);
