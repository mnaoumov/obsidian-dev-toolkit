---
title: Claude Code skills
description: A Claude Code plugin with one skill per area of a plugin built with the toolkit (build, test, release, demo vault), and the evals that check the right skill fires.
---

The toolkit's repository is a `Claude Code` plugin marketplace. Its one plugin, `obsidian-dev-toolkit`, gives an agent working on your plugin the commands, the traps and the recovery steps of these guides in a form it loads only when the task needs it. The guides stay the reference; each skill links back to them.

## Install

On `Claude Code` 2.1.275 or later:

```text
/plugin install obsidian-dev-toolkit --marketplace mnaoumov/obsidian-dev-toolkit
```

On an older version, add the marketplace first, then install the plugin from it:

```text
/plugin marketplace add mnaoumov/obsidian-dev-toolkit
/plugin install obsidian-dev-toolkit@obsidian-dev-toolkit
```

The plugin's version is the toolkit's, and `Claude Code` updates an installed plugin when that version changes. The skills describe the newest toolkit release, so keep the toolkit in your `package.json` current too.

## The skills

| Skill | Fires for | Guides it is written from |
| --- | --- | --- |
| `/obsidian-dev-toolkit:build` | `npm run build` and `npm run dev`, the bundler adapters, the mobile load check, deploying and reloading a development build, moving a plugin's own `esbuild` script to the toolkit | [Commands](/obsidian-dev-toolkit/guides/cli-commands/), [Bundlers](/obsidian-dev-toolkit/guides/bundlers/) |
| `/obsidian-dev-toolkit:test` | The `unit-tests` and `integration-tests:*` projects, the `vmThreads` pool, a stale build refused by an integration project, the 30 s cap of an `evalInObsidian` closure | [Testing](/obsidian-dev-toolkit/guides/testing/), [End-to-end testing](/obsidian-dev-toolkit/guides/e2e-testing/) |
| `/obsidian-dev-toolkit:release` | `npm run version`, `check-plugin` and each of its findings, `minAppVersion`, the reusable workflows and their pins, a release that stopped halfway | [Commands](/obsidian-dev-toolkit/guides/cli-commands/#version-management), [CI and Release](/obsidian-dev-toolkit/guides/ci-and-release/) |
| `/obsidian-dev-toolkit:demo-vault` | What a demo vault commits, the authoring rules, the coverage and button suites, the release archive | [Demo Vault](/obsidian-dev-toolkit/guides/demo-vault/) |

Each description also names the neighboring skills it is not for, so a request about a failing release check does not load the build skill.

## The selection evals

`plugins/obsidian-dev-toolkit/evals/` holds one case per skill: a plain request that names no skill, and three graders. One checks that the expected skill fired, one that no other skill did, and one that the answer names the command or option that solves the request. Run them with `claude plugin eval plugins/obsidian-dev-toolkit --no-publish` from the repository root. They make real model calls, so they are not part of CI.

The repository's own gate keeps the skills honest without a model: a unit test fails when a skill links a guide or heading that no longer exists, names an `npx` command or an import subpath the package does not have, or lacks its eval case, and when `plugin.json`'s version differs from `package.json`'s. The release writes the new version into `plugin.json` itself.

The skill set and the eval format are re-implemented after the `opdk` plugin of [`obsidian-plugin-dev-kit`](https://github.com/Dimagious/obsidian-plugin-dev-kit) (MIT).
