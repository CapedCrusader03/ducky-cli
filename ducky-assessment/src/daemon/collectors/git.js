/**
 * collectors/git.js — Capture git commit activity during the session.
 *
 * Reads git log for commits made after the last seen hash.
 * Also inspects commit metadata for signals of AI-assisted commits
 * (e.g., large diffs, AI-generated commit message patterns).
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { join } from 'path';

const execFileAsync = promisify(execFile);

/** Patterns commonly found in AI-generated commit messages */
const AI_COMMIT_PATTERNS = [
  /\badd\b.*\bfunction\b/i,
  /\brefactor\b/i,
  /\bimplement\b/i,
  /\bgenerated\b/i,
  /\bai[\s-]?(assisted|generated|written)\b/i,
  /^feat:/i,
  /^fix:/i,
  /^chore:/i,
];

/**
 * @param {string} projectRoot
 * @param {string} lastSeenHash - Previously seen latest commit hash (or '' for first run)
 * @returns {Promise<{latestHash: string|null, latestMessage: string, newCommits: number, looksAIGenerated: boolean, diffStats: {filesChanged: number, insertions: number, deletions: number}}>}
 */
export async function collectGit(projectRoot, lastSeenHash) {
  const gitDir = join(projectRoot, '.git');
  if (!existsSync(gitDir)) {
    return { latestHash: null, latestMessage: '', newCommits: 0, looksAIGenerated: false, diffStats: null };
  }

  const execOpts = { cwd: projectRoot, timeout: 10000, windowsHide: true };

  // Get latest commit hash and message
  let latestHash = null;
  let latestMessage = '';
  try {
    const { stdout } = await execFileAsync(
      'git', ['log', '-1', '--format=%H|%s'], execOpts
    );
    const line = stdout.trim();
    if (line) {
      const pipeIdx = line.indexOf('|');
      latestHash = line.slice(0, pipeIdx).trim();
      latestMessage = line.slice(pipeIdx + 1).trim();
    }
  } catch {
    return { latestHash: null, latestMessage: '', newCommits: 0, looksAIGenerated: false, diffStats: null };
  }

  if (!latestHash || latestHash === lastSeenHash) {
    return { latestHash, latestMessage, newCommits: 0, looksAIGenerated: false, diffStats: null };
  }

  // Count new commits since last seen
  let newCommits = 1;
  if (lastSeenHash) {
    try {
      const { stdout } = await execFileAsync(
        'git', ['rev-list', '--count', `${lastSeenHash}..HEAD`], execOpts
      );
      newCommits = parseInt(stdout.trim(), 10) || 1;
    } catch {
      newCommits = 1;
    }
  }

  // Get diff stats for the latest commit
  let diffStats = null;
  try {
    const { stdout } = await execFileAsync(
      'git', ['diff', '--shortstat', `${latestHash}^`, latestHash], execOpts
    );
    const m = stdout.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
    if (m) {
      diffStats = {
        filesChanged: parseInt(m[1], 10) || 0,
        insertions: parseInt(m[2] || '0', 10),
        deletions: parseInt(m[3] || '0', 10),
      };
    }
  } catch {
    // Initial commit has no parent — skip
  }

  // Heuristic: does this look AI-generated?
  const looksAIGenerated =
    AI_COMMIT_PATTERNS.some((re) => re.test(latestMessage)) ||
    (diffStats && diffStats.insertions > 100 && diffStats.filesChanged > 2);

  return {
    latestHash,
    latestMessage,
    newCommits,
    looksAIGenerated,
    diffStats,
    detectedAt: new Date().toISOString(),
  };
}
