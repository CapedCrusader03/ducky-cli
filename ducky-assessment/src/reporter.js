/**
 * reporter.js — Aggregate raw events into the final ducky-report.json.
 *
 * Takes all JSONL events + session metadata and produces a structured,
 * human-readable and machine-parseable report.
 *
 * Schema version is embedded for forward compatibility.
 */

import { SCHEMA_VERSION } from './config.js';

/**
 * @param {Object} sessionMeta - From session.json
 * @param {Array}  events      - All events from events.jsonl
 * @param {number} endTimeMs   - Unix ms when stop was called
 * @returns {Object} The full report object
 */
export function buildReport(sessionMeta, events, endTimeMs) {
  const startTimeMs = sessionMeta.startTimeMs || endTimeMs;
  const durationMs = endTimeMs - startTimeMs;

  // --- Partition events by type ---
  const byType = {};
  for (const ev of events) {
    if (!byType[ev.type]) byType[ev.type] = [];
    byType[ev.type].push(ev);
  }

  // --- Process signals ---
  const processEvents = byType['ai_process_detected'] || [];
  const processesSeen = processEvents.map((e) => ({
    name: e.data.name,
    pid: e.data.pid,
    fullName: e.data.fullName,
    firstSeenAt: new Date(e.ts).toISOString(),
  }));

  // --- File change signals ---
  const fileBatches = byType['file_change_batch'] || [];
  const totalFileEvents = fileBatches.reduce((s, e) => s + e.data.fileCount, 0);
  const largeBatches = fileBatches.filter((e) => e.data.isLargeBatch);
  const totalBytesChanged = fileBatches.reduce((s, e) => s + (e.data.totalBytes || 0), 0);

  // Velocity: events per minute
  const durationMinutes = durationMs / 60000 || 1;
  const fileChangeVelocityPerMin = +(totalFileEvents / durationMinutes).toFixed(2);

  // --- Git signals ---
  const gitEvents = byType['git_commit'] || [];
  const aiCommits = gitEvents.filter((e) => e.data.looksAIGenerated);
  const totalInsertions = gitEvents.reduce((s, e) => s + (e.data.diffStats?.insertions || 0), 0);

  // --- Network signals ---
  const networkEvents = byType['ai_network_connection'] || [];
  const aiHostsDetected = [...new Set(networkEvents.map((e) => e.data.host))];

  // --- Clipboard signals ---
  const clipboardEvents = byType['clipboard_change'] || [];
  const aiLikeClipboardPastes = clipboardEvents.filter((e) => e.data.looksLikeAI);
  const codeClipboardPastes = clipboardEvents.filter((e) => e.data.looksLikeCode);

  // --- Editor artifacts ---
  const editorArtifactEvents = byType['editor_artifacts_found'] || [];
  const editorArtifacts = editorArtifactEvents.flatMap((e) => e.data.artifacts || []);

  // --- AI confidence score (0–100) ---
  // A simple heuristic composite score — not intended to be definitive.
  let score = 0;
  if (processesSeen.length > 0) score += 30;
  if (aiHostsDetected.length > 0) score += 25;
  if (largeBatches.length > 0) score += 15;
  if (aiLikeClipboardPastes.length > 0) score += 15;
  if (aiCommits.length > 0) score += 10;
  if (editorArtifacts.length > 0) score += 5;
  score = Math.min(score, 100);

  return {
    schemaVersion: SCHEMA_VERSION,
    metadata: {
      sessionStart: sessionMeta.startTime || new Date(startTimeMs).toISOString(),
      sessionEnd: new Date(endTimeMs).toISOString(),
      durationMs,
      durationFormatted: formatDuration(durationMs),
      projectDirectory: sessionMeta.projectRoot || 'unknown',
      daemonPid: sessionMeta.pid || null,
      totalEventsRecorded: events.length,
    },
    aiConfidenceScore: score,
    aiConfidenceExplanation: explainScore(score),
    tracking: {
      processesSeen,
      fileChanges: {
        totalEvents: totalFileEvents,
        totalBatches: fileBatches.length,
        largeBatches: largeBatches.length,
        totalBytesChanged,
        velocityPerMinute: fileChangeVelocityPerMin,
        largeBatchDetails: largeBatches.slice(0, 10).map((e) => ({
          fileCount: e.data.fileCount,
          files: e.data.files,
          totalBytes: e.data.totalBytes,
          at: new Date(e.ts).toISOString(),
        })),
      },
      git: {
        commitsDuringSession: gitEvents.length,
        commitsLookingAIGenerated: aiCommits.length,
        totalInsertions,
        commits: gitEvents.slice(0, 50).map((e) => ({
          hash: e.data.latestHash,
          message: e.data.latestMessage,
          looksAIGenerated: e.data.looksAIGenerated,
          diffStats: e.data.diffStats,
          at: new Date(e.ts).toISOString(),
        })),
      },
      network: {
        aiHostsDetected,
        totalConnectionEvents: networkEvents.length,
        connections: networkEvents.slice(0, 50).map((e) => ({
          host: e.data.host,
          state: e.data.state,
          at: new Date(e.ts).toISOString(),
        })),
      },
      clipboard: {
        totalChanges: clipboardEvents.length,
        codeChanges: codeClipboardPastes.length,
        likelyAICodePastes: aiLikeClipboardPastes.length,
        events: clipboardEvents.slice(0, 50).map((e) => ({
          charCount: e.data.charCount,
          lineCount: e.data.lineCount,
          looksLikeCode: e.data.looksLikeCode,
          looksLikeAI: e.data.looksLikeAI,
          at: new Date(e.ts).toISOString(),
        })),
      },
      editorArtifacts,
    },
  };
}

function formatDuration(ms) {
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h > 0 ? h + 'h ' : ''}${m}m ${s}s`;
}

function explainScore(score) {
  if (score >= 70) return 'Strong signals of AI tool usage detected across multiple categories.';
  if (score >= 40) return 'Moderate signals of AI tool usage detected.';
  if (score >= 15) return 'Weak signals — some AI indicators present but inconclusive.';
  return 'No significant AI usage signals detected.';
}
