# Inspector Mermaid diagrams

- Revision: 10. Status: approved for implementation.
- Goal: discover Mermaid fences in Markdown and expose a Diagrams navigation view without changing Metrics, Tests or Coverage.
- Omit introductory description and aggregate diagram/document count below the page title.
- No per-document diagram counts.
- Group cards by source document; name diagrams using the nearest preceding heading (filename plus diagram number when absent).
- Cards display a noninteractive document location and an icon-only Expand action with an accessible name, using a compact square icon control, 12px header padding and equal top/right spacing, compensating for the icon control's internal whitespace on both edges. Keep the action at the right on narrow layouts. No Mermaid source, source buttons or source tabs are shown anywhere.
- Expanded dialog fills the viewport with 24px outer margins for team presentations, with a full-height centered diagram stage. Default/reset zoom fits the diagram to both available width and height (capped at 1000px wide), recalculating on resize. Explicit zoom-in may overflow with scrolling. Shows the title and zoom/reset controls in the popup header, with only the diagram stage below; no document path. Escape/close dismisses the dialog.
- Invalid diagrams show a local error without source and without preventing other diagrams from rendering.
- Empty state: `?state=empty`; populated default includes one invalid diagram.
- Card previews use compact, centered diagrams capped at 560px, shrinking to fit narrow cards rather than stretching across the report. Reduced canvas padding; expanded view retains zoom and scrolling.
- Narrow layouts wrap document locations while retaining a right-aligned expand icon.
- Simulated: discovery, Mermaid rendering and parser errors use fixed examples and SVG artwork. No filesystem reads, actual parsing or report generation. Browser rendering and interactions await user review.
- Approval: user explicitly approved revision 10: “approved. implement”. Approved source preserved as implementation reference.
