import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { testWorkaroundCanaries } from './workaround-canaries.ts';

const mocks = vi.hoisted(() => ({ test: vi.fn() }));

vi.mock('@mnaoumov/typescript-dev-toolkit/test-runners/vitest', () => ({ test: mocks.test }));

describe('testWorkaroundCanaries', () => {
  it('should default to the desktop integration projects and filter on the canary title', async () => {
    await testWorkaroundCanaries();
    expect(mocks.test).toHaveBeenLastCalledWith({
      additionalArguments: ['--testNamePattern', 'workaround canary'],
      projects: ['integration-tests:desktop']
    });
  });

  it('should keep the given projects and arguments', async () => {
    await testWorkaroundCanaries({ additionalArguments: ['--bail=1'], projects: ['integration-tests:android'] });
    expect(mocks.test).toHaveBeenLastCalledWith({
      additionalArguments: ['--bail=1', '--testNamePattern', 'workaround canary'],
      projects: ['integration-tests:android']
    });
  });
});
