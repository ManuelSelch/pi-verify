import './style.css';
import folderIcon from '@tabler/icons/outline/folder.svg?raw';
import fileIcon from '@tabler/icons/outline/file-code.svg?raw';
import chevronDown from '@tabler/icons/outline/chevron-down.svg?raw';
import chevronRight from '@tabler/icons/outline/chevron-right.svg?raw';
import passedIcon from '@tabler/icons/outline/circle-check.svg?raw';
import failedIcon from '@tabler/icons/outline/circle-x.svg?raw';
import skippedIcon from '@tabler/icons/outline/circle-minus.svg?raw';
import { buildCoverageTree, filterCoverageTree, type CoverageNode } from './tree.js';
import { buildTestTree, filterTestTree, type TestNode } from './test-tree.js';

type Test = { suite:string; name:string; status:string; duration?:number; message?:string; file?:string; source?:string; highlightedLines?:string[] };
type File = { path:string; lines:{line:number;hits:number}[]; source?:string; highlightedLines?:string[]; functions?:{found:number;hit:number}; branches?:{found:number;hit:number} };
const data = JSON.parse(document.querySelector('#inspector-data')!.textContent!) as {project:string; tests:Test[]; files:File[]};
const app = document.querySelector<HTMLDivElement>('#app')!;
const escape = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const coverage = (files:File[]) => { const lines=files.flatMap(f=>f.lines); return lines.length ? `${(100*lines.filter(l=>l.hits>0).length/lines.length).toFixed(1)}%` : 'Unavailable'; };
const tree = buildCoverageTree(data.files);
const collapsed = new Set<string>();
const testTree = buildTestTree(data.tests);
const toggledTests = new Set<string>();
let view='Metrics'; let selectedTest:number|null=null; let selectedFile:number|null=null; let filter=''; let testFilter='';
function render() {
  const passed=data.tests.filter(t=>t.status==='passed').length, failed=data.tests.filter(t=>t.status==='failed').length, skipped=data.tests.filter(t=>t.status==='skipped').length;
  app.innerHTML=`<aside><div class="project"><strong>${escape(data.project)}</strong></div><div class="label">WORKSPACE</div><nav>${['Metrics','Tests','Coverage'].map(x=>`<button data-view="${x}" class="${view===x?'active':''}">${x}</button>`).join('')}</nav></aside><main><header>${view}</header><div class="content"><div class="eyebrow">LOCAL PROJECT</div><h1>${view}</h1>${view==='Metrics'?`<div class="stats"><div class="card"><div class="label">LINE COVERAGE</div><b>${coverage(data.files)}</b><p>${data.files.length} files in LCOV</p></div><div class="card"><div class="label">TEST RESULTS</div><b>${passed} <em>passed</em></b><p>${failed} failed, ${skipped} skipped</p></div><div class="card"><div class="label">CODE HEALTH</div><b>Unavailable</b><p>CRAP score is not included in these reports</p></div></div><h2>Where to look</h2><div class="panel intro">Explore test results and source coverage using the navigation. This snapshot reflects the supplied reports and may not represent the complete suite.</div>`:''}${view==='Tests'?`<div class="columns"><section class="panel"><div class="panel-head"><strong>Test suite</strong><span>${data.tests.length} results</span></div><input id="test-filter" placeholder="Filter tests or paths" value="${escape(testFilter)}" aria-label="Filter tests or paths"><div class="coverage-tree">${data.tests.length ? testTreeRows(filterTestTree(testTree, testFilter)) || '<p class="empty">No matching tests.</p>' : '<p class="empty">No test cases in this report.</p>'}</div></section><section class="panel detail">${selectedTest===null?'<h3>Select a test</h3><p>Choose a test to see its result.</p>':testDetail(data.tests[selectedTest])}</section></div>`:''}${view==='Coverage'?`<div class="columns"><section class="panel"><div class="panel-head"><strong>Files</strong><span>${coverage(data.files)} lines</span></div><input id="filter" placeholder="Filter files" value="${escape(filter)}" aria-label="Filter files"><div class="coverage-tree">${treeRows(filterCoverageTree(tree, filter)) || '<p class="empty">No matching files.</p>'}</div></section><section class="panel detail">${selectedFile===null?'<h3>Select a file</h3><p>Choose a file to inspect its coverage.</p>':fileDetail(data.files[selectedFile])}</section></div>`:''}</div></main>`;
  app.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view!;render()});
  app.querySelectorAll<HTMLButtonElement>('[data-test]').forEach(b=>b.onclick=()=>{selectedTest=Number(b.dataset.test);render()});
  app.querySelectorAll<HTMLButtonElement>('[data-file]').forEach(b=>b.onclick=()=>{selectedFile=Number(b.dataset.file);render()});
  app.querySelectorAll<HTMLButtonElement>('[data-folder]').forEach(b=>b.onclick=()=>{const path=b.dataset.folder!; if(collapsed.has(path)) collapsed.delete(path); else collapsed.add(path); render()});
  app.querySelectorAll<HTMLButtonElement>('[data-test-folder]').forEach(b=>b.onclick=()=>{const key=b.dataset.testFolder!; if(toggledTests.has(key)) toggledTests.delete(key); else toggledTests.add(key); render()});
  const input=app.querySelector<HTMLInputElement>('#filter'); if(input) input.oninput=()=>{const pos=input.selectionStart;filter=input.value;render();const next=app.querySelector<HTMLInputElement>('#filter')!;next.focus();next.setSelectionRange(pos,pos)};
  const testInput=app.querySelector<HTMLInputElement>('#test-filter'); if(testInput) testInput.oninput=()=>{const pos=testInput.selectionStart;testFilter=testInput.value;render();const next=app.querySelector<HTMLInputElement>('#test-filter')!;next.focus();next.setSelectionRange(pos,pos)};
}
function treeRows(nodes: CoverageNode[], depth = 0): string {
  return nodes.map(node => {
    const folder = node.children !== undefined;
    const open = Boolean(filter.trim()) || !collapsed.has(node.path);
    const percent = node.found ? `${(100 * node.hit / node.found).toFixed(1)}%` : '—';
    const indent = 12 + depth * 18;
    const icon = folder ? (open ? chevronDown : chevronRight) : '';
    const symbol = folder ? folderIcon : fileIcon;
    const attr = folder ? `data-folder="${escape(node.path)}" aria-expanded="${open}"` : `data-file="${node.index}"`;
    const selected = !folder && node.index === selectedFile ? ' selected' : '';
    return `<button class="tree-row${selected}" style="padding-left:${indent}px" ${attr}><span class="tree-chevron">${icon}</span><span aria-hidden="true" class="tree-icon">${symbol}</span><span class="tree-name">${escape(node.name)}</span><span class="tree-percent">${percent}</span></button>${folder && open ? treeRows(node.children!, depth + 1) : ''}`;
  }).join('');
}
function testTreeRows(nodes: TestNode[], depth = 0): string {
  return nodes.map(node => {
    const key = `${node.children ? 'folder' : 'file'}:${node.path}`;
    const open = Boolean(testFilter.trim()) || (node.failed !== toggledTests.has(key));
    const symbol = node.children ? folderIcon : fileIcon;
    const rows = node.children ? testTreeRows(node.children, depth + 1) : node.tests!.map(index => { const t = data.tests[index]; const statusIcon = t.status === 'passed' ? passedIcon : t.status === 'failed' ? failedIcon : skippedIcon; return `<button class="tree-row${selectedTest === index ? ' selected' : ''}" style="padding-left:${30 + (depth + 1) * 18}px" data-test="${index}"><span class="tree-status ${escape(t.status)}" aria-label="${escape(t.status)}">${statusIcon}</span><span class="tree-name">${escape(t.name)}</span></button>`; }).join('');
    return `<button class="tree-row" style="padding-left:${12 + depth * 18}px" data-test-folder="${escape(key)}" aria-expanded="${open}"><span class="tree-chevron" aria-hidden="true">${open ? chevronDown : chevronRight}</span><span class="tree-icon" aria-hidden="true">${symbol}</span><span class="tree-name">${escape(node.name)}</span>${node.tests ? `<span class="tree-percent">${node.tests.length}</span>` : ''}</button>${open ? rows : ''}`;
  }).join('');
}
function testDetail(t:Test) {return `<div class="label">TEST RESULT</div><h3>${escape(t.name)}</h3><p>${escape(t.suite)}${t.file?` / ${escape(t.file)}`:''}</p><div class="tag ${escape(t.status)}">${escape(t.status)}${t.duration!==undefined?` / ${t.duration}s`:''}</div>${t.message?`<pre>${escape(t.message)}</pre>`:''}${t.source===undefined?'<p>Test source unavailable in the project snapshot.</p>':`<pre class="source">${t.source.split(/\r\n|\r|\n/).map((line,i)=>`<span class="source-line"><i>${i+1}</i>${t.highlightedLines?.[i] ?? escape(line)}</span>`).join('')}</pre>`}`;}
function fileDetail(f:File) {const lines=new Map(f.lines.map(l=>[l.line,l.hits]));return `<div class="label">LINE COVERAGE</div><h3>${escape(f.path)}</h3><p>${coverage([f])} covered${f.branches?` / branches ${f.branches.hit}/${f.branches.found}`:''}${f.functions?` / functions ${f.functions.hit}/${f.functions.found}`:''}</p>${f.source===undefined?'<p>Source unavailable in the project snapshot.</p>':`<pre class="source">${f.source.split(/\r\n|\r|\n/).map((line,i)=>`<span class="source-line ${lines.has(i+1)?lines.get(i+1)!>0?'covered':'uncovered':''}"><i>${i+1}</i>${f.highlightedLines?.[i] ?? escape(line)}</span>`).join('')}</pre>`}`;}
render();
