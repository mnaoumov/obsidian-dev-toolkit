import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';
import { test } from '@mnaoumov/typescript-dev-toolkit/test-runners/vitest';
import process from 'node:process';

const [, , ...additionalArguments] = process.argv;

await wrapCliTask(() => test({ additionalArguments }));
