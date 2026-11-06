import path from "node:path";

/** Coverage experiments must not inherit the outer suite's instrumentation runtime. */
export function coverageProcessEnvironment(parent: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = { ...parent };
  for (const key of Object.keys(env)) if (key.startsWith("SUPERCOV_")) delete env[key];
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_V8_COVERAGE;
  delete env.NODE_OPTIONS;
  // Supercov 4.22's child-launch supervisor otherwise re-injects its runtime even
  // when a caller supplies a clean env. Its engine boundary preserves that env.
  if (parent.SUPERCOV_PROJECT_ROOT) env.SUPERCOV_INTERNAL_ENGINE = "1";
  return env;
}

/** Use the unmodified build/source for tests that assert precise V8 line mappings. */
export function coverageProcessRoot(parent: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(parent.SUPERCOV_SOURCE_PROJECT_ROOT ?? process.cwd());
}
