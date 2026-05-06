/**
 * collectors/editor.js — Detect AI-related editor extensions and config directories.
 *
 * Checks the home directory and project root for well-known directories
 * and config files that indicate AI tools are installed.
 * This is a one-shot scan (called once at daemon startup).
 */

import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { AI_EDITOR_ARTIFACTS } from '../../config.js';

/** VS Code extensions directory by platform */
function getVSCodeExtensionsDir() {
  const home = homedir();
  if (process.platform === 'win32') {
    return join(home, '.vscode', 'extensions');
  } else if (process.platform === 'darwin') {
    return join(home, '.vscode', 'extensions');
  } else {
    return join(home, '.vscode', 'extensions');
  }
}

/** Known AI extension publisher prefixes */
const AI_EXTENSION_PREFIXES = [
  'github.copilot',
  'codeium',
  'tabnine',
  'continue',
  'supermaven',
  'amazonwebservices.aws-toolkit',
  'google.cloudcode',
  'saoudrizwan.claude',
];

/**
 * Returns an array of artifact descriptions found.
 * @param {string} projectRoot
 * @returns {string[]}
 */
export function collectEditorArtifacts(projectRoot) {
  const found = [];

  // Check project root for AI config dirs (.cursor, .copilot, etc.)
  for (const artifact of AI_EDITOR_ARTIFACTS) {
    const p = join(projectRoot, artifact);
    if (existsSync(p)) {
      found.push(`project:${artifact}`);
    }
  }

  // Check home directory for same artifacts
  const home = homedir();
  for (const artifact of AI_EDITOR_ARTIFACTS) {
    const p = join(home, artifact);
    if (existsSync(p)) {
      found.push(`home:${artifact}`);
    }
  }

  // Check VS Code extensions
  const extDir = getVSCodeExtensionsDir();
  if (existsSync(extDir)) {
    try {
      const extensions = readdirSync(extDir);
      for (const ext of extensions) {
        const lc = ext.toLowerCase();
        for (const prefix of AI_EXTENSION_PREFIXES) {
          if (lc.startsWith(prefix)) {
            found.push(`vscode-ext:${ext}`);
            break;
          }
        }
      }
    } catch {
      // Read failure — permission denied or dir gone
    }
  }

  // Check for Cursor IDE installation
  const cursorPaths = [
    join(homedir(), '.cursor'),
    join(homedir(), 'AppData', 'Local', 'Programs', 'cursor'), // Windows
    '/Applications/Cursor.app',                                  // macOS
    '/usr/bin/cursor',                                            // Linux
  ];
  for (const p of cursorPaths) {
    if (existsSync(p)) {
      found.push(`cursor-ide:${p}`);
      break;
    }
  }

  return found;
}
