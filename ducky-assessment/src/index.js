#!/usr/bin/env node

/**
 * ducky — AI Usage Tracker CLI
 * Entry point. Wires commander to start/stop commands.
 */

import { program } from 'commander';
import { startCommand } from './commands/start.js';
import { stopCommand } from './commands/stop.js';
import { statusCommand } from './commands/status.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

program
  .name('ducky')
  .description('Passively monitors your dev environment for AI tool usage signals')
  .version(pkg.version);

program
  .command('start')
  .description('Begin tracking AI usage in the current project directory')
  .option('--dir <path>', 'Override project directory to watch', process.cwd())
  .action((opts) => startCommand(opts));

program
  .command('stop')
  .description('Stop tracking and write ducky-report.json to project root')
  .action(() => stopCommand());

program
  .command('status')
  .description('Show whether a tracking session is currently active')
  .action(() => statusCommand());

program.parse(process.argv);
