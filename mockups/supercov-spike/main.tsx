import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Alert, Badge, MantineProvider, SegmentedControl, createTheme } from "@mantine/core";
import { IconAlertTriangle, IconChevronRight, IconFlask } from "@tabler/icons-react";
import { Agentation } from "agentation";
import "@mantine/core/styles.css";
import "./styles.css";

type Filter = "all" | "changed" | "covering";
type DiffLine = { kind: "context" | "added" | "removed"; text: string };
type TestExample = {
  name: string;
  change: "Unchanged" | "Modified" | "Added";
  line: number;
  source: string;
  diff: DiffLine[];
  changedHits: number[];
};

const tests: TestExample[] = [
  {
    name: "applies a member discount",
    change: "Unchanged",
    line: 5,
    source: 'test("applies a member discount", () => {\n  assert.equal(price(100, true), 80);\n});',
    diff: [],
    changedHits: [4],
  },
  {
    name: "keeps the regular price",
    change: "Modified",
    line: 9,
    source: 'test("keeps the regular price", () => {\n  assert.equal(price(200, false), 200);\n});',
    diff: [
      { kind: "context", text: 'test("keeps the regular price", () => {' },
      { kind: "removed", text: "  assert.equal(price(100, false), 100);" },
      { kind: "added", text: "  assert.equal(price(200, false), 200);" },
      { kind: "context", text: "});" },
    ],
    changedHits: [],
  },
  {
    name: "rejects a negative price",
    change: "Added",
    line: 13,
    source: 'test("rejects a negative price", () => {\n  assert.throws(() => price(-1, false));\n});',
    diff: [
      { kind: "added", text: 'test("rejects a negative price", () => {' },
      { kind: "added", text: "  assert.throws(() => price(-1, false));" },
      { kind: "added", text: "});" },
    ],
    changedHits: [],
  },
];

