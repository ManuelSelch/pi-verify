import { execFile } from 'node:child_process';
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Diagram } from '../domain/model.js';
import { parseDiagrams } from '../domain/parse.js';

const exec = promisify(execFile);
const excluded = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.pi-verify', '.supercov']);
const markdown = (file: string) => /\.(md|markdown)$/i.test(file) && !file.split('/').some(part => excluded.has(part));

async function walk(root: string, directory = ''): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const file = directory ? `${directory}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await walk(root, file));
    else if (entry.isFile() && markdown(file)) files.push(file);
  }
  return files;
}

async function documents(root: string): Promise<string[]> {
  try {
    const { stdout } = await exec('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, maxBuffer: 32 * 1024 * 1024 });
    return [...new Set(stdout.split('\0').filter(markdown))];
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { stderr?: string };
    if (failure.code !== 'ENOENT' && !failure.stderr?.includes('not a git repository')) throw error;
    return walk(root);
  }
}

export async function discoverDiagrams(directory: string): Promise<Diagram[]> {
  const root = await realpath(directory);
  const diagrams: Diagram[] = [];
  for (const file of (await documents(root)).sort()) {
    const target = path.resolve(root, file);
    const relative = path.relative(root, target);
    if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) continue;
    try {
      if (!(await lstat(target)).isFile()) continue;
      const resolved = await realpath(target);
      // Do not traverse a linked parent directory either.
      if (resolved !== target) continue;
      diagrams.push(...parseDiagrams(await readFile(target, 'utf8'), file));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; // Tracked files can be deleted locally.
      throw new Error(`Could not read Markdown document ${file}`, { cause: error });
    }
  }
  return diagrams;
}
