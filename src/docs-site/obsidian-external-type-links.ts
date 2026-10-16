/**
 * @file
 *
 * The Obsidian layer of a documentation site's external type links, for `DocsSiteConfig.externalTypeLinks` of
 * `@mnaoumov/typescript-dev-toolkit/docs-site/docs-site-config`.
 *
 * The generic builder's own map covers the TypeScript and DOM libraries only, leaving an ecosystem's references to
 * the layer documenting it, as this package's ESLint config layers on the generic one. An Obsidian plugin's API names
 * the CodeMirror and Moment types Obsidian re-exports, which no documented package declares.
 */

// Cspell:disable -- URL fragments are not words
/**
 * The CodeMirror and Moment type names an Obsidian package's API names, mapped to the page their references link to.
 *
 * Pass it as a site's `externalTypeLinks`, or spread it into a larger map:
 *
 * ```ts
 * export const DOCS_SITE_CONFIG: DocsSiteConfig = {
 *   externalTypeLinks: OBSIDIAN_EXTERNAL_TYPE_LINKS,
 *   repo: 'my-package',
 *   title: 'My Package'
 * };
 * ```
 */
export const OBSIDIAN_EXTERNAL_TYPE_LINKS: ReadonlyMap<string, string> = new Map<string, string>([
  ['ChangeSpec', 'https://codemirror.net/docs/ref/#state.ChangeSpec'],
  ['CharCategory', 'https://codemirror.net/docs/ref/#state.CharCategory'],
  ['DecorationSet', 'https://codemirror.net/docs/ref/#view.DecorationSet'],
  ['Direction', 'https://codemirror.net/docs/ref/#view.Direction'],
  ['DOMEventHandlers', 'https://codemirror.net/docs/ref/#view.DOMEventHandlers'],
  ['Extension', 'https://codemirror.net/docs/ref/#state.Extension'],
  ['FacetReader', 'https://codemirror.net/docs/ref/#state.FacetReader'],
  ['Moment', 'https://momentjs.com/docs/#/parsing/'],
  ['MomentInput', 'https://momentjs.com/docs/#/parsing/'],
  ['RangeCursor', 'https://codemirror.net/docs/ref/#state.RangeCursor']
]);
// Cspell:enable
