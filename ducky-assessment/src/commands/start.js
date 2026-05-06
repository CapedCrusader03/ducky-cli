/**
 * start.js — `ducky start` command handler.
 *
 * Responsibilities:
 * 1. Validate no duplicate session is running.
 * 2. Write session metadata (start time, project dir).
 * 3. Spawn the daemon as a detached, unref'd child process.
 * 4. Write PID file.
 * 5. Print confirmation to stdout.
 */

import { spawn } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { getLivePid, writePid } from '../lib/pid.js';
import {
  getDuckyDir,
  getMetaPath,
  getDaemonLogPath,
  SCHEMA_VERSION,
} from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * @param {{ dir: string }} opts
 */
export async function startCommand(opts) {
  const projectRoot = resolve(opts.dir);

  // --- Guard: duplicate session ---
  const livePid = getLivePid(projectRoot);
  if (livePid !== null) {
    console.error(`[ducky] Tracking is already active for this directory (PID ${livePid}).`);
    console.error(`        Run \`ducky stop\` first.`);
    process.exit(1);
  }

  // --- Create .ducky/ directory ---
  const duckyDir = getDuckyDir(projectRoot);
  mkdirSync(duckyDir, { recursive: true });

  // --- Write session metadata ---
  const sessionMeta = {
    schemaVersion: SCHEMA_VERSION,
    startTime: new Date().toISOString(),
    startTimeMs: Date.now(),
    projectRoot,
    pid: null, // filled after spawn
  };
  writeFileSync(getMetaPath(projectRoot), JSON.stringify(sessionMeta, null, 2), 'utf8');

  // --- Spawn daemon ---
  const daemonPath = join(__dirname, '..', 'daemon', 'index.js');
  const logPath = getDaemonLogPath(projectRoot);

  // The daemon receives the projectRoot via environment variable.
  // We do NOT use argv to avoid quoting/escaping issues on Windows.
  const child = spawn(process.execPath, [daemonPath], {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
    env: {
      ...process.env,
      DUCKY_PROJECT_ROOT: projectRoot,
    },
  });

  child.on('error', (err) => {
    console.error(`[ducky] Failed to spawn daemon: ${err.message}`);
    process.exit(1);
  });

  // Allow the parent to exit without waiting for the daemon
  child.unref();

  const daemonPid = child.pid;

  // --- Write PID file ---
  writePid(projectRoot, daemonPid);

  // --- Update session meta with pid ---
  sessionMeta.pid = daemonPid;
  writeFileSync(getMetaPath(projectRoot), JSON.stringify(sessionMeta, null, 2), 'utf8');

  // --- Confirmation ---
  console.log(`\n🦆 ducky is now tracking AI usage.`);
  console.log(`   Project : ${projectRoot}`);
  console.log(`   Session : ${sessionMeta.startTime}`);
  console.log(`   Daemon  : PID ${daemonPid}`);
  console.log(`   Data    : ${duckyDir}`);
  console.log(`\n   Run \`ducky stop\` when done to generate your report.\n`);
}
