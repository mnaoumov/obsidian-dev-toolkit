/**
 * @file
 *
 * The shared ECMAScript runtime floor for plugin linting and syntax generation.
 */

/**
 * ECMAScript editions a plugin may require from its oldest runtime.
 */
export type ObsidianRuntimeFloor = 'es2020' | 'es2021' | 'es2022' | 'es2023' | 'es2024';

/**
 * Conservative common baseline for Chromium 106 (Electron 21) and iOS 16.6.
 * Installer versions and app versions advance independently; `minAppVersion` cannot select this floor.
 */
export const DEFAULT_OBSIDIAN_RUNTIME_FLOOR: ObsidianRuntimeFloor = 'es2022';
