/**
 * Create a reviewer account, or set a new password for one.
 *
 * Run from api/:  npm run reviewer:add -- <username> "<Display name>"
 *                 npm run reviewer:disable -- <username>
 *
 * The password is typed at a hidden prompt, never passed on the command line,
 * so it does not end up in shell history. Uses the same database settings as
 * the API: DATABASE_URL if set (hosted), otherwise the POSTGRES_* values in .env.
 */
import path from 'node:path';
import { createInterface } from 'node:readline';
import dotenv from 'dotenv';
import { createPool } from '../db.js';
import { hashPassword, MIN_PASSWORD_LENGTH } from './passwords.js';

dotenv.config({ path: path.resolve(import.meta.dirname, '../../../.env'), quiet: true });

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const prompt = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    const output = prompt as unknown as { _writeToOutput: (text: string) => void };
    let asked = false;
    output._writeToOutput = (text: string) => {
      // Show the question once, then nothing for the characters typed.
      if (!asked) {
        process.stdout.write(text);
        asked = true;
      }
    };
    prompt.question(question, (answer) => {
      prompt.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main(): Promise<number> {
  const [command, username, displayName] = process.argv.slice(2);
  const pool = createPool(process.env);
  const target = process.env.DATABASE_URL
    ? 'the hosted database (DATABASE_URL)'
    : 'the local database';
  try {
    if (command === 'disable') {
      if (!username) throw new Error('Give the username to disable.');
      const done = await pool.query(
        `UPDATE reviewers SET disabled = TRUE WHERE username = $1 RETURNING id`,
        [username.toLowerCase()],
      );
      await pool.query(
        `DELETE FROM reviewer_sessions WHERE reviewer_id IN
           (SELECT id FROM reviewers WHERE username = $1)`,
        [username.toLowerCase()],
      );
      console.log(
        done.rowCount ? `Disabled ${username} in ${target}.` : `No reviewer named ${username}.`,
      );
      return done.rowCount ? 0 : 1;
    }
    if (command !== 'add' || !username || !displayName) {
      console.log('Usage: npm run reviewer:add -- <username> "<Display name>"');
      return 1;
    }
    const name = username.toLowerCase();
    if (!/^[a-z0-9._-]{3,40}$/.test(name)) {
      throw new Error('Username: 3 to 40 lowercase letters, digits, dots, dashes or underscores.');
    }
    console.log(`Reviewer ${name} ("${displayName}") in ${target}.`);
    const password = await askHidden(`Password (at least ${MIN_PASSWORD_LENGTH} characters): `);
    if (password.length < MIN_PASSWORD_LENGTH) throw new Error('That password is too short.');
    if ((await askHidden('Type it again: ')) !== password)
      throw new Error('The two passwords differ.');
    const hash = await hashPassword(password);
    await pool.query(
      `INSERT INTO reviewers (username, display_name, password_hash) VALUES ($1, $2, $3)
       ON CONFLICT (username) DO UPDATE
         SET display_name = EXCLUDED.display_name, password_hash = EXCLUDED.password_hash,
             failed_logins = 0, locked_until = NULL, disabled = FALSE`,
      [name, displayName, hash],
    );
    // A new password signs the account out everywhere.
    await pool.query(
      `DELETE FROM reviewer_sessions WHERE reviewer_id = (SELECT id FROM reviewers WHERE username = $1)`,
      [name],
    );
    console.log(`Saved. ${displayName} can now sign in at /signin.`);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return 1;
  } finally {
    await pool.end();
  }
}

process.exitCode = await main();
