import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { discoverDiagrams } from '../../../../src/inspector/diagrams/infra/discover.js';
import type { Diagram } from '../../../../src/inspector/diagrams/domain/model.js';

export class DiscoveryDriver {
  private root = '';
  private diagrams: Diagram[] = [];
  async createProject() { this.root = await mkdtemp(path.join(tmpdir(), 'inspector-diagrams-')); }
  async dispose() { await rm(this.root, { recursive: true, force: true }); }
  async addDocument(file: string, markdown = '# Overview\n```mermaid\nflowchart LR\n A --> B\n```') {
    await mkdir(path.dirname(path.join(this.root, file)), { recursive: true });
    await writeFile(path.join(this.root, file), markdown);
  }
  useGit() { execFileSync('git', ['init', '-q'], { cwd: this.root }); }
  async ignore(file: string) { await this.addDocument('.gitignore', `${file}\n`); }
  track(file: string) { execFileSync('git', ['add', file], { cwd: this.root }); }
  async addLinkedDocument(file: string, target: string) { await symlink(path.join(this.root, target), path.join(this.root, file)); }
  async discover() { this.diagrams = await discoverDiagrams(this.root); }
  shouldFindDocuments(files: string[]) { assert.deepEqual(this.diagrams.map(d => d.file), files); }
  shouldKeepInvalidDiagram() { assert.equal(this.diagrams[0].source, 'broken Mermaid'); }
}
