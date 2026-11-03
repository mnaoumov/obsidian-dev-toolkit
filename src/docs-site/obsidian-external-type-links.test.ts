import { renderTypeWithLinks } from '@mnaoumov/typescript-dev-toolkit/docs-site/api-doc-link-rendering';
import { configureApiDocs } from '@mnaoumov/typescript-dev-toolkit/docs-site/api-doc-settings';
import {
  describe,
  expect,
  it
} from 'vitest';

import { OBSIDIAN_EXTERNAL_TYPE_LINKS } from './obsidian-external-type-links.ts';

describe('OBSIDIAN_EXTERNAL_TYPE_LINKS', () => {
  it('should link public classes, interfaces and aliases in rendered type text', () => {
    configureApiDocs({
      basePath: '/fixture',
      externalTypeLinks: OBSIDIAN_EXTERNAL_TYPE_LINKS,
      outputDirectory: '',
      packageName: 'fixture',
      packageSites: new Map(),
      sidebarFile: ''
    });
    expect(renderTypeWithLinks('App | Command | IconName', new Map())).toBe(
      '[App](https://docs.obsidian.md/Reference/TypeScript%20API/App) | [Command](https://docs.obsidian.md/Reference/TypeScript%20API/Command) | [IconName](https://docs.obsidian.md/Reference/TypeScript%20API/IconName)'
    );
    expect(renderTypeWithLinks(
      'App',
      new Map([['fixture#App', {
        baseTypes: [],
        description: '',
        enumMembers: [],
        examples: [],
        implementsTypes: [],
        kind: 'class',
        methods: [],
        name: 'App',
        namespace: 'fixture',
        properties: [],
        remarks: '',
        typeParameters: []
      }]])
    )).toBe('[App](/fixture/api/fixture/App/)');
  });

  it('should include further public types but exclude functions and undocumented names', () => {
    for (const name of ['TFile', 'WorkspaceLeaf', 'EditorPosition', 'PluginManifest', 'PaneType', 'RequestUrlResponse']) {
      expect(OBSIDIAN_EXTERNAL_TYPE_LINKS.get(name)).toBe(`https://docs.obsidian.md/Reference/TypeScript%20API/${name}`);
    }
    for (const name of ['requestUrl', 'apiVersion', 'HTMLElement', 'UndocumentedType']) {
      expect(OBSIDIAN_EXTERNAL_TYPE_LINKS.has(name)).toBe(false);
    }
  });

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
