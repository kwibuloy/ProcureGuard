// Stop: run the tests for the layers Claude edited this session (recorded by
// format-lint.mjs). A failure is reported back to Claude so it keeps working.
// Does nothing for a layer whose test tools are not installed yet.
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8'));
// Already continuing because of this hook: let Claude stop instead of looping.
if (input.stop_hook_active) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const stateFile = path.join(tmpdir(), `procureguard-claude-${input.session_id || 'session'}.json`);
let changed = [];
try { changed = JSON.parse(readFileSync(stateFile, 'utf8')); } catch { process.exit(0); }

const failures = [];
const tail = (text) => text.trim().split(/\r?\n/).slice(-60).join('\n');
const run = (cmd, args, cwd, shell = false) => {
  const result = spawnSync(cmd, args, { cwd, shell, encoding: 'utf8', env: { ...process.env, CI: '1' } });
  return { status: result.status, output: `${result.stdout || ''}${result.stderr || ''}` };
};

const pythonAreas = changed.filter((a) => ['pipeline', 'ml'].includes(a) && existsSync(path.join(root, a)));
const python = ['.venv/Scripts/python.exe', '.venv/bin/python'].map((p) => path.join(root, p)).find(existsSync);
if (pythonAreas.length && python && run(python, ['-c', 'import pytest'], root).status === 0) {
  const result = run(python, ['-m', 'pytest', ...pythonAreas, '-q'], root);
  // pytest exits 5 when it collects no tests.
  if (![0, 5].includes(result.status)) failures.push(`pytest ${pythonAreas.join(' ')}\n${tail(result.output)}`);
}

for (const area of changed.filter((a) => ['api', 'dashboard'].includes(a))) {
  const cwd = path.join(root, area);
  let pkg;
  try { pkg = JSON.parse(readFileSync(path.join(cwd, 'package.json'), 'utf8')); } catch { continue; }
  if (!pkg.scripts?.test || !existsSync(path.join(cwd, 'node_modules'))) continue;
  const result = run('npm', ['test'], cwd, true);
  if (result.status !== 0) failures.push(`npm test (${area})\n${tail(result.output)}`);
}

if (failures.length) {
  console.error(`Tests failed for code changed this session. Fix them, or report the failure to the user if it is not yours to fix.\n\n${failures.join('\n\n')}`);
  process.exit(2);
}
rmSync(stateFile, { force: true });
