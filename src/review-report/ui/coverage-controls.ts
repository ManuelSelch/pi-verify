/** Progressive enhancement: native disclosures remain usable without JavaScript. */
function initializeCoverageControls() {
  for (const panel of document.querySelectorAll<HTMLElement>(".coverage-panels>div")) {
    const tools = panel.querySelector<HTMLElement>(".coverage-tools");
    const search = panel.querySelector<HTMLInputElement>('input[type="search"]');
    if (!tools || !search) continue;
    const rows = [...panel.querySelectorAll<HTMLElement>(".coverage-row")];
    const groups = [...panel.querySelectorAll<HTMLDetailsElement>(".coverage-folder,.coverage-file")];
    const initial = new Map(groups.map(group => [group, group.open]));
    tools.hidden = false;
    search.addEventListener("input", () => {
      const query = search.value.trim().toLowerCase();
      for (const row of rows) row.hidden = !(row.dataset.search ?? "").includes(query);
      for (const group of groups) {
        const matches = [...group.querySelectorAll<HTMLElement>(".coverage-row")].filter(row => !row.hidden);
        group.hidden = matches.length === 0;
        group.open = query ? matches.length > 0 : initial.get(group)!;
        const outcomes = new Map<string, number>();
        for (const row of matches) {
          const outcome = row.dataset.outcome ?? "unknown";
          outcomes.set(outcome, (outcomes.get(outcome) ?? 0) + 1);
        }
        const count = group.querySelector<HTMLElement>(":scope>summary>.coverage-group-count")!;
        count.textContent = `${matches.length} ${matches.length === 1 ? "test" : "tests"} · ${[...outcomes].sort(([a], [b]) => a.localeCompare(b)).map(([outcome, n]) => `${n} ${outcome}`).join(" · ")}`;
        count.classList.toggle("has-failures", matches.some(row => ["failed", "error", "timedOut", "timed-out"].includes(row.dataset.outcome ?? "")));
      }
      const visible = rows.filter(row => !row.hidden).length;
      const status = panel.querySelector<HTMLElement>(".coverage-search-count")!;
      status.hidden = false;
      status.textContent = `${visible} of ${rows.length} tests`;
      panel.querySelector<HTMLElement>(".coverage-search-empty")!.hidden = visible !== 0;
    });
    for (const button of tools.querySelectorAll<HTMLButtonElement>("button[data-expand]")) {
      button.addEventListener("click", () => {
        for (const group of groups) if (!group.hidden) group.open = button.dataset.expand === "true";
      });
    }
  }
}

// Contains only trusted code; evidence is read from escaped DOM attributes, never interpolated here.
export const coverageScript = `(${initializeCoverageControls.toString()})();`;
