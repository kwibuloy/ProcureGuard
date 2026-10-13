// PreToolUse (Bash|PowerShell): ask before destructive database commands,
// block shell writes to secrets and raw PhilGEPS data.
import { readFileSync } from 'node:fs';

const input = JSON.parse(readFileSync(0, 'utf8'));
const command = input.tool_input?.command || '';

const writeVerb = /(\brm\b|\bdel\b|\bmv\b|\bremove-item\b|\bmove-item\b|\bset-content\b|\badd-content\b|\bout-file\b|\bclear-content\b|\bsed\s+-i|\btruncate\b)/i;
// A redirect counts only when its target is the protected path, so `cmd > /dev/null` passes.
const redirectsInto = (target) => new RegExp(`>\\s*["']?[^\\s"'|;&]*${target}`, 'i');
const envFile = '\\.env(?!\\.(example|sample|template))\\b';

if (/data[\\/]+raw/i.test(command) && (writeVerb.test(command) || redirectsInto('data[\\\\/]+raw').test(command))) {
  console.error('Blocked: data/raw/ holds raw PhilGEPS downloads and must stay exactly as downloaded. Only the pipeline download step adds files there.');
  process.exit(2);
}

if (new RegExp(`(^|[\\s"'\\\\/])${envFile}`, 'i').test(command) && (writeVerb.test(command) || redirectsInto(envFile).test(command))) {
  console.error('Blocked: .env holds secrets. Change .env.example and ask the user to update their own .env.');
  process.exit(2);
}

const destructive = [
  [/\bdrop\s+(table|database|schema|view|index|materialized\s+view)\b/i, 'DROP statement'],
  [/\btruncate\s+(table\s+)?[\w".]+/i, 'TRUNCATE statement'],
  [/\bdelete\s+from\s+[\w".]+(?![^;]*\bwhere\b)/i, 'DELETE without WHERE'],
  [/\bdropdb\b/i, 'dropdb'],
  [/docker[\s-]+compose\s+.*\bdown\b.*(\s-v\b|--volumes)/i, 'docker compose down with volumes (deletes the database)'],
  [/docker\s+volume\s+(rm|prune)\b/i, 'docker volume removal (may delete the database)'],
];

const hit = destructive.find(([pattern]) => pattern.test(command));
if (hit) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: `Destructive database command: ${hit[1]}. Confirm before it runs.`,
    },
  }));
}
