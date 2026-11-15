import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';
import { pathToFileURL } from 'node:url';
import { DiagramReportDriver } from '../infra/report.driver.js';

export class InspectorDriver {
  private report = new DiagramReportDriver();
  private browser?: Browser;
  private page!: Page;
  private errors: string[] = [];
  private requests: string[] = [];
  async createProject() {
    await this.report.createProject();
    this.browser = await chromium.launch({ channel: 'chrome', headless: true });
    this.page = await this.browser.newPage({ viewport: { width: 1800, height: 1090 } });
    this.page.setDefaultTimeout(10000);
    this.page.on('pageerror', error => this.errors.push(error.message));
    this.page.on('request', request => { if (/^https?:/.test(request.url())) this.requests.push(request.url()); });
    await this.page.context().setOffline(true);
  }
  async dispose() { await this.browser?.close(); await this.report.dispose(); }
  async addArchitecture() {
    await this.report.addDocument('docs/architecture.md', '# System overview\n```mermaid\nflowchart LR\n CLI[CLI & extension] --> Core[Collection & analysis]\n Core --> Reports[HTML & JSON reports]\n```\n## Report generation\n```mermaid\nsequenceDiagram\n CLI->>Parser: Read reports\n Parser-->>CLI: Snapshot\n```');
  }
  async addOtherDiagramTypes() {
    await this.report.addDocument('docs/other.md', '# Architecture diagram\n```mermaid\narchitecture-beta\n group api(cloud)[API]\n service db(database)[Database] in api\n service server(server)[Server] in api\n db:L -- R:server\n```\n## Lifecycle\n```mermaid\nstateDiagram-v2\n [*] --> Pending\n Pending --> Running\n Running --> Passed\n```\n## Mindmap\n```mermaid\nmindmap\n root((Inspector))\n  Tests\n  Coverage\n```');
  }
  async addInvalidDiagram() { await this.report.addDocument('docs/a-invalid.md', '# Broken diagram\n```mermaid\nflowchart LR\n A --> [broken\n```'); }
  async addTallDiagram() {
    const links = Array.from({ length: 30 }, (_, index) => `N${index} --> N${index + 1}`).join('\n');
    await this.report.addDocument('docs/tall.md', `# Tall diagram\n\`\`\`mermaid\nflowchart TB\n${links}\n\`\`\``);
  }
  async addUnsafeDiagram() {
    await this.report.addDocument('docs/unsafe.md', '# <img src=x onerror="window.inspectorUnsafe=true">\n```mermaid\nflowchart LR\n A["<img src=x onerror=window.inspectorUnsafe=true>"] --> B\n click A "javascript:window.inspectorUnsafe=true"\n```');
  }
  async openReport() { await this.report.generate(); await this.page.goto(pathToFileURL(this.report.reportPath()).href); }
  async openDiagrams() { await this.page.getByRole('button', { name: 'Diagrams', exact: true }).click(); }
  async openMetrics() { await this.page.getByRole('button', { name: 'Metrics', exact: true }).click(); }
  async openTests() { await this.page.getByRole('button', { name: 'Tests', exact: true }).click(); }
  async openCoverage() { await this.page.getByRole('button', { name: 'Coverage', exact: true }).click(); }
  async expand(title: string) { await this.page.getByRole('button', { name: `Expand ${title}`, exact: true }).click(); }
  async zoomIn() { await this.page.getByRole('button', { name: 'Zoom in', exact: true }).click(); }
  async resetZoom() { await this.page.getByRole('button', { name: 'Reset zoom to fit', exact: true }).click(); }
  async closePresentation() { await this.page.getByRole('button', { name: 'Close diagram', exact: true }).click(); }
  async dismissPresentation() { await this.page.keyboard.press('Escape'); }
  async useNarrowScreen() { await this.page.setViewportSize({ width: 900, height: 1090 }); }
  async useSmallScreen() { await this.page.setViewportSize({ width: 600, height: 500 }); }
  async shouldShowDiagrams(count: number) {
    await this.page.waitForFunction(expected => document.querySelectorAll('.diagram-preview > svg').length === expected, count);
    assert.equal(await this.page.locator('.diagram-card').count(), count);
    assert.doesNotMatch(await this.page.locator('.content').innerText(), /Source|diagrams in|2 diagrams/);
  }
  async shouldShowIsolatedError() {
    await this.page.locator('.diagram-error').waitFor();
    await this.page.waitForFunction(() => document.querySelectorAll('.diagram-preview > svg').length === 2);
    assert.equal(await this.page.locator('.diagram-error').count(), 1);
    assert.equal(await this.page.locator('.diagram-preview > svg').count(), 2);
    assert.equal(await this.page.locator('.diagram-render-host').count(), 0);
    assert.doesNotMatch(await this.page.locator('.content').innerText(), /A --> \[broken/);
  }
  async shouldShowEmptyState() { await this.page.getByRole('heading', { name: 'No Mermaid diagrams found' }).waitFor(); }
  async shouldShowPresentation(title: string) {
    const dialog = this.page.getByRole('dialog');
    await dialog.waitFor();
    assert.equal(await dialog.getByRole('heading').innerText(), title);
    assert.doesNotMatch(await dialog.innerText(), /docs\/|\.md|Source/);
    assert.equal(await dialog.locator('.diagram-dialog-header button').count(), 4);
    assert.equal(await dialog.locator('.diagram-stage button').count(), 0);
    const bounds = await dialog.boundingBox();
    assert.ok(bounds);
    const viewport = this.page.viewportSize()!;
    assert.ok(Math.abs(bounds.width - (viewport.width - 48)) < 2);
    assert.ok(Math.abs(bounds.height - (viewport.height - 48)) < 2);
  }
  async shouldFitPresentation() {
    await this.page.waitForFunction(() => {
      const svg = document.querySelector('.diagram-stage svg')?.getBoundingClientRect();
      const stage = document.querySelector('.diagram-stage')?.getBoundingClientRect();
      return svg && stage && svg.width > 0 && svg.height > 0 && svg.left >= stage.left && svg.right <= stage.right && svg.top >= stage.top && svg.bottom <= stage.bottom;
    });
  }
  async shouldShowZoom(percent: number) { assert.equal(await this.page.getByRole('button', { name: 'Reset zoom to fit' }).innerText(), `${percent}%`); }
  async shouldRestorePreview(title: string) {
    await this.page.waitForFunction(() => !document.querySelector('dialog'));
    const card = this.page.locator('.diagram-card').filter({ has: this.page.getByRole('heading', { name: title, exact: true }) });
    assert.equal(await card.locator('svg[role="img"]').count(), 1);
    assert.equal(await this.page.getByRole('button', { name: `Expand ${title}`, exact: true }).evaluate(button => button === document.activeElement), true);
    const ids = await this.page.locator('svg [id],svg[id]').evaluateAll(elements => elements.map(element => element.id));
    assert.equal(new Set(ids).size, ids.length);
  }
  async shouldKeepCompactPreviews() {
    const sizes = await this.page.locator('.diagram-preview > svg').evaluateAll(elements => elements.map(element => {
      const bounds = element.getBoundingClientRect();
      const parent = element.parentElement!.getBoundingClientRect();
      return { width: bounds.width, height: bounds.height, within: bounds.left >= parent.left && bounds.right <= parent.right };
    }));
    assert.ok(sizes.every(size => size.width <= 560.1 && size.height <= 240.1 && size.within));
  }
  async shouldShowMetrics() { await this.page.getByRole('heading', { name: 'Metrics', exact: true }).waitFor(); assert.match(await this.page.locator('.content').innerText(), /1 passed/); }
  async shouldShowTests() { await this.page.getByRole('heading', { name: 'Tests', exact: true }).waitFor(); assert.match(await this.page.locator('.content').innerText(), /Test suite/); }
  async shouldShowCoverage() { await this.page.getByRole('heading', { name: 'Coverage', exact: true }).waitFor(); assert.match(await this.page.locator('.content').innerText(), /100.0%/); }
  async shouldBeSafeAndOffline() {
    assert.deepEqual(this.requests, []);
    assert.deepEqual(this.errors, []);
    assert.equal(await this.page.locator('.content img,.content script,.content a[href^="javascript:"]').count(), 0);
    assert.equal(await this.page.evaluate(() => 'inspectorUnsafe' in window), false);
  }
}
