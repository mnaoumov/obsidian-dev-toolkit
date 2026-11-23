/**
 * @file
 *
 * Fails the build when the published output (`dist/lib` and `bin/`) imports a package that `package.json` does not
 * install for a consumer, or when `package.json` makes a consumer install a package the output never reaches.
 */

import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';
import { validateDependencies } from '@mnaoumov/typescript-dev-toolkit/validate-dependencies';

const OPTIONAL_PEER_LOADED_BY_NAME = 'Optional peer, loaded from the project by name at call time (importOptionalPeer / requireOptionalPeer / resolveOptionalPeer), so no static import names it.';

await wrapCliTask(() =>
  validateDependencies({
    unimportedDependencies: {
      '@babel/core': OPTIONAL_PEER_LOADED_BY_NAME,
      '@parcel/config-default': 'Optional peer: the default .parcelrc the generated parcel config extends, which parcel resolves by name.',
      '@parcel/plugin': 'Optional peer: required by the transformer and namer source the parcel adapter generates into .parcel-cache.',
      '@tailwindcss/postcss': OPTIONAL_PEER_LOADED_BY_NAME,
      'babel-preset-solid': OPTIONAL_PEER_LOADED_BY_NAME,
      'css-loader': OPTIONAL_PEER_LOADED_BY_NAME,
      'jest-environment-jsdom': 'Optional peer: Jest loads it by name for the testEnvironment: \'jsdom\' that defineObsidianPluginJestConfig sets.',
      'mini-css-extract-plugin': OPTIONAL_PEER_LOADED_BY_NAME,
      'sass': 'esbuild-sass-plugin loads it at runtime to compile .scss, and declares it only as a peer.',
      'stylelint': 'Optional peer: obsidianTokenOnlyStylelintConfig is plain data a consumer runs with its own stylelint.',
      'svelte': OPTIONAL_PEER_LOADED_BY_NAME,
      'ts-jest': 'Optional peer: Jest loads it by name for the transform defineObsidianPluginJestConfig sets.',
      'typescript': 'The compiler typescript-eslint runs for the shared type-aware ESLint config, pinned to the version the toolkit is tested with.',
      'unplugin-vue': OPTIONAL_PEER_LOADED_BY_NAME
    }
  })
);
