---
title: Getting started
description: Set up an Obsidian plugin on `@mnaoumov/obsidian-lib` and `@mnaoumov/obsidian-dev-toolkit`, wire up the build tooling, and make your first call.
sidebar:
    order: 0
---

An Obsidian plugin built on these packages takes two of them: `@mnaoumov/obsidian-lib`, the runtime library the plugin calls while it runs in Obsidian, and `@mnaoumov/obsidian-dev-toolkit`, the tooling it builds, lints, tests and releases with. This guide gets you from an empty project to your first call and your first build.

## Installation

The runtime library is a dependency, because its code is bundled into the plugin's `main.js`. The toolkit is a devDependency, because nothing of it ships:

```bash
npm install @mnaoumov/obsidian-lib
npm install --save-dev @mnaoumov/obsidian-dev-toolkit
```

If you are starting a brand-new plugin, [`create-obsidian-plugin`](https://github.com/mnaoumov/create-obsidian-plugin) scaffolds a project that already wires up both packages and every script below.

## Your first helper call

Everything the runtime library exposes is a normal import from one of its subpaths. For example, show a prompt modal without writing any modal boilerplate:

```typescript
import { prompt } from '@mnaoumov/obsidian-lib/modals/prompt';

const name = await prompt({
  app,
  title: 'Enter your name'
});
```

The [Obsidian Lib](https://mnaoumov.dev/obsidian-lib/) site documents the runtime library: its [plugin helpers](https://mnaoumov.dev/obsidian-lib/guides/plugin-helpers/), [modals](https://mnaoumov.dev/obsidian-lib/guides/modals/), [setting components](https://mnaoumov.dev/obsidian-lib/guides/setting-components/), and the [import styles](https://mnaoumov.dev/obsidian-lib/guides/helper-functions/) it offers.

## Your first build script

The toolkit's commands are functions you wrap in your own `scripts/`, one entry point per npm script:

```typescript
// scripts/build.ts
import { build } from '@mnaoumov/obsidian-dev-toolkit/bundlers/esbuild';
import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';

await wrapCliTask(() => build());
```

Then wire it into `package.json`:

```json
{
  "scripts": {
    "build": "jiti scripts/build.ts"
  }
}
```

`npm run build` now bundles the plugin into `dist/build`. `wrapCliTask` comes from `@mnaoumov/typescript-dev-toolkit`, which the toolkit depends on and installs with it.

## Copying the bundled templates

You do not have to write the script and config files by hand. Ready-made templates ship inside the installed package, under `node_modules/@mnaoumov/obsidian-dev-toolkit/dist/templates`:

- `dist/templates/scripts/` holds the script entry points, grouped by the module they use (`build/`, `bundlers/`, `formatters/`, `gate/`, `linters/`, `test-runners/`, `version/`), and the shared config logic files at its top level (`commitlint-config.ts`, `eslint-config.ts`, `markdownlint-cli2-config.ts`, `nano-staged-config.ts`, `vitest-config.ts`). Copy the ones you need into your project's `scripts/` folder, naming each one after the `package.json` script that runs it.
- `dist/templates/` itself holds the thin root config files a project keeps at its root: `commitlint.config.ts`, `eslint.config.mts`, `vitest.config.ts`, `dprint.json`, `.markdownlint-cli2.mjs` and `.nano-staged.mjs`. Each one re-exports its matching `scripts/*-config.ts`, so copy both halves together.

The `commitlint-config`, `markdownlint-cli2-config`, `nano-staged-config` and `vitest-config` templates work as they are. `eslint-config` is a baseline you adapt to your plugin.

## Where to go next

- [Commands](/obsidian-dev-toolkit/guides/cli-commands/): the plugin builder, the development build with hot reload, and the plugin release.
- [Demo Vault](/obsidian-dev-toolkit/guides/demo-vault/): ship a curated vault with every release.
- [Testing](/obsidian-dev-toolkit/guides/testing/): the plugin's Vitest projects, its test setup, and the integration-test harness.
- [API reference](/obsidian-dev-toolkit/api/): the complete API, generated from the package's TSDoc.
- [TypeScript Dev Toolkit](https://mnaoumov.dev/typescript-dev-toolkit/): the generic commands the toolkit builds on (format, lint, spellcheck, the branch gate).