function TestDiff({ lines }: { lines: DiffLine[] }) {
  return <pre className="test-diff" aria-label="Test changes">{lines.map((line, index) => (
    <div key={index} className={line.kind}>
      <span className="diff-marker" aria-hidden="true">{line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "}</span>
      <code>{line.text}</code>
    </div>
  ))}</pre>;
}

const pricingFunction = [
  "export function price(total: number, member: boolean) {",
  '  if (total < 0) throw new Error("Invalid price");',
  "  if (member) {",
  "    return total * 0.8;",
  "  } else if (total > 500)",
  "    return total - 25;",
  "  return total;",
  "}",
];

function FunctionContext({ highlighted, tone }: { highlighted: number[]; tone: "hit" | "gap" }) {
  return <pre className="function-context" aria-label="Enclosing function with highlighted changed lines">{pricingFunction.map((text, index) => {
    const line = index + 1;
    return <div key={line} className={highlighted.includes(line) ? `context-${tone}` : ""}>
      <span className="source-line" aria-hidden="true">{line}</span>
      <span className="source-marker" aria-label={highlighted.includes(line) ? tone === "hit" ? "Executed changed line" : "Uncovered changed line" : undefined}>{highlighted.includes(line) ? "+" : " "}</span>
      <code>{text}</code>
    </div>;
  })}</pre>;
}

function ChangedHits({ lines }: { lines: number[] }) {
  return <details className="hits-disclosure">
    <summary>Show changed-code hits</summary>
    <div className="hit-location"><code>src/pricing.ts:{lines.join(", ")}</code></div>
    <FunctionContext highlighted={lines} tone="hit"/>
    <p className="note">Green +: changed line executed by this test. Other lines provide function context; no execution claim is made for them.</p>
  </details>;
}

function TestRow({ item, filter, unsupported, failed }: {
  item: TestExample;
  filter: Filter;
  unsupported: boolean;
  failed: boolean;
}) {
  return <details className="test-row">
    <summary><IconChevronRight className="caret" size={14} aria-hidden="true"/><span>{item.name}</span></summary>
    <div className="test-detail">
      <div className="detail-meta">
        <code>tests/pricing.test.ts:{item.line}</code>
        <span>{item.change}</span>
        <span className={failed ? "failed" : "passed"}>{failed ? "Failed" : "Passed"}</span>
      </div>
      {filter === "changed" ? <TestDiff lines={item.diff}/> : <pre className="test-source"><code>{item.source}</code></pre>}
      {unsupported ? <p className="note">Changed-line attribution is unknown for this test.</p> : item.changedHits.length > 0 ? <>
        <p className="coverage-summary">Executed {item.changedHits.length} changed line in 1 file.</p>
        <ChangedHits lines={item.changedHits}/>
      </> : <p className="note">No changed executable lines were observed in this test’s execution.</p>}
    </div>
  </details>;
}

function UncoveredChanges() {
  return <details className="uncovered">
    <summary><IconChevronRight className="caret" size={14} aria-hidden="true"/><span>1 changed executable line not covered by any measured test</span></summary>
    <div className="uncovered-detail">
      <code>src/pricing.ts:6</code>
      <FunctionContext highlighted={[6]} tone="gap"/>
      <p className="note">Amber +: changed line covered by no measured test. Other lines provide function context.</p>
    </div>
  </details>;
}

function App() {
  const [filter, setFilter] = useState<Filter>("all");
  const state = new URLSearchParams(location.search).get("state");
  const unsupported = state === "unsupported";
  const failed = state === "failed";
  const changed = tests.filter(item => item.change !== "Unchanged");
  const covering = tests.filter(item => item.changedHits.length > 0);
  const visible = filter === "all" ? tests : filter === "changed" ? changed : unsupported ? [] : covering;

  return <MantineProvider theme={createTheme({
    primaryColor: "teal",
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    defaultRadius: "sm",
  })}>
    <main>
      <header>
        <div className="title"><IconFlask size={18}/><h1>Tests</h1><Badge size="xs" color="gray" variant="light">Mock data</Badge></div>
        <p className="context">fixture/base → working tree <span>·</span> TypeScript / Supercov spike</p>
      </header>
      {unsupported && <Alert className="run-notice" color="orange" icon={<IconAlertTriangle size={16}/>} title="Attribution unavailable">
        Test inventory and diffs remain available. Coverage of changed code is unknown—not zero.
      </Alert>}
      {failed && <Alert className="run-notice" color="red" title="Test run failed">
        “rejects a negative price” failed. Recorded execution is not a successful verification.
      </Alert>}
      <SegmentedControl
        className="filters"
        value={filter}
        onChange={value => setFilter(value as Filter)}
        aria-label="Filter tests"
        data={[
          { value: "all", label: `All tests · ${tests.length}` },
          { value: "changed", label: `Changed tests · ${changed.length}` },
          { value: "covering", label: `Covering changes · ${unsupported ? "unknown" : covering.length}` },
        ]}
      />
      <section className="test-list" aria-label="Tests">
        {visible.map(item => <TestRow
          key={`${filter}:${item.name}`}
          item={item}
          filter={filter}
          unsupported={unsupported}
          failed={failed && item.change === "Added"}
        />)}
        {!visible.length && <p className="empty">No reliable attribution is available. This does not mean no tests cover the change.</p>}
      </section>
      {!unsupported && <UncoveredChanges/>}
      <footer>
        <p>Simulated evidence only. Execution does not prove assertion strength.</p>
        <details className="measurement-details"><summary>Measurement context & limits</summary>
          <p>This preview uses three individual test cases in one file. Changed tests means added or edited test definitions, not every test in an edited file. The unchanged member-discount test executes changed code.</p>
          <p>No shared setup was changed in this example. Setup/helper changes will be disclosed separately; setup execution is not silently assigned to test bodies.</p>
          <p>Final spike: portable local HTML and collector-neutral JSON. No pi-verify integration. Supercov has not been run yet.</p>
        </details>
      </footer>
    </main>
    {import.meta.env.DEV && <Agentation/>}
  </MantineProvider>;
}

createRoot(document.getElementById("root")!).render(<App/>);
