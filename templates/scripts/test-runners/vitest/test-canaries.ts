import { testWorkaroundCanaries } from '@mnaoumov/obsidian-dev-toolkit/test-runners/workaround-canaries';
import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';
import process from 'node:process';

const [, , ...additionalArguments] = process.argv;

await wrapCliTask(() => testWorkaroundCanaries({ additionalArguments }));
