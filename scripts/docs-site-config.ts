/**
 * @file
 *
 * This repository's documentation site, shared by `astro.config.ts` and the `docs:*` scripts.
 */

import type { DocsSiteConfig } from '@mnaoumov/typescript-dev-toolkit/docs-site/docs-site-config';

import { OBSIDIAN_EXTERNAL_TYPE_LINKS } from '../src/docs-site/obsidian-external-type-links.ts';

export const DOCS_SITE_CONFIG: DocsSiteConfig = {
  externalTypeLinks: OBSIDIAN_EXTERNAL_TYPE_LINKS,
  repo: 'obsidian-dev-toolkit',
  repoHomepage: 'set',
  title: 'Obsidian Dev Toolkit'
};
