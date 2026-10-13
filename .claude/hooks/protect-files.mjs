// PreToolUse (Edit|Write|NotebookEdit): block edits to secrets and raw PhilGEPS data.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8'));
const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const file = input.tool_input?.file_path || input.tool_input?.notebook_path;
if (!file) process.exit(0);

const rel = path.relative(root, path.resolve(root, file)).replace(/\\/g, '/').toLowerCase();
const base = path.basename(rel);

const envTemplates = ['.env.example', '.env.sample', '.env.template'];
if ((base === '.env' || base.startsWith('.env.')) && !envTemplates.includes(base)) {
  console.error(`Blocked: ${rel} holds secrets. Edit .env.example instead and ask the user to update their own .env.`);
  process.exit(2);
}

if (rel.startsWith('data/raw/')) {
  console.error(`Blocked: ${rel} is raw PhilGEPS data and must stay exactly as downloaded. Write cleaned output to data/processed/ or the database.`);
  process.exit(2);
}
