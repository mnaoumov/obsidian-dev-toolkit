#!/usr/bin/env node

// The `generate-debug-config` command. Logic is built from `src/debug-config-cli.ts`.
import process from 'node:process';

import { runGenerateDebugConfigCli } from '../dist/lib/esm/debug-config-cli.mjs';

process.exitCode = await runGenerateDebugConfigCli(process.argv.slice(2));
