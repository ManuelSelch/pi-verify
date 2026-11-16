import { XMLParser, XMLValidator } from 'fast-xml-parser';

export type TestResult = { suite: string; name: string; status: 'passed' | 'failed' | 'skipped'; duration?: number; message?: string; file?: string; line?: number; column?: number; source?: string; highlightedLines?: string[] };
export type CoverageFile = { path: string; lines: { line: number; hits: number }[]; functions?: { found: number; hit: number }; branches?: { found: number; hit: number }; source?: string; highlightedLines?: string[] };

type XmlNode = Record<string, any>;
const array = (value: any): XmlNode[] => value == null ? [] : Array.isArray(value) ? value : [value];
export function parseJUnit(xml: string): TestResult[] {
  if (XMLValidator.validate(xml) !== true) throw new Error('Invalid JUnit XML');
  const root = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: false }).parse(xml);
  if (!root || (!Object.hasOwn(root, 'testsuites') && !Object.hasOwn(root, 'testsuite'))) throw new Error('Invalid JUnit XML: missing testsuites or testsuite');
  const results: TestResult[] = [];
  function visit(suite: XmlNode, parent = '') {
    const name = String(suite['@_name'] ?? parent);
    for (const item of array(suite.testcase)) {
      const failure = item.failure ?? item.error;
      const detail = Array.isArray(failure) ? failure[0] : failure;
      const message = detail == null ? undefined : typeof detail === 'object' ? [detail['@_message'], detail['#text']].filter(Boolean).join('\n') : String(detail);
      const duration = Number(item['@_time']);
      // Playwright puts the file path in classname; Java-style class names are not paths.
      const classname = String(item['@_classname'] ?? '');
      const file = item['@_file'] ?? suite['@_file'] ?? (/\.(?:[cm]?[jt]sx?|py|java|cs|rb|go|rs)$/i.test(classname) ? classname : undefined);
      const location = (key: string) => /^[1-9]\d*$/.test(String(item[`@_${key}`] ?? '')) ? Number(item[`@_${key}`]) : undefined;
      results.push({ suite: name, name: String(item['@_name'] ?? '(unnamed test)'), status: failure !== undefined ? 'failed' : item.skipped !== undefined ? 'skipped' : 'passed', ...(Number.isFinite(duration) && item['@_time'] !== undefined ? { duration } : {}), ...(message ? { message } : {}), ...(file ? { file: String(file) } : {}), ...(location('line') ? { line: location('line') } : {}), ...(location('column') ? { column: location('column') } : {}) });
    }
    for (const nested of array(suite.testsuite)) visit(nested, name);
  }
  if (root.testsuite) for (const suite of array(root.testsuite)) visit(suite);
  if (root.testsuites) visit(root.testsuites);
  return results;
}

export function parseLcov(text: string): CoverageFile[] {
  const files: CoverageFile[] = [];
  let file: CoverageFile | undefined;
  let fnFound: number | undefined, fnHit: number | undefined, brFound: number | undefined, brHit: number | undefined;
  const number = (value: string) => { if (!/^\d+$/.test(value)) throw new Error('Invalid LCOV number'); return Number(value); };
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('SF:')) {
      if (file || !line.slice(3)) throw new Error('Invalid LCOV record');
      file = { path: line.slice(3), lines: [] }; fnFound = fnHit = brFound = brHit = undefined;
    } else if (line === 'end_of_record') {
      if (!file) throw new Error('Invalid LCOV record');
      if (fnFound !== undefined && fnHit !== undefined) file.functions = { found: fnFound, hit: fnHit };
      if (brFound !== undefined && brHit !== undefined) file.branches = { found: brFound, hit: brHit };
      files.push(file); file = undefined;
    } else if (line.startsWith('DA:')) {
      if (!file) throw new Error('Invalid LCOV line outside record');
      const parts = line.slice(3).split(',');
      if (parts.length < 2) throw new Error('Invalid LCOV line');
      file.lines.push({ line: number(parts[0]), hits: number(parts[1]) });
    } else if (line.startsWith('FNF:')) fnFound = number(line.slice(4));
    else if (line.startsWith('FNH:')) fnHit = number(line.slice(4));
    else if (line.startsWith('BRF:')) brFound = number(line.slice(4));
    else if (line.startsWith('BRH:')) brHit = number(line.slice(4));
  }
  if (file || !files.length) throw new Error('Invalid LCOV: incomplete or empty report');
  return files;
}
