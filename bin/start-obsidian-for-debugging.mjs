#!/usr/bin/env node

// The `start-obsidian-for-debugging` command. The logic lives in `src/obsidian-debug-launcher-cli.ts`, built into `dist/`.
import process from 'node:process';

import { runStartObsidianForDebuggingCli } from '../dist/lib/esm/obsidian-debug-launcher-cli.mjs';

process.exitCode = await runStartObsidianForDebuggingCli(process.argv.slice(2));
