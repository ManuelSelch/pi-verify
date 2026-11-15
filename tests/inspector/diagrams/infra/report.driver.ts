import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Diagram } from '../../../../src/inspector/diagrams/domain/model.js';

const cli = fileURLToPath(new URL('../../../../src/inspector/cli.js', import.meta.url));
export class DiagramReportDriver {
  private root = '';
  private html = '';
  private diagrams: Diagram[] = [];
  async createProject() {
    this.root = await mkdtemp(path.join(tmpdir(), 'inspector-report-diagrams-'));
    await writeFile(path.join(this.root, 'junit.xml'), '<testsuite name="suite"><testcase name="works"/></testsuite>');
    await writeFile(path.join(this.root, 'lcov.info'), 'SF:src/a.ts\nDA:1,1\nend_of_record\n');
  }
  async addDocument(file: string, content: string) {
    await mkdir(path.dirname(path.join(this.root, file)), { recursive: true });
    await writeFile(path.join(this.root, file), content);
  }
  async generate() {
    execFileSync(process.execPath, [cli, '--junit', 'junit.xml', '--lcov', 'lcov.info', '--no-open'], { cwd: this.root });
    this.html = await readFile(this.reportPath(), 'utf8');
    const match = this.html.match(/<script id="inspector-data" type="application\/json">(.*?)<\/script>/s);
    assert.ok(match);
    this.diagrams = JSON.parse(match[1]).diagrams;
  }
  reportPath() { return path.join(this.root, 'inspector-report.html'); }
  async dispose() { await rm(this.root, { recursive: true, force: true }); }
  shouldEmbedDiagrams(titles: string[]) { assert.deepEqual(this.diagrams.map(d => d.title), titles); }
  shouldKeepDiagramSource(source: string) { assert.equal(this.diagrams[0].source, source); }
  shouldBeSelfContained() {
    assert.doesNotMatch(this.html, /<script\b[^>]*\bsrc=|<link\b[^>]*\bhref=/);
    assert.match(this.html, /Diagrams/);
    assert.match(this.html, /diagram-dialog/);
    assert.equal((this.html.match(/<script\b/g) ?? []).length, 2);
    assert.equal((this.html.match(/<\/script>/g) ?? []).length, 2);
  }
}
