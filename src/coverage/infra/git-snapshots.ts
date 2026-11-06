import { execFile } from "node:child_process";
import { changedLineNumbers } from "../analysis.js";

type Git = (args: string[], input?: string) => Promise<Buffer>;
interface Snapshots { before: Record<string, string>; changed: Record<string, number[]> }

function gitCommand(root: string): Git {
  return (args, input) => new Promise((resolve, reject) => {
    const child = execFile("git", args, { cwd: root, encoding: "buffer", timeout: 10000, maxBuffer: 20 * 1024 * 1024 }, (error, stdout) => error ? reject(error) : resolve(stdout));
    child.stdin!.on("error", () => { /* execFile reports process failures. */ });
    child.stdin!.end(input);
  });
}

export async function collectGitSnapshots(root: string, base: string, sources: Record<string, string>, git: Git = gitCommand(root)): Promise<Snapshots> {
  const before: Record<string, string> = {}, changed: Record<string, number[]> = {};
  const files = Object.keys(sources);
  if (!files.length) return { before, changed };
  const tree = (await git(["--literal-pathspecs", "ls-tree", "-r", "-z", base, "--", ...files])).toString("utf8");
  const blobs = new Map<string, string>();
  for (const entry of tree.split("\0").filter(Boolean)) {
    const match = /^\d+ blob ([0-9a-f]+)\t([\s\S]+)$/.exec(entry);
    if (!match || !Object.hasOwn(sources, match[2])) throw new Error("Invalid Git snapshot tree entry");
    blobs.set(match[2], match[1]);
  }
  const ids = [...new Set(blobs.values())];
  const contents = new Map<string, string>();
  if (ids.length) {
    const batch = await git(["cat-file", "--batch"], ids.join("\n") + "\n");
    let offset = 0;
    for (const id of ids) {
      const end = batch.indexOf(10, offset);
      if (end < 0) throw new Error("Truncated Git blob header");
      const header = /^([0-9a-f]+) blob (\d+)$/.exec(batch.subarray(offset, end).toString("ascii"));
      if (!header || header[1] !== id) throw new Error("Invalid Git blob header");
      const size = Number(header[2]);
      const start = end + 1;
      if (!Number.isSafeInteger(size) || batch[start + size] !== 10) throw new Error("Truncated Git blob contents");
      contents.set(id, batch.subarray(start, start + size).toString("utf8"));
      offset = start + size + 1;
    }
    if (offset !== batch.length) throw new Error("Unexpected Git blob contents");
  }
  for (const [file, source] of Object.entries(sources)) {
    const id = blobs.get(file);
    before[file] = id ? contents.get(id)! : "";
    changed[file] = id ? [] : source ? source.replace(/\n$/, "").split("\n").map((_, index) => index + 1) : [];
  }
  const diff = (await git(["--literal-pathspecs", "diff", "--relative", "--raw", "-z", "--patch", "--no-renames", "--no-ext-diff", "--no-textconv", "--unified=0", base, "--", ...files])).toString("utf8");
  if (!diff) return { before, changed };
  // Raw -z records supply exact paths, so quoted patch headers never need to
  // be decoded. With renames disabled each record has exactly one path.
  const boundary = diff.indexOf("\0\0");
  if (boundary < 0) throw new Error("Invalid Git snapshot diff");
  const records = diff.slice(0, boundary).split("\0");
  const patches = diff.slice(boundary + 2).split(/(?=^diff --git )/m).filter(Boolean);
  if (records.length !== patches.length * 2) throw new Error("Git diff records and patches disagree");
  for (let index = 0; index < patches.length; index++) {
    const file = records[index * 2 + 1];
    if (!/^:\d+ \d+ [0-9a-f]+ [0-9a-f]+ [A-Z]$/.test(records[index * 2]) || !Object.hasOwn(sources, file)) throw new Error("Invalid Git snapshot diff record");
    // Files absent at base count as entirely added, including untracked files
    // that Git diff cannot see. Their full line lists were populated above.
    if (blobs.has(file)) changed[file] = changedLineNumbers(patches[index]);
  }
  return { before, changed };
}
