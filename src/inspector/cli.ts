#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { access, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJUnit, parseLcov } from './parse.js';
import { discoverDiagrams } from './diagrams/infra/discover.js';
import { highlightLines } from '../review-report/ui/highlight.js';

const usage = 'Usage: inspector [--junit FILE] [--lcov FILE] [--output FILE] [--no-open]';

async function discoverReport(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    try { await access(candidate); return candidate; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  return null;
}
async function main(args: string[]) {
  if (args.includes('--help')) { console.log(usage); return; }
  const opts: Record<string, string> = {};
  let open = true;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--no-open') { open = false; continue; }
    if (!['--junit', '--lcov', '--output'].includes(arg) || opts[arg] || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(usage);
    opts[arg] = args[++i];
  }
  const root = await realpath(process.cwd());
  const junit = opts['--junit'] ?? await discoverReport(['junit.xml', 'test-results/junit.xml', 'test-results.xml', 'reports/junit.xml']);
  const lcov = opts['--lcov'] ?? await discoverReport(['coverage/lcov.info', 'lcov.info', 'coverage/lcov/lcov.info']);
  console.log(`JUnit: ${junit ?? 'unavailable'}`);
  console.log(`LCOV: ${lcov ?? 'unavailable'}`);
  const tests = junit ? parseJUnit(await readFile(junit, 'utf8')) : [];
  for (const test of tests) {
    if (!test.file || !path.isAbsolute(test.file)) continue;
    const relative = path.relative(root, test.file);
    if (relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) test.file = relative;
  }
  const files = lcov ? parseLcov(await readFile(lcov, 'utf8')) : [];
  for (const file of [...files, ...tests.map(test => ({ path: test.file, test }))]) {
    if (!file.path) continue;
    try {
      const resolved = await realpath(path.resolve(root, file.path));
      const relative = path.relative(root, resolved);
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) continue;
      if ('test' in file && path.isAbsolute(file.path)) file.test.file = relative;
      const source = await readFile(resolved, 'utf8');
      const highlightedLines = /\.[cm]?[jt]sx?$/i.test(file.path) ? highlightLines(source, file.path) : undefined;
      const target = 'test' in file ? file.test : file;
      target.source = source;
      if (highlightedLines) target.highlightedLines = highlightedLines;
    } catch { /* Reports can refer to sources not present in this checkout. */ }
  }
  const assets = fileURLToPath(new URL('../../inspector-ui/', import.meta.url));
  const [script, css] = await Promise.all([readFile(path.join(assets, 'app.js'), 'utf8'), readFile(path.join(assets, 'app.css'), 'utf8')]);
  const diagrams = await discoverDiagrams(root);
  const data = JSON.stringify({ project: path.basename(root), tests, files, diagrams, reports: { junit, lcov } }).replace(/</g, '\\u003c');
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Inspector</title><style>${css.replace(/<\/style/gi, '<\\/style')}</style></head><body><div id="app"></div><script id="inspector-data" type="application/json">${data}</script><script>${script.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
  const output = path.resolve(opts['--output'] ?? 'inspector-report.html');
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, html);
  console.log(`Inspector report: ${output}`);
  if (open) {
    const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
    execFile(command, [output], error => { if (error) console.error(`Could not open report: ${error.message}`); });
  }
}
main(process.argv.slice(2)).catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
