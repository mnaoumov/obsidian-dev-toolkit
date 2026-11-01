#!/usr/bin/env node

// The `deploy-to-device` command. The logic lives in `src/device-deployment-cli.ts`, built into `dist/`.
import process from 'node:process';

import { runDeployToDeviceCli } from '../dist/lib/esm/device-deployment-cli.mjs';

process.exitCode = await runDeployToDeviceCli(process.argv.slice(2));
