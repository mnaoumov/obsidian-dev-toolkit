#!/usr/bin/env node

// The `generate-vscode-debug-config` command. Logic is built from `src/vscode-debug-config-cli.ts`.
import process from 'node:process';

import { runGenerateVsCodeDebugConfigCli } from '../dist/lib/esm/vscode-debug-config-cli.mjs';

process.exitCode = await runGenerateVsCodeDebugConfigCli(process.argv.slice(2));
