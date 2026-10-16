import {
  describe,
  expect,
  it
} from 'vitest';

import { OBSIDIAN_EXTERNAL_TYPE_LINKS } from './obsidian-external-type-links.ts';

describe('OBSIDIAN_EXTERNAL_TYPE_LINKS', () => {
  it('should link the CodeMirror types to the CodeMirror reference', () => {
    expect(OBSIDIAN_EXTERNAL_TYPE_LINKS.get('Extension')).toBe('https://codemirror.net/docs/ref/#state.Extension');
    expect(OBSIDIAN_EXTERNAL_TYPE_LINKS.get('DecorationSet')).toBe('https://codemirror.net/docs/ref/#view.DecorationSet');
  });

  it('should link the Moment types to the Moment documentation', () => {
    expect(OBSIDIAN_EXTERNAL_TYPE_LINKS.get('Moment')).toBe('https://momentjs.com/docs/#/parsing/');
    expect(OBSIDIAN_EXTERNAL_TYPE_LINKS.get('MomentInput')).toBe('https://momentjs.com/docs/#/parsing/');
  });

  it('should link every entry to an absolute https URL', () => {
    for (const url of OBSIDIAN_EXTERNAL_TYPE_LINKS.values()) {
      expect(url).toMatch(/^https:\/\//u);
    }
  });
});
