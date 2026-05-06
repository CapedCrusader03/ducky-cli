/**
 * collectors/filesystem.js — Watch the project directory for file changes.
 *
 * Uses chokidar for reliable cross-platform file watching.
 * Tracks:
 * - Which files changed
 * - Change velocity (events per minute)
 * - Large-batch changes (many files in short time — strong AI signal)
 *
 * Privacy: we record file paths and sizes, NOT file contents.
 */

import chokidar from 'chokidar';
import { statSync, existsSync } from 'fs';
import { WATCHED_EXTENSIONS, SIGNIFICANT_CHANGE_BYTES } from '../../config.js';
import { appendEvent } from '../../lib/events.js';

const BATCH_WINDOW_MS = 2000; // group events within 2s as a single batch
const LARGE_BATCH_THRESHOLD = 5; // ≥5 files in one batch = likely AI autocomplete

/**
 * Start watching the project root.
 * @param {string} projectRoot
 * @returns {() => void} cleanup function to stop the watcher
 */
export function startFileWatcher(projectRoot) {
  let pendingBatch = [];
  let batchTimer = null;

  function flushBatch() {
    if (pendingBatch.length === 0) return;

    const batch = [...pendingBatch];
    pendingBatch = [];
    batchTimer = null;

    const totalBytes = batch.reduce((s, e) => s + (e.bytes || 0), 0);
    const isLargeBatch = batch.length >= LARGE_BATCH_THRESHOLD;

    appendEvent(projectRoot, 'file_change_batch', {
      fileCount: batch.length,
      totalBytes,
      isLargeBatch,
      files: batch.slice(0, 20), // cap at 20 to prevent bloat
      durationMs: Date.now() - batch[0].ts,
    });
  }

  const watcher = chokidar.watch(projectRoot, {
    ignored: [
      /(^|[/\\])\..+/,            // dotfiles/dotdirs
      /node_modules/,
      /\.ducky/,                   // our own data dir
      /ducky-report\.json/,
    ],
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100,
    },
    depth: 8,
  });

  function handleChange(filePath, eventType) {
    const ext = filePath.slice(filePath.lastIndexOf('.'));
    if (!WATCHED_EXTENSIONS.has(ext)) return;

    let bytes = 0;
    try {
      if (existsSync(filePath)) {
        bytes = statSync(filePath).size;
      }
    } catch {
      // file may have been deleted
    }

    if (bytes < SIGNIFICANT_CHANGE_BYTES && eventType !== 'unlink') return;

    pendingBatch.push({
      ts: Date.now(),
      path: filePath.replace(projectRoot, '').replace(/\\/g, '/'), // relativize
      event: eventType,
      bytes,
    });

    // Reset debounce timer
    if (batchTimer) clearTimeout(batchTimer);
    batchTimer = setTimeout(flushBatch, BATCH_WINDOW_MS);
  }

  watcher
    .on('change', (p) => handleChange(p, 'change'))
    .on('add', (p) => handleChange(p, 'add'))
    .on('unlink', (p) => handleChange(p, 'unlink'));

  return () => {
    if (batchTimer) clearTimeout(batchTimer);
    flushBatch();
    watcher.close().catch(() => {});
  };
}
