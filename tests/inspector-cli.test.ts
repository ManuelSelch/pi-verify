import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../src/inspector/cli.js', import.meta.url));
test('generates a self-contained snapshot from reports without running tests', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'inspector-'));
  try {
    mkdirSync(path.join(dir, 'src'));
    writeFileSync(path.join(dir, 'src/a.ts'), 'const value = "<img src=x onerror=alert(1)>";\r\n');
    writeFileSync(path.join(dir, 'src/other.py'), 'print("<unsafe>")\n');
    writeFileSync(path.join(dir, 'junit.xml'), '<testsuite name="suite"><testcase name="&lt;/script&gt;"/></testsuite>');
    writeFileSync(path.join(dir, 'coverage.info'), 'SF:src/a.ts\nDA:1,1\nend_of_record\nSF:src/other.py\nDA:1,0\nend_of_record\n');
    execFileSync(process.execPath, [cli, '--junit', 'junit.xml', '--lcov', 'coverage.info', '--no-open'], { cwd: dir });
    const html = readFileSync(path.join(dir, 'inspector-report.html'), 'utf8');
    const embedded = html.match(/<script id="inspector-data" type="application\/json">(.*?)<\/script>/s);
    assert.ok(embedded);
    const data = JSON.parse(embedded[1]);
    assert.match(data.files[0].highlightedLines[0], /<span style="color:/);
    assert.match(data.files[0].highlightedLines[0], /const/);
    assert.equal(data.files[0].lines[0].hits, 1);
    assert.match(data.files[0].highlightedLines[0], /&lt;img/);
    assert.doesNotMatch(data.files[0].highlightedLines[0], /<img/);
    assert.equal(data.files[1].highlightedLines, undefined);
    assert.match(html, /\\u003c\/script>/);
    assert.match(html, /inspector-data/);
    assert.match(html, /aside\{[^}]*position:sticky/);
    assert.match(html, /header\{[^}]*position:sticky/);
    assert.doesNotMatch(html, /<script src=/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('fails when a required report is missing', () => {
  const result = spawnSync(process.execPath, [cli, '--no-open'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Usage: inspector/);
});
