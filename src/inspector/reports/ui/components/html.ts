import type { JUnitReport } from '../../domain/model.js';

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function importedReportsHtml(reports: JUnitReport[]): string {
  if (!reports.length) return '<p>No test report found. Test results unavailable.</p>';
  return reports.map(report => `<p>Imported report: ${escape(report.path)} — ${report.totals.tests} test cases, ${report.totals.passed} passed, ${report.totals.failed} failed, ${report.totals.skipped} skipped.</p>`).join('');
}
