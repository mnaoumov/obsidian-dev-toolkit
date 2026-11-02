#!/usr/bin/env node

// The `check-plugin` command. The logic lives in `src/plugin-check-cli.ts`, built into `dist/`.
import process from 'node:process';

import { runCheckPluginCli } from '../dist/lib/esm/plugin-check-cli.mjs';

process.exitCode = await runCheckPluginCli(process.argv.slice(2));
