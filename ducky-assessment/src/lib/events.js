/**
 * events.js — Append-only event log writer and reader.
 * Events are stored as newline-delimited JSON (JSONL) for minimal I/O overhead
 * and safe concurrent appends from a single daemon process.
 */

import { appendFileSync, existsSync, readFileSync, mkdirSync } from 'fs';
import { getDuckyDir, getEventsPath, SCHEMA_VERSION } from '../config.js';

/**
 * @typedef {Object} DuckyEvent
 * @property {string} type - Event category (e.g. 'process_detected', 'file_change')
 * @property {number} ts - Unix timestamp in milliseconds
 * @property {string} schemaVersion - Schema version for forward compat
 * @property {Object} data - Arbitrary payload for this event type
 */

/**
 * Append a single event to the events log.
 * @param {string} projectRoot
 * @param {string} type
 * @param {Object} data
 */
export function appendEvent(projectRoot, type, data) {
  const dir = getDuckyDir(projectRoot);
  mkdirSync(dir, { recursive: true });

  /** @type {DuckyEvent} */
  const event = {
    type,
    ts: Date.now(),
    schemaVersion: SCHEMA_VERSION,
    data,
  };

  appendFileSync(getEventsPath(projectRoot), JSON.stringify(event) + '\n', 'utf8');
}

/**
 * Read all events from the log. Returns empty array if file doesn't exist.
 * @param {string} projectRoot
 * @returns {DuckyEvent[]}
 */
export function readAllEvents(projectRoot) {
  const eventsPath = getEventsPath(projectRoot);
  if (!existsSync(eventsPath)) return [];

  const raw = readFileSync(eventsPath, 'utf8').trim();
  if (!raw) return [];

  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        // Corrupt line — skip gracefully, do not crash
        return null;
      }
    })
    .filter(Boolean);
}
