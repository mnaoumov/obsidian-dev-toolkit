import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';
import { testCoverage } from '@mnaoumov/typescript-dev-toolkit/test-runners/vitest';
import process from 'node:process';

const [, , ...additionalArguments] = process.argv;

const FULL_COVERAGE_IN_PERCENTS = 100;

await wrapCliTask(() =>
  testCoverage({
    additionalArguments,
    minCoverageInPercents: FULL_COVERAGE_IN_PERCENTS
  })
);
