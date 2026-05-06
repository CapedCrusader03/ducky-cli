/**
 * collectors/network.js — Detect active connections to known AI API hosts.
 *
 * Cross-platform: uses `netstat` with different flags per platform.
 * Only logs presence/metadata — no packet content.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { AI_NETWORK_HOSTS } from '../../config.js';

const execFileAsync = promisify(execFile);

/**
 * @returns {Promise<Array<{host: string, state: string, detectedAt: string}>>}
 */
export async function collectNetwork() {
  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  let output = '';
  try {
    if (isWindows) {
      const { stdout } = await execFileAsync('netstat', ['-n'], { timeout: 8000 });
      output = stdout;
    } else if (isMac) {
      const { stdout } = await execFileAsync('netstat', ['-n', '-f', 'inet'], { timeout: 8000 });
      output = stdout;
    } else {
      // Linux
      const { stdout } = await execFileAsync('ss', ['-tn'], { timeout: 8000 });
      output = stdout;
    }
  } catch {
    return [];
  }

  // netstat/ss gives us IPs, not hostnames. We do a reverse check:
  // Resolve AI hostnames to IPs once and match against connection list.
  // For speed and reliability, we attempt a lightweight DNS lookup per host.
  const { resolve4 } = await import('dns/promises');

  const hostIpMap = new Map();
  for (const host of AI_NETWORK_HOSTS) {
    try {
      const ips = await resolve4(host);
      for (const ip of ips) {
        hostIpMap.set(ip, host);
      }
    } catch {
      // DNS failure is normal (no internet, NXDOMAIN) — skip
    }
  }

  const hits = [];
  const lines = output.split('\n').filter(Boolean);

  for (const line of lines) {
    for (const [ip, host] of hostIpMap) {
      if (line.includes(ip)) {
        // Extract connection state if possible
        const stateMatch = line.match(/\b(ESTABLISHED|TIME_WAIT|CLOSE_WAIT|SYN_SENT)\b/i);
        hits.push({
          host,
          ip,
          state: stateMatch ? stateMatch[1] : 'DETECTED',
          detectedAt: new Date().toISOString(),
        });
        break;
      }
    }
  }

  return hits;
}
