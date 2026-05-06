/**
 * pid.js — PID file management.
 * Handles writing, reading, validating, and cleaning up the daemon PID file.
 * All operations are explicit and throw on unexpected failures.
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { getDuckyDir, getPidPath } from '../config.js';

/**
 * Write a PID file for the given project root.
 * @param {string} projectRoot
 * @param {number} pid
 */
export function writePid(projectRoot, pid) {
  const dir = getDuckyDir(projectRoot);
  mkdirSync(dir, { recursive: true });
  writeFileSync(getPidPath(projectRoot), String(pid), 'utf8');
}

/**
 * Read the PID from the PID file, or null if it does not exist.
 * @param {string} projectRoot
 * @returns {number|null}
 */
export function readPid(projectRoot) {
  const pidPath = getPidPath(projectRoot);
  if (!existsSync(pidPath)) return null;
  const raw = readFileSync(pidPath, 'utf8').trim();
  const pid = parseInt(raw, 10);
  if (isNaN(pid) || pid <= 0) return null;
  return pid;
}

/**
 * Check whether a process with the given PID is actually alive.
 * Uses signal 0 — no-op, just checks existence.
 * @param {number} pid
 * @returns {boolean}
 */
export function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove the PID file if it exists. Safe to call even if file is missing.
 * @param {string} projectRoot
 */
export function removePid(projectRoot) {
  const pidPath = getPidPath(projectRoot);
  if (existsSync(pidPath)) {
    unlinkSync(pidPath);
  }
}

/**
 * Returns the live PID if a daemon is running, otherwise null.
 * Also cleans up stale PID files left from crashed daemons.
 * @param {string} projectRoot
 * @returns {number|null}
 */
export function getLivePid(projectRoot) {
  const pid = readPid(projectRoot);
  if (pid === null) return null;
  if (isPidAlive(pid)) return pid;
  // Stale PID — clean it up
  removePid(projectRoot);
  return null;
}
