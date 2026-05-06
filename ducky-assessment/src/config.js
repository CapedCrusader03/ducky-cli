/**
 * config.js — All constants and configuration in one place.
 * Modern developers increasingly use AI coding assistants.
 * [TEST] This line was added by Antigravity to verify file change tracking.
 * [TEST-2] Verifying that this change appears in the new, isolated report.
 * [TEST-3] Final verification of session isolation.
 * [TEST-4] Extra test comment for further tracking.
 */

import { join } from 'path';
import { homedir } from 'os';

export const DUCKY_DIR_NAME = '.ducky';
export const PID_FILE_NAME = 'daemon.pid';
export const META_FILE_NAME = 'session.json';
export const EVENTS_FILE_NAME = 'events.jsonl';
export const REPORT_FILE_NAME = 'ducky-report.json';
export const DAEMON_LOG_FILE_NAME = 'daemon.log';

/** Paths relative to a given project root */
export function getDuckyDir(projectRoot) {
  return join(projectRoot, DUCKY_DIR_NAME);
}
export function getPidPath(projectRoot) {
  return join(getDuckyDir(projectRoot), PID_FILE_NAME);
}
export function getMetaPath(projectRoot) {
  return join(getDuckyDir(projectRoot), META_FILE_NAME);
}
export function getEventsPath(projectRoot) {
  return join(getDuckyDir(projectRoot), EVENTS_FILE_NAME);
}
export function getReportPath(projectRoot) {
  return join(projectRoot, REPORT_FILE_NAME);
}
export function getDaemonLogPath(projectRoot) {
  return join(getDuckyDir(projectRoot), DAEMON_LOG_FILE_NAME);
}

/** Daemon polling intervals (ms) */
export const PROCESS_POLL_INTERVAL_MS = 5000;
export const NETWORK_POLL_INTERVAL_MS = 10000;
export const GIT_POLL_INTERVAL_MS = 15000;
export const CLIPBOARD_POLL_INTERVAL_MS = 3000;

/** Known AI tool process names (cross-platform lowercase match) */
export const AI_PROCESS_NAMES = [
  'copilot',
  'cursor',
  'codeium',
  'tabnine',
  'ollama',
  'claude',
  'gemini',
  'continue',
  'supermaven',
  'aider',
  'ghostwriter',
];

/** AI-related network hostnames to watch for */
export const AI_NETWORK_HOSTS = [
  'api.openai.com',
  'api.anthropic.com',
  'api.githubcopilot.com',
  'copilot-proxy.githubusercontent.com',
  'api.codeium.com',
  'api.tabnine.com',
  'generativelanguage.googleapis.com',
  'api.mistral.ai',
  'api.together.xyz',
  'api.groq.com',
];

/** VS Code / editor extension directories that signal AI tool installation */
export const AI_EDITOR_ARTIFACTS = [
  '.cursor',
  '.copilot',
  '.codeium',
  '.continue',
];

/** File extensions to watch for rapid edits (code files) */
export const WATCHED_EXTENSIONS = new Set([
  '.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.java', '.rs',
  '.c', '.cpp', '.cs', '.rb', '.php', '.swift', '.kt', '.md',
  '.json', '.yaml', '.yml', '.toml', '.sh', '.bash',
]);

/** Minimum bytes of change in a single file event to count as significant */
export const SIGNIFICANT_CHANGE_BYTES = 50;

/** Schema version for session/events/report files — bump on breaking changes */
export const SCHEMA_VERSION = '1.0.0';
