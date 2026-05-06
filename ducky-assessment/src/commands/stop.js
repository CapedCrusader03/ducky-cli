/**
 * stop.js — `ducky stop` command handler.
 *
 * Responsibilities:
 * 1. Validate a session is active.
 * 2. Send SIGTERM to daemon, wait for graceful exit, force-kill if needed.
 * 3. Aggregate all events into ducky-report.json.
 * 4. Clean up PID file.
 * 5. Print terminal summary.
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { getLivePid, removePid } from '../lib/pid.js';
import { readAllEvents } from '../lib/events.js';
import { buildReport } from '../reporter.js';
import { getMetaPath, getReportPath } from '../config.js';

const SIGTERM_WAIT_MS = 3000;
const SIGKILL_WAIT_MS = 2000;

/**
 * Kill a process by PID with escalation: SIGTERM → SIGKILL (Windows: taskkill).
 * @param {number} pid
 */
async function killDaemon(pid) {
  const isWindows = process.platform === 'win32';

  if (isWindows) {
    // Windows does not support POSIX signals for child processes reliably.
    // taskkill /F /PID ensures the process tree is terminated.
    const { execSync } = await import('child_process');
    try {
      execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore', windowsHide: true });
    } catch {
      // Process may have already exited — not an error
    }
    return;
  }

  // POSIX: try graceful SIGTERM first
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return; // already dead
  }

  await new Promise((r) => setTimeout(r, SIGTERM_WAIT_MS));

  // Check if still alive, escalate to SIGKILL
  try {
    process.kill(pid, 0); // probe
    process.kill(pid, 'SIGKILL');
    await new Promise((r) => setTimeout(r, SIGKILL_WAIT_MS));
  } catch {
    // Gone — good
  }
}

export async function stopCommand() {
  const projectRoot = resolve(process.cwd());

  // --- Guard: no active session ---
  const livePid = getLivePid(projectRoot);
  if (livePid === null) {
    console.error(`[ducky] No active tracking session found in ${projectRoot}.`);
    console.error(`        Run \`ducky start\` to begin tracking.`);
    process.exit(1);
  }

  console.log(`\n🦆 Stopping ducky (daemon PID ${livePid})...`);

  // --- Terminate daemon ---
  await killDaemon(livePid);

  // --- Clean up PID file ---
  removePid(projectRoot);

  // --- Load session metadata ---
  const metaPath = getMetaPath(projectRoot);
  let sessionMeta = {};
  if (existsSync(metaPath)) {
    try {
      sessionMeta = JSON.parse(readFileSync(metaPath, 'utf8'));
    } catch {
      sessionMeta = {};
    }
  }

  // --- Read all events ---
  const events = readAllEvents(projectRoot);

  // --- Build and write report ---
  const endTimeMs = Date.now();
  const report = buildReport(sessionMeta, events, endTimeMs);
  const reportPath = getReportPath(projectRoot);
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  // --- Terminal summary ---
  const durationSec = Math.round((endTimeMs - (sessionMeta.startTimeMs || endTimeMs)) / 1000);
  const mins = Math.floor(durationSec / 60);
  const secs = durationSec % 60;

  console.log(`\n✅ Tracking complete.`);
  console.log(`   Duration          : ${mins}m ${secs}s`);
  console.log(`   Total events      : ${events.length}`);
  console.log(`   AI processes seen : ${report.tracking.processesSeen.length}`);
  console.log(`   File changes      : ${report.tracking.fileChanges.totalEvents}`);
  console.log(`   Git commits       : ${report.tracking.git.commitsDuringSession}`);
  console.log(`   Network AI hits   : ${report.tracking.network.aiHostsDetected.length}`);
  console.log(`\n   Report written to: ${reportPath}\n`);
}
