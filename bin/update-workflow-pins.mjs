#!/usr/bin/env node

// The `update-workflow-pins` command. The logic lives in `src/workflow-pins-cli.ts`, built into `dist/`.
import process from 'node:process';

import { runUpdateWorkflowPinsCli } from '../dist/lib/esm/workflow-pins-cli.mjs';

process.exitCode = await runUpdateWorkflowPinsCli(process.argv.slice(2));
