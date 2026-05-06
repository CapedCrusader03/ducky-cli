/**
 * collectors/clipboard.js — Read the system clipboard.
 *
 * Cross-platform approach:
 * - Windows: PowerShell Get-Clipboard
 * - macOS:   pbpaste
 * - Linux:   xclip -selection clipboard -o (if available)
 *
 * We return the raw text — the daemon decides what metadata to log.
 * We never write clipboard contents to disk.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Read current clipboard text.
 * Returns empty string if unavailable or on error.
 * @returns {Promise<string>}
 */
export async function collectClipboard() {
  const platform = process.platform;

  try {
    if (platform === 'win32') {
      const { stdout } = await execFileAsync(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-Command', 'Get-Clipboard'],
        { timeout: 3000 }
      );
      return stdout || '';
    } else if (platform === 'darwin') {
      const { stdout } = await execFileAsync('pbpaste', [], { timeout: 3000 });
      return stdout || '';
    } else {
      // Linux — try xclip, fall back to xsel
      try {
        const { stdout } = await execFileAsync(
          'xclip', ['-selection', 'clipboard', '-o'], { timeout: 3000 }
        );
        return stdout || '';
      } catch {
        const { stdout } = await execFileAsync(
          'xsel', ['--clipboard', '--output'], { timeout: 3000 }
        );
        return stdout || '';
      }
    }
  } catch {
    return '';
  }
}
