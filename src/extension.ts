import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export default function registerInspector(pi: ExtensionAPI): void {
  pi.registerCommand("inspector", {
    description: "Generate and open the Inspector report for the current project",
    handler: async (argument, ctx) => {
      if (argument.trim()) { ctx.ui.notify("Usage: /inspector", "error"); return; }
      const compiled = fileURLToPath(new URL("./inspector/cli.js", import.meta.url));
      const cli = existsSync(compiled) ? compiled : fileURLToPath(new URL("../dist/src/inspector/cli.js", import.meta.url));
      if (!existsSync(cli)) { ctx.ui.notify("Inspector is not built. Run npm run build in the pi-verify package.", "error"); return; }
      try {
        const result = await pi.exec(process.execPath, [cli], { cwd: ctx.cwd });
        if (result.code !== 0 || result.killed) { ctx.ui.notify(`Inspector failed: ${result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`}`, "error"); return; }
        if (result.stderr.trim()) { ctx.ui.notify(result.stderr.trim(), "warning"); return; }
        ctx.ui.notify(result.stdout.trim() || "Inspector report generated.", "info");
      } catch (error) {
        ctx.ui.notify(`Inspector failed: ${error instanceof Error ? error.message : String(error)}`, "error");
      }
    },
  });
}
