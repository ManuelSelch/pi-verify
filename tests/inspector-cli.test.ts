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
    writeFileSync(path.join(dir, 'src/a.ts'), 'const value = 1;\n');
    writeFileSync(path.join(dir, 'junit.xml'), '<testsuite name="suite"><testcase name="&lt;/script&gt;"/></testsuite>');
    writeFileSync(path.join(dir, 'coverage.info'), 'SF:src/a.ts\nDA:1,1\nend_of_record\n');
    execFileSync(process.execPath, [cli, '--junit', 'junit.xml', '--lcov', 'coverage.info', '--no-open'], { cwd: dir });
    const html = readFileSync(path.join(dir, 'inspector-report.html'), 'utf8');
    assert.match(html, /const value = 1/);
    assert.match(html, /\\u003c\/script>/);
    assert.match(html, /inspector-data/);
    assert.doesNotMatch(html, /<script src=/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('fails when a required report is missing', () => {
  const result = spawnSync(process.execPath, [cli, '--no-open'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Usage: inspector/);
});
