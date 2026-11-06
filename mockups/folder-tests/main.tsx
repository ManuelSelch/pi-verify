import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider, createTheme, Badge, Button, SegmentedControl, TextInput } from '@mantine/core';
import { IconCheck, IconFolder, IconFileCode, IconSearch, IconActivity, IconBox, IconGitBranch } from '@tabler/icons-react';
import { Agentation } from 'agentation';
import '@mantine/core/styles.css';
import './styles.css';

type Test = { name: string; file: string; failed?: boolean; changed?: boolean; hits: number };
const tests: Test[] = [
  {file:'src/features/calendar/__tests__/availability.test.ts', name:'finds an available appointment', hits:4},
  {file:'src/features/calendar/__tests__/availability.test.ts', name:'rejects overlapping appointments', hits:2, changed:true},
  {file:'src/features/calendar/__tests__/integration/calendar.test.ts', name:'preserves the original appointment when rejected', hits:12},
  {file:'src/features/calendar/__tests__/integration/calendar-proposals.test.ts', name:'updates a confirmed calendar proposal', hits:8, changed:true},
  {file:'src/features/calendar/adapters/__tests__/caldav.test.ts', name:'persists a calendar event', hits:0},
  {file:'src/features/reply-drafts/__tests__/service.test.ts', name:'creates a reply draft from a proposal', hits:5, changed:true},
  {file:'src/features/reply-drafts/__tests__/integration/reply-drafts.test.ts', name:'keeps the original message reference', hits:3},
  {file:'src/app/dashboard/__tests__/integration/dashboard.test.ts', name:'shows confirmed appointments alongside proposals', hits:9},
  {file:'src/app/dashboard/__tests__/integration/dashboard.test.ts', name:'shows an error when confirmation fails', hits:6, failed:true, changed:true},
  {file:'src/app/adapters/__tests__/api.test.ts', name:'returns the current application state', hits:0},
  {file:'tests/unit/date-format.test.ts', name:'formats an appointment date', hits:0},
  {file:'tests/integration/import.test.ts', name:'imports appointments from a spreadsheet', hits:7},
];
type Node = { path:string; label:string; children:Node[]; tests:Test[]; file:boolean };
function tree(items:Test[]):Node[] {
  const roots:Node[]=[];
  for(const test of items){
    const parts=test.file.split('/');
    const marker=parts.findIndex(part=>part==='__tests__'||part==='tests');
    // Keep the owning path as one group, never as a nested directory tree.
    // A repository-root tests/ directory keeps its name as the group label.
    const boundary=marker>0?marker:marker===0?1:parts.length-1;
    const owner=parts.slice(0,boundary).join('/');
    const label=parts.slice(marker>0?marker+1:boundary).join('/');
    let group=roots.find(n=>n.path===owner);
    if(!group){group={path:owner,label:owner,children:[],tests:[],file:false};roots.push(group);}
    group.tests.push(test);
    let file=group.children.find(n=>n.path===test.file);
    if(!file){file={path:test.file,label,children:[],tests:[],file:true};group.children.push(file);}
    file.tests.push(test);
  }
  return roots.sort((a,b)=>a.path.localeCompare(b.path)).map(group=>({...group,children:group.children.sort((a,b)=>a.label.localeCompare(b.label))}));
}
function TestRow({test}:{test:Test}){return <details className="test"><summary><span className={test.failed?'failed':'success'}>{test.failed?'×':'✓'}</span><span className="test-name">{test.name}</span>{test.changed&&<Badge size="xs" color="blue" variant="light">Changed</Badge>}<span className="meta">{test.hits} hits</span></summary><div className="test-content"><p>{test.file}:42 · {test.failed?'failed':'passed'} · illustrative evidence</p><pre>{`test('${test.name}', async () => {\n  const result = await runScenario();\n  expect(result.status).toBe('confirmed');\n});`}</pre>{test.failed&&<p className="failed">Expected: confirmed · Received: unavailable</p>}<details><summary>Show changed-code hits ({test.hits})</summary><pre>Illustrative changed-code evidence would appear here.</pre></details></div></details>}
function FolderNode({node,mode}:{node:Node;mode:'default'|'open'|'closed'}){
  const failures=node.tests.filter(t=>t.failed).length;
  const open=mode==='open'||(mode==='default'&&failures>0);
  return <details className={node.file?'tree-node file':'tree-node folder'} open={open}><summary>{node.file?<IconFileCode size={16}/>:<IconFolder size={17}/>}<span className="node-label">{node.label}</span><span className="counts">{node.tests.length} {node.tests.length===1?'test':'tests'}</span>{failures>0?<Badge size="xs" color="red" variant="light">{failures} failed</Badge>:<IconCheck className="success" size={15} aria-label="All passing"/>}</summary><div className="children">{node.file?node.tests.map(t=><TestRow key={t.name} test={t}/>):node.children.map(n=><FolderNode key={n.path} node={n} mode={mode}/>)}</div></details>;
}
function App(){
  const [view,setView]=useState('covering');const [search,setSearch]=useState('');const [mode,setMode]=useState<'default'|'open'|'closed'>('default');const [revision,setRevision]=useState(0);
  const scoped=tests.filter(t=>view==='all'||(view==='changed'?t.changed:t.hits>0));
  const shown=scoped.filter(t=>(t.file+' '+t.name).toLowerCase().includes(search.toLowerCase()));
  function expand(next:'open'|'closed'){setMode(next);setRevision(r=>r+1);}
  return <MantineProvider theme={createTheme({primaryColor:'teal',fontFamily:'system-ui, sans-serif',defaultRadius:'md'})}><div className="app"><aside><div className="brand"><span><IconCheck size={18}/></span><strong>verify</strong></div><div className="side-label">REVIEW</div><nav><div className="nav-selected"><IconActivity size={18}/>Tests &amp; coverage</div><div><IconBox size={18}/>Architecture</div></nav><p className="prototype-note">Folder grouping mockup<br/>Illustrative tests &amp; outcomes</p></aside><main><div className="breadcrumb">pi-verify / verification report</div><header><div className="eyebrow">VERIFICATION REPORT</div><h1>Review</h1><div className="context"><IconGitBranch size={15}/> feat/architecture-cleanup <Badge size="sm" color="gray">Mockup · 12 sample tests</Badge></div></header><section className="panel"><div className="panel-heading"><h2>Tests &amp; coverage</h2><Badge variant="light" color="red">1 illustrative failure</Badge></div><p className="intro">One group per owning folder. Test-only directories are hidden; subpaths stay on the file row.</p><SegmentedControl className="filters" value={view} onChange={v=>{setView(v);setMode('default');}} data={[{value:'covering',label:'Covering changes · 9'},{value:'changed',label:'Changed tests · 4'},{value:'all',label:'All tests · 12'}]}/><div className="tools"><TextInput aria-label="Search tests and paths" placeholder="Search tests or paths…" leftSection={<IconSearch size={15}/>} value={search} onChange={e=>setSearch(e.currentTarget.value)}/><div><Button variant="subtle" size="compact-xs" onClick={()=>expand('open')}>Expand all</Button><Button variant="subtle" size="compact-xs" onClick={()=>expand('closed')}>Collapse all</Button></div></div><div className="list-caption"><span>FOLDER / FILE / TEST</span><span>{shown.length} of {scoped.length} tests</span></div><div className="tree" key={view+search+revision}>{tree(shown).map(n=><FolderNode key={n.path} node={n} mode={mode}/>)}</div>{!shown.length&&<p className="empty">No matching tests. Try another name or path.</p>}<p className="footnote">No intermediate folder levels. Full test paths remain in the evidence and search. Groups with failures start expanded.</p></section><p className="footer">Choose “All tests” to compare colocated feature tests with a shared tests/ folder.</p></main></div>{import.meta.env.DEV&&<Agentation/>}</MantineProvider>;
}
createRoot(document.getElementById('root')!).render(<App/>);
