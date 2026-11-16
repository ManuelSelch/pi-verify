import type { TestResult } from '../../parse.js';

export type ImportedTest = TestResult & { report: string };
export type JUnitReport = { path: string; totals: { tests: number; passed: number; failed: number; skipped: number } };
