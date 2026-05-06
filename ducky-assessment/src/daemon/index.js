/**
 * daemon/index.js — Long-running background process.
 *
 * This is spawned by `ducky start` as a detached child.
 * It owns all collectors and writes events to .ducky/events.jsonl.
 *
 * Shutdown contract:
 * - SIGTERM / SIGINT → graceful flush and exit
 * - Uncaught exceptions → log to daemon.log, attempt flush, exit
 *
 * The project root is received via DUCKY_PROJECT_ROOT env var.
 */

import { existsSync, appendFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import {
  getDaemonLogPath,
  getDuckyDir,
  PROCESS_POLL_INTERVAL_MS,
  NETWORK_POLL_INTERVAL_MS,
  GIT_POLL_INTERVAL_MS,
  CLIPBOARD_POLL_INTERVAL_MS,
} from '../config.js';
import { collectProcesses } from './collectors/processes.js';
import { collectNetwork } from './collectors/network.js';
import { collectGit } from './collectors/git.js';
import { collectEditorArtifacts } from './collectors/editor.js';
import { startFileWatcher } from './collectors/filesystem.js';
import { collectClipboard } from './collectors/clipboard.js';
import { appendEvent } from '../lib/events.js';

// --- Validate environment ---
const projectRoot = process.env.DUCKY_PROJECT_ROOT
  ? resolve(process.env.DUCKY_PROJECT_ROOT)
  : null;

if (!projectRoot || !existsSync(projectRoot)) {
  process.stderr.write(`[ducky daemon] FATAL: Invalid DUCKY_PROJECT_ROOT: ${projectRoot}\n`);
  process.exit(1);
}

const duckyDir = getDuckyDir(projectRoot);
mkdirSync(duckyDir, { recursive: true });

const logPath = getDaemonLogPath(projectRoot);

function daemonLog(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    appendFileSync(logPath, line, 'utf8');
  } catch {
    // If we can't write logs, we still continue running
  }
}

daemonLog(`Daemon started. PID=${process.pid} projectRoot=${projectRoot}`);

// --- Emit a startup event ---
appendEvent(projectRoot, 'daemon_start', { pid: process.pid });

// --- Start file watcher (returns a cleanup function) ---
let stopFileWatcher = () => {};
try {
  stopFileWatcher = startFileWatcher(projectRoot);
} catch (err) {
  daemonLog(`FileWatcher init failed: ${err.message}`);
}

// --- Scan editor artifacts once at start ---
try {
  const editorArtifacts = collectEditorArtifacts(projectRoot);
  if (editorArtifacts.length > 0) {
    appendEvent(projectRoot, 'editor_artifacts_found', { artifacts: editorArtifacts });
    daemonLog(`Editor artifacts: ${editorArtifacts.join(', ')}`);
  }
} catch (err) {
  daemonLog(`EditorArtifacts error: ${err.message}`);
}

// --- Polling loops ---

// Track seen process names to avoid flooding events with duplicates
const seenProcesses = new Set();
let lastClipboard = '';
let lastGitHash = '';

async function pollProcesses() {
  try {
    const aiProcs = await collectProcesses();
    for (const proc of aiProcs) {
      if (!seenProcesses.has(proc.name)) {
        seenProcesses.add(proc.name);
        appendEvent(projectRoot, 'ai_process_detected', proc);
        daemonLog(`AI process: ${proc.name} (PID ${proc.pid})`);
      }
    }
  } catch (err) {
    daemonLog(`Process poll error: ${err.message}`);
  }
}

async function pollNetwork() {
  try {
    const hits = await collectNetwork();
    for (const hit of hits) {
      appendEvent(projectRoot, 'ai_network_connection', hit);
      daemonLog(`Network AI hit: ${hit.host}`);
    }
  } catch (err) {
    daemonLog(`Network poll error: ${err.message}`);
  }
}

async function pollGit() {
  try {
    const gitData = await collectGit(projectRoot, lastGitHash);
    if (gitData.latestHash && gitData.latestHash !== lastGitHash) {
      lastGitHash = gitData.latestHash;
      appendEvent(projectRoot, 'git_commit', gitData);
      daemonLog(`Git commit: ${gitData.latestHash?.slice(0, 8)} "${gitData.latestMessage}"`);
    }
  } catch (err) {
    daemonLog(`Git poll error: ${err.message}`);
  }
}

async function pollClipboard() {
  try {
    const text = await collectClipboard();
    if (text && text !== lastClipboard && text.length > 0) {
      lastClipboard = text;
      // We record metadata about the clipboard content, NOT the content itself
      // (privacy: we only store size, language guess, and whether it looks AI-generated)
      const lineCount = text.split('\n').length;
      const charCount = text.length;
      const looksLikeCode = /^\s*(function|def |class |import |export |const |let |var |if |for |while |return )/m.test(text);
      const looksLikeAI = charCount > 200 && looksLikeCode;

      appendEvent(projectRoot, 'clipboard_change', {
        charCount,
        lineCount,
        looksLikeCode,
        looksLikeAI,
      });
    }
  } catch {
    // Clipboard access can fail on headless or restricted environments — ignore silently
  }
}

// --- Set up intervals ---
const intervals = [
  setInterval(pollProcesses, PROCESS_POLL_INTERVAL_MS),
  setInterval(pollNetwork, NETWORK_POLL_INTERVAL_MS),
  setInterval(pollGit, GIT_POLL_INTERVAL_MS),
  setInterval(pollClipboard, CLIPBOARD_POLL_INTERVAL_MS),
];

// Run immediately on start
pollProcesses();
pollNetwork();
pollGit();
pollClipboard();

// --- Graceful shutdown ---
async function shutdown(signal) {
  daemonLog(`Received ${signal}. Shutting down.`);
  for (const iv of intervals) clearInterval(iv);
  stopFileWatcher();
  appendEvent(projectRoot, 'daemon_stop', { signal, pid: process.pid });
  daemonLog(`Daemon stopped.`);
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  daemonLog(`UNCAUGHT EXCEPTION: ${err.stack || err.message}`);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  daemonLog(`UNHANDLED REJECTION: ${String(reason)}`);
});
