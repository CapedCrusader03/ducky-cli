/**
 * status.js — `ducky status` command handler.
 * Prints whether a tracking session is currently active.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { getLivePid } from '../lib/pid.js';
import { getMetaPath } from '../config.js';

export function statusCommand() {
  const projectRoot = resolve(process.cwd());
  const livePid = getLivePid(projectRoot);

  if (livePid === null) {
    console.log(`\n🦆 ducky: No active session in ${projectRoot}\n`);
    return;
  }

  const metaPath = getMetaPath(projectRoot);
  let meta = {};
  if (existsSync(metaPath)) {
    try {
      meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    } catch {
      meta = {};
    }
  }

  const startTime = meta.startTime || 'unknown';
  const elapsed = meta.startTimeMs
    ? Math.round((Date.now() - meta.startTimeMs) / 1000)
    : null;
  const elapsedStr = elapsed !== null
    ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
    : 'unknown';

  console.log(`\n🦆 ducky: Session ACTIVE`);
  console.log(`   Project : ${projectRoot}`);
  console.log(`   Started : ${startTime}`);
  console.log(`   Elapsed : ${elapsedStr}`);
  console.log(`   Daemon  : PID ${livePid}\n`);
}
