// Excluded by the guardrail: this test imports a slice the production code must not reach,
// so the extracted edge set must stay free of domain -> ui.
import { test } from "node:test";

import { page } from "../ui/page";

test("a test-only import does not become an architecture edge", () => {
  if (!page) throw new Error("unreachable");
});
