import {
  TextDecoder,
  TextEncoder
} from 'node:util';
import {
  describe,
  expect,
  it
} from 'vitest';

import { restoreNodeTextCodecGlobals } from './node-text-codec-globals.ts';

describe('restoreNodeTextCodecGlobals', () => {
  it('should define the missing codecs from node:util', () => {
    const target: Record<string, unknown> = {};

    restoreNodeTextCodecGlobals(target);

    expect(target['TextEncoder']).toBe(TextEncoder);
    expect(target['TextDecoder']).toBe(TextDecoder);
    expect(Object.getOwnPropertyDescriptor(target, 'TextEncoder')).toEqual({
      configurable: true,
      enumerable: false,
      value: TextEncoder,
      writable: true
    });
  });

  it('should leave a codec the target already has', () => {
    const OwnTextEncoder = Symbol('own TextEncoder');
    const target: Record<string, unknown> = { TextEncoder: OwnTextEncoder };

    restoreNodeTextCodecGlobals(target);

    expect(target['TextEncoder']).toBe(OwnTextEncoder);
    expect(target['TextDecoder']).toBe(TextDecoder);
  });

  it('should default to globalThis', () => {
    restoreNodeTextCodecGlobals();

    expect(new globalThis.TextDecoder().decode(new globalThis.TextEncoder().encode('ü'))).toBe('ü');
  });
});
