import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type CommitInfo = { sha: string; subject: string; author: string; authoredAt: string };
export type GitScope = {
  repository: string;
  branch: string;
  head: string;
  baseline: string | null;
  baselineMethod: "branch-creation-reflog" | "primary-worktree-merge-base" | "empty-tree" | "unknown";
  fingerprint: string;
  clean: boolean;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  commits: CommitInfo[];
};

async function git(cwd: string, args: string[], allowFailure = false): Promise<string> {
  try {
    return (await execFileAsync("git", args, { cwd, maxBuffer: 10 * 1024 * 1024 })).stdout.trim();
  } catch (error) {
    if (allowFailure) return "";
    const failure = error as { stderr?: string };
    throw new Error(`git ${args.join(" ")} failed: ${failure.stderr ?? "unknown error"}`);
  }
}

function parseStatus(raw: string): Pick<GitScope, "staged" | "unstaged" | "untracked"> {
  const staged: string[] = [];
  const unstaged: string[] = [];
  const untracked: string[] = [];
  const records = raw.split("\0").filter(Boolean);
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    const code = record.slice(0, 2);
    const file = record.slice(3);
    if (code === "??") untracked.push(file);
    else {
      if (code[0] !== " ") staged.push(file);
      if (code[1] !== " ") unstaged.push(file);
      if (code[0] === "R" || code[0] === "C") index++;
    }
  }
  return { staged, unstaged, untracked };
}

async function fingerprint(cwd: string): Promise<string> {
  const files = (await git(cwd, ["ls-files", "-z"])).split("\0").filter(Boolean).sort();
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file).update("\0");
    hash.update(await readFile(path.join(cwd, file))).update("\0");
  }
  return hash.digest("hex");
}

async function findBaseline(cwd: string, branch: string, head: string): Promise<Pick<GitScope, "baseline" | "baselineMethod">> {
  if (branch !== "HEAD") {
    const reflog = await git(cwd, ["reflog", "show", "--format=%H%x00%gs", `refs/heads/${branch}`], true);
    const oldest = reflog.split("\n").filter(Boolean).at(-1)?.split("\0");
    if (oldest?.[1]?.startsWith("branch: Created from ")) return { baseline: oldest[0], baselineMethod: "branch-creation-reflog" };
    if (oldest?.[1]?.startsWith("commit (initial)")) {
      return { baseline: await git(cwd, ["hash-object", "-t", "tree", "/dev/null"]), baselineMethod: "empty-tree" };
    }
  }

  const worktrees = await git(cwd, ["worktree", "list", "--porcelain"], true);
  const primaryBranch = worktrees.split("\n\n")[0]?.match(/^branch refs\/heads\/(.+)$/m)?.[1];
  if (primaryBranch && primaryBranch !== branch) {
    const baseline = await git(cwd, ["merge-base", head, `refs/heads/${primaryBranch}`], true);
    if (baseline) return { baseline, baselineMethod: "primary-worktree-merge-base" };
  }
  return { baseline: null, baselineMethod: "unknown" };
}

export async function collectGitScope(projectDir: string): Promise<GitScope> {
  const repository = await git(projectDir, ["rev-parse", "--show-toplevel"]);
  const head = await git(projectDir, ["rev-parse", "HEAD"]);
  const branch = await git(projectDir, ["symbolic-ref", "--quiet", "--short", "HEAD"], true) || "HEAD";
  const baseline = await findBaseline(projectDir, branch, head);
  const rawStatus = await git(projectDir, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  const status = parseStatus(rawStatus);
  const range = baseline.baselineMethod === "empty-tree" ? head : baseline.baseline ? `${baseline.baseline}..${head}` : "";
  const log = range ? await git(projectDir, ["log", "--reverse", "--format=%H%x00%s%x00%an%x00%aI", range], true) : "";
  const commits = log.split("\n").filter(Boolean).map((line) => {
    const [sha, subject, author, authoredAt] = line.split("\0");
    return { sha, subject, author, authoredAt };
  });
  return {
    repository,
    branch,
    head,
    ...baseline,
    fingerprint: await fingerprint(projectDir),
    clean: !rawStatus,
    ...status,
    commits,
  };
}
