import {
  mkdtempSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it
} from 'vitest';

import {
  findPluginNameMatches,
  getPluginNames,
  MNAOUMOV_PLUGIN_NAMES,
  THIRD_PARTY_PLUGIN_NAMES
} from './plugin-names.ts';

describe('findPluginNameMatches', () => {
  const names = ['Dataview', 'Make.md', 'Advanced Note Composer', 'Advanced Note'];

  it('should find nothing when no name is listed', () => {
    expect(findPluginNameMatches('Dataview', [])).toEqual([]);
  });

  it('should find every listed name with its offset', () => {
    expect(findPluginNameMatches('Use Dataview with Make.md.', names)).toEqual([
      { index: 4, name: 'Dataview' },
      { index: 18, name: 'Make.md' }
    ]);
  });

  it('should prefer the longer of two names sharing a prefix', () => {
    expect(findPluginNameMatches('Advanced Note Composer', names)).toEqual([{ index: 0, name: 'Advanced Note Composer' }]);
  });

  it('should be case-sensitive', () => {
    expect(findPluginNameMatches('dataview', names)).toEqual([]);
  });

  it.each([
    ['inside a word', 'MyDataview Dataviews'],
    ['in a kebab-case identifier', 'obsidian-Dataview Dataview-plugin'],
    ['in a code span', '`Dataview`'],
    ['in a path', 'src/Dataview Dataview/x'],
    ['in a member access', 'app.Dataview Dataview.api']
  ])('should skip a name %s', (_label, text) => {
    expect(findPluginNameMatches(text, names)).toEqual([]);
  });

  it('should match a name before punctuation that ends a sentence', () => {
    expect(findPluginNameMatches('See Dataview. Then Dataview/, and Dataview\'s API.', names).map((match) => match.index)).toEqual([4, 19, 34]);
  });

  it('should skip a name overlapping an excluded range', () => {
    expect(findPluginNameMatches('Dataview <x Dataview> Dataview', names, [/<x[^>]*>/g])).toEqual([
      { index: 0, name: 'Dataview' },
      { index: 22, name: 'Dataview' }
    ]);
  });
});

describe('getPluginNames', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'plugin-names-'));
  });

  afterEach(() => {
    rmSync(cwd, { force: true, recursive: true });
  });

  it('should return the shared list without a manifest', () => {
    expect(getPluginNames({ cwd })).toEqual([...MNAOUMOV_PLUGIN_NAMES, ...THIRD_PARTY_PLUGIN_NAMES]);
  });

  it('should add the names a project lists, without duplicates', () => {
    expect(getPluginNames({ additionalPluginNames: ['My Plugin', 'Dataview'], cwd }).filter((name) => name === 'My Plugin' || name === 'Dataview')).toEqual([
      'Dataview',
      'My Plugin'
    ]);
  });

  it('should add the project\'s own manifest name', () => {
    writeFileSync(join(cwd, 'manifest.json'), '{"name":"My Own Plugin"}');
    expect(getPluginNames({ cwd })).toContain('My Own Plugin');
  });

  it('should leave out the names a project excludes, whichever source adds them', () => {
    writeFileSync(join(cwd, 'manifest.json'), '{"name":"Patterns"}');
    const names = getPluginNames({ additionalPluginNames: ['My Plugin'], cwd, excludedPluginNames: ['Patterns', 'Dataview', 'My Plugin'] });
    expect(names).not.toContain('Patterns');
    expect(names).not.toContain('Dataview');
    expect(names).not.toContain('My Plugin');
    expect(names).toHaveLength(MNAOUMOV_PLUGIN_NAMES.length + THIRD_PARTY_PLUGIN_NAMES.length - 1);
  });

  it.each([
    ['does not parse', '{'],
    ['is null', 'null'],
    ['has no name', '{}'],
    ['has a non-string name', '{"name":42}'],
    ['has an empty name', '{"name":""}']
  ])('should add nothing when the manifest %s', (_label, content) => {
    writeFileSync(join(cwd, 'manifest.json'), content);
    expect(getPluginNames({ cwd })).toHaveLength(MNAOUMOV_PLUGIN_NAMES.length + THIRD_PARTY_PLUGIN_NAMES.length);
  });
});
