/**
 * collectors/processes.js — Detect running AI tool processes.
 *
 * Cross-platform: uses `tasklist` on Windows, `ps` on POSIX.
 * Returns only processes that match known AI tool names.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { AI_PROCESS_NAMES } from '../../config.js';

const execFileAsync = promisify(execFile);

/**
 * @returns {Promise<Array<{name: string, pid: number|null, fullName: string}>>}
 */
export async function collectProcesses() {
  const isWindows = process.platform === 'win32';

  let output = '';
  try {
    if (isWindows) {
      const { stdout } = await execFileAsync('tasklist', ['/FO', 'CSV', '/NH'], {
        timeout: 5000,
        windowsHide: true,
      });
      output = stdout;
    } else {
      const { stdout } = await execFileAsync('ps', ['-eo', 'pid,comm'], {
        timeout: 5000,
        windowsHide: true,
      });
      output = stdout;
    }
  } catch {
    return [];
  }

  const lines = output.split('\n').filter(Boolean);
  const matched = [];

  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    for (const aiName of AI_PROCESS_NAMES) {
      if (lowerLine.includes(aiName)) {
        let pid = null;

        if (isWindows) {
          // CSV format: "Image Name","PID","Session Name","Session#","Mem Usage"
          const parts = line.split(',');
          if (parts.length >= 2) {
            pid = parseInt(parts[1].replace(/"/g, '').trim(), 10) || null;
          }
        } else {
          const parts = line.trim().split(/\s+/);
          pid = parseInt(parts[0], 10) || null;
        }

        // Skip our own daemon PID
        if (pid === process.pid) continue;

        matched.push({
          name: aiName,
          pid,
          fullName: line.trim().split(',')[0]?.replace(/"/g, '').trim() || aiName,
          detectedAt: new Date().toISOString(),
        });
        break; // one match per line
      }
    }
  }

  return matched;
}
