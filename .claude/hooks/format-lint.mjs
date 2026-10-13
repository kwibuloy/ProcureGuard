// PostToolUse (Edit|Write): format and lint the edited file, and record which
// layer changed so run-tests.mjs knows what to test when Claude stops.
// Does nothing for a layer whose tools are not installed yet.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8'));
const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const file = input.tool_input?.file_path;
if (!file) process.exit(0);

const abs = path.resolve(root, file);
if (!existsSync(abs)) process.exit(0);
const rel = path.relative(root, abs).replace(/\\/g, '/');
const area = rel.split('/')[0];
const ext = path.extname(rel).toLowerCase();

const PYTHON_AREAS = ['pipeline', 'ml'];
const NODE_AREAS = ['api', 'dashboard'];
if (![...PYTHON_AREAS, ...NODE_AREAS].includes(area)) process.exit(0);

const stateFile = path.join(tmpdir(), `procureguard-claude-${input.session_id || 'session'}.json`);
let changed = [];
try { changed = JSON.parse(readFileSync(stateFile, 'utf8')); } catch {}
if (!changed.includes(area)) writeFileSync(stateFile, JSON.stringify([...changed, area]));

const problems = [];
const run = (cmd, args, cwd, shell = false) => {
  const result = spawnSync(cmd, args, { cwd, shell, encoding: 'utf8' });
  return { ok: result.status === 0, output: `${result.stdout || ''}${result.stderr || ''}`.trim() };
};

if (PYTHON_AREAS.includes(area) && ext === '.py') {
  const ruff = ['.venv/Scripts/ruff.exe', '.venv/bin/ruff'].map((p) => path.join(root, p)).find(existsSync);
  if (ruff) {
    run(ruff, ['format', abs], root);
    const lint = run(ruff, ['check', '--fix', abs], root);
    if (!lint.ok) problems.push(lint.output);
  }
}

if (NODE_AREAS.includes(area)) {
  const cwd = path.join(root, area);
  const hasBin = (name) => existsSync(path.join(cwd, 'node_modules', '.bin', name));
  const quoted = `"${abs}"`;
  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.json', '.html'].includes(ext) && hasBin('prettier')) {
    run('npx', ['--no-install', 'prettier', '--write', quoted], cwd, true);
  }
  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext) && hasBin('eslint')) {
    const lint = run('npx', ['--no-install', 'eslint', '--fix', quoted], cwd, true);
    if (!lint.ok) problems.push(lint.output);
  }
}

if (problems.length) {
  console.error(`Lint problems left in ${rel} after auto-fix:\n${problems.join('\n')}`);
  process.exit(2);
}
