/**
 * @file
 *
 * The type of a WebAssembly module import, for a project built with the `wasm` build option: the module's bytes,
 * ready for `WebAssembly.instantiate`. Add `@mnaoumov/obsidian-dev-toolkit/types/wasm` to `compilerOptions.types`.
 */

declare module '*.wasm' {
  const bytes: Uint8Array<ArrayBuffer>;
  export default bytes;
}
