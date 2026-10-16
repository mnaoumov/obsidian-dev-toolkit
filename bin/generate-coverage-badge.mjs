#!/usr/bin/env node

// The `generate-coverage-badge` command. The logic lives in `src/test-runners/coverage-badge-cli.ts`, built into `dist/`.
import process from 'node:process';

import { runCoverageBadgeCli } from '../dist/lib/esm/test-runners/coverage-badge-cli.mjs';

process.exitCode = await runCoverageBadgeCli(process.argv.slice(2));
