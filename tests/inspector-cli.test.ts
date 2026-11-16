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
    writeFileSync(path.join(dir, 'junit.xml'), `<testsuite name="suite"><testcase name="&lt;/script&gt;" file="${path.join(dir, 'src/a.ts')}"/><testcase name="missing" file="missing.ts"/><testcase name="outside" file="../outside.ts"/></testsuite>`);
    writeFileSync(path.join(dir, 'coverage.info'), 'SF:src/a.ts\nDA:1,1\nend_of_record\nSF:src/other.py\nDA:1,0\nend_of_record\n');
    execFileSync(process.execPath, [cli, '--junit', 'junit.xml', '--lcov', 'coverage.info', '--no-open'], { cwd: dir });
    const html = readFileSync(path.join(dir, 'inspector-report.html'), 'utf8');
    const embedded = html.match(/<script id="inspector-data" type="application\/json">(.*?)<\/script>/s);
    assert.ok(embedded);
    const data = JSON.parse(embedded[1]);
    assert.match(data.files[0].highlightedLines[0], /<span style="color:/);
    assert.match(data.files[0].highlightedLines[0], /const/);
    assert.equal(data.files[0].lines[0].hits, 1);
    assert.equal(data.tests[0].file, 'src/a.ts');
    assert.match(data.tests[0].source, /const value/);
    assert.match(data.tests[0].highlightedLines[0], /&lt;img/);
    assert.equal(data.tests[1].source, undefined);
    assert.equal(data.tests[2].source, undefined);
    assert.match(data.files[0].highlightedLines[0], /&lt;img/);
    assert.doesNotMatch(data.files[0].highlightedLines[0], /<img/);
    assert.equal(data.files[1].highlightedLines, undefined);
    assert.match(html, /\\u003c\/script>/);
    assert.match(html, /inspector-data/);
    assert.match(html, /icon-tabler-folder/);
    assert.match(html, /icon-tabler-file-code/);
    assert.match(html, /icon-tabler-circle-check/);
    assert.match(html, /icon-tabler-circle-x/);
    assert.match(html, /icon-tabler-circle-minus/);
    assert.match(html, /aside\{[^}]*position:sticky/);
    assert.match(html, /header\{[^}]*position:sticky/);
    assert.doesNotMatch(html, /<script src=/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('generates a report without evidence and marks both sources unavailable', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'inspector-'));
  try {
    const result = spawnSync(process.execPath, [cli, '--no-open'], { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const html = readFileSync(path.join(dir, 'inspector-report.html'), 'utf8');
    const data = JSON.parse(html.match(/<script id="inspector-data" type="application\/json">(.*?)<\/script>/s)![1]);
    assert.deepEqual(data.reports.junit, []);
    assert.equal(data.reports.lcov, null);
    assert.deepEqual(data.tests, []);
    assert.deepEqual(data.files, []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('discovers all JUnit reports and allows independent overrides', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'inspector-'));
  try {
    mkdirSync(path.join(dir, 'test-results'));
    mkdirSync(path.join(dir, 'coverage'));
    writeFileSync(path.join(dir, 'junit.xml'), '<testsuite><testcase name="first"/></testsuite>');
    writeFileSync(path.join(dir, 'test-results/junit.xml'), '<testsuite><testcase name="second"/></testsuite>');
    writeFileSync(path.join(dir, 'coverage/lcov.info'), 'SF:a.ts\nDA:1,1\nend_of_record\n');
    const stdout = execFileSync(process.execPath, [cli, '--no-open', '--junit', 'test-results/junit.xml'], { cwd: dir, encoding: 'utf8' });
    const html = readFileSync(path.join(dir, 'inspector-report.html'), 'utf8');
    const data = JSON.parse(html.match(/<script id="inspector-data" type="application\/json">(.*?)<\/script>/s)![1]);
    assert.equal(data.tests[0].name, 'second');
    assert.equal(data.reports.lcov, 'coverage/lcov.info');
    assert.match(stdout, /coverage\/lcov.info/);
    execFileSync(process.execPath, [cli, '--no-open'], { cwd: dir });
    const automatic = readFileSync(path.join(dir, 'inspector-report.html'), 'utf8');
    assert.deepEqual(JSON.parse(automatic.match(/<script id="inspector-data" type="application\/json">(.*?)<\/script>/s)![1]).tests.map((test: { name: string }) => test.name), ['first', 'second']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('discovers each supported report location independently', () => {
  for (const [kind, locations, content] of [
    ['junit', ['junit.xml', 'test-results/junit.xml', 'test-results.xml', 'reports/junit.xml'], '<testsuite><testcase name="works"/></testsuite>'],
    ['lcov', ['coverage/lcov.info', 'lcov.info', 'coverage/lcov/lcov.info'], 'SF:a.ts\nDA:1,1\nend_of_record\n'],
  ] as const) {
    for (const location of locations) {
      const dir = mkdtempSync(path.join(tmpdir(), 'inspector-'));
      try {
        mkdirSync(path.dirname(path.join(dir, location)), { recursive: true });
        writeFileSync(path.join(dir, location), content);
        execFileSync(process.execPath, [cli, '--no-open'], { cwd: dir });
        const html = readFileSync(path.join(dir, 'inspector-report.html'), 'utf8');
        const data = JSON.parse(html.match(/<script id="inspector-data" type="application\/json">(.*?)<\/script>/s)![1]);
        assert.equal(kind === 'junit' ? data.reports.junit[0].path : data.reports.lcov, location);
        if (kind === 'junit') assert.equal(data.reports.lcov, null);
        else assert.deepEqual(data.reports.junit, []);
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
  }
});

test('fails for an explicitly missing or automatically invalid report', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'inspector-'));
  try {
    assert.notEqual(spawnSync(process.execPath, [cli, '--no-open', '--junit', 'missing.xml'], { cwd: dir }).status, 0);
    writeFileSync(path.join(dir, 'junit.xml'), 'invalid');
    assert.notEqual(spawnSync(process.execPath, [cli, '--no-open'], { cwd: dir }).status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
