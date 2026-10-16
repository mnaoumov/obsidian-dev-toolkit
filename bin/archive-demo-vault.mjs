#!/usr/bin/env node

// The `archive-demo-vault` command. The logic lives in `src/demo-vault-cli.ts`, built into `dist/`.
import process from 'node:process';

import { runArchiveDemoVaultCli } from '../dist/lib/esm/demo-vault-cli.mjs';

process.exitCode = await runArchiveDemoVaultCli();
