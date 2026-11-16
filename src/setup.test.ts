import type { HookRegistrar } from '@mnaoumov/typescript-test-toolkit/setup';

import { ObsidianLibrary } from '@mnaoumov/obsidian-lib/library';
import { getObsidianLibState } from '@mnaoumov/obsidian-lib/obsidian-lib-state';
import { noop } from '@mnaoumov/typescript-lib/function';
import { assertNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { setup } from './setup.ts';

const { mockRestoreNodeTextCodecGlobals, mockSetupGeneric } = vi.hoisted(() => ({
  mockRestoreNodeTextCodecGlobals: vi.fn(),
  mockSetupGeneric: vi.fn()
}));

vi.mock('@mnaoumov/typescript-test-toolkit/setup', () => ({
  setup: mockSetupGeneric
}));

vi.mock('./node-text-codec-globals.ts', () => ({
  restoreNodeTextCodecGlobals: mockRestoreNodeTextCodecGlobals
}));

describe('setup', () => {
  it('should restore the text codecs, then register the Obsidian reset before handing the hooks to the generic setup', () => {
    const order: string[] = [];
    mockRestoreNodeTextCodecGlobals.mockImplementation(() => {
      order.push('text codecs');
    });
    const beforeEach = vi.fn<HookRegistrar>(() => {
      order.push('obsidian beforeEach');
    });
    mockSetupGeneric.mockImplementation(() => {
      order.push('generic setup');
    });

    const params = { afterAll: noop, afterEach: noop, beforeEach };
    setup(params);

    expect(order).toEqual(['text codecs', 'obsidian beforeEach', 'generic setup']);
    expect(mockSetupGeneric).toHaveBeenCalledWith(params);
  });

  it('should reset the __obsidianLib bag and the Obsidian library context before each test', async () => {
    let beforeEachCallback: Parameters<HookRegistrar>[0] | undefined;
    setup({
      afterAll: noop,
      afterEach: noop,
      beforeEach: ($function) => {
        beforeEachCallback = $function;
      }
    });

    const before = getObsidianLibState('setup-test-key', 'a');
    before.value = 'mutated';
    ObsidianLibrary.init({ cssClassScope: 'mutated-scope' });

    assertNonNullable(beforeEachCallback);
    await beforeEachCallback();

    const after = getObsidianLibState('setup-test-key', 'b');
    expect(after).not.toBe(before);
    expect(after.value).toBe('b');
    expect(ObsidianLibrary.cssClassScope).toBe('');
  });
});
