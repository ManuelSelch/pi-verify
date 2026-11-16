import { access, readFile, realpath } from 'node:fs/promises';
import { parseJUnit } from '../../parse.js';
import type { ImportedTest, JUnitReport } from '../domain/model.js';

export async function importJUnit(explicit: string[]) {
  const candidates = explicit.length ? explicit : ['junit.xml', 'test-results/junit.xml', 'test-results.xml', 'reports/junit.xml'];
  const seen = new Set<string>();
  const reports: JUnitReport[] = [];
  const tests: ImportedTest[] = [];
  for (const candidate of candidates) {
    try {
      if (!explicit.length) {
        try { await access(candidate); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
          throw error;
        }
      }
      const canonical = await realpath(candidate);
      if (seen.has(canonical)) continue;
      const results = parseJUnit(await readFile(canonical, 'utf8'));
      seen.add(canonical);
      const totals = { tests: results.length, passed: 0, failed: 0, skipped: 0 };
      for (const result of results) {
        totals[result.status]++;
        tests.push({ ...result, report: candidate });
      }
      reports.push({ path: candidate, totals });
    } catch (error) {
      throw new Error(`JUnit report ${candidate}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { reports, tests };
}
