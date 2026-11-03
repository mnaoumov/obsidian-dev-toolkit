/**
 * @file
 *
 * Bundled browser worker source, enabled with the `workers` build option.
 */
declare module '*.worker.ts?worker-source' {
  const source: string;
  export default source;
}

declare module '*.worker.js?worker-source' {
  const source: string;
  export default source;
}
