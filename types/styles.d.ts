/**
 * @file
 *
 * The types of stylesheet imports, for a project built with the `styles` build option. A plain stylesheet is imported
 * for its side effect; a CSS module (`styles.cssModules`) gives its scoped class names, by their original ones. Add
 * `@mnaoumov/obsidian-dev-toolkit/types/styles` to `compilerOptions.types`.
 *
 * The `*.module.*` patterns come first: among wildcards with equally long prefixes TypeScript takes the first declared,
 * so a `*.css` declared above `*.module.css` typed every CSS module import `any`.
 */

declare module '*.module.css' {
  const classNames: Readonly<Record<string, string>>;
  export default classNames;
}

declare module '*.module.pcss' {
  const classNames: Readonly<Record<string, string>>;
  export default classNames;
}

declare module '*.module.sass' {
  const classNames: Readonly<Record<string, string>>;
  export default classNames;
}

declare module '*.module.scss' {
  const classNames: Readonly<Record<string, string>>;
  export default classNames;
}

declare module '*.css';
declare module '*.pcss';
declare module '*.sass';
declare module '*.scss';
