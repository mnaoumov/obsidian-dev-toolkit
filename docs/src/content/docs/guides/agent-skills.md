---
title: AI agent skills
description: One skill per area of a plugin built with the toolkit (build, test, release, demo vault), in the open Agent Skills format, installable in Claude Code, Codex and any agent that reads that format, and the evals that check the right skill fires.
---

The toolkit's repository ships four agent skills, one per area of a plugin built with the toolkit. They give an AI coding agent working on your plugin the commands, the traps and the recovery steps of these guides in a form it loads only when the task needs it. The guides stay the reference; each skill links back to them.

Each skill is one `SKILL.md` in the open [Agent Skills](https://agentskills.io/) format, a `name` and a `description` in the frontmatter and plain Markdown below, under `plugins/obsidian-dev-toolkit/skills/<name>/`. That folder is the only copy. The repository is also a plugin marketplace with one plugin, `obsidian-dev-toolkit`, which packages those skills for the agents that install plugins.

## Install in `Claude Code`

On `Claude Code` 2.1.275 or later:

```text
/plugin install obsidian-dev-toolkit --marketplace mnaoumov/obsidian-dev-toolkit
```

On an older version, add the marketplace first, then install the plugin from it:

```text
/plugin marketplace add mnaoumov/obsidian-dev-toolkit
/plugin install obsidian-dev-toolkit@obsidian-dev-toolkit
```

The plugin's version is the toolkit's, and `Claude Code` updates an installed plugin when that version changes.

## Install in `Codex`

`Codex` reads the same marketplace and plugin manifest. Add the marketplace, then install the plugin from it:

```shell
codex plugin marketplace add mnaoumov/obsidian-dev-toolkit
codex plugin add obsidian-dev-toolkit@obsidian-dev-toolkit
```

`codex plugin marketplace upgrade obsidian-dev-toolkit` fetches a newer marketplace.

## Install in another agent

An agent that reads the Agent Skills format but installs no plugins takes the skill folders as they are: copy each folder under `plugins/obsidian-dev-toolkit/skills/` into the folder where that agent reads skills, as its own documentation names it. Copy the whole folder, not only `SKILL.md`, so the skill keeps its name.

Whichever agent you use, the skills describe the newest toolkit release, so keep the toolkit in your `package.json` current too.

## The skills

| Skill | Fires for | Guides it is written from |
| --- | --- | --- |
| `build` | `npm run build` and `npm run dev`, the bundler adapters, the mobile load check, deploying and reloading a development build, moving a plugin's own `esbuild` script to the toolkit | [Commands](/obsidian-dev-toolkit/guides/cli-commands/), [Bundlers](/obsidian-dev-toolkit/guides/bundlers/) |
| `test` | The `unit-tests` and `integration-tests:*` projects, the `vmThreads` pool, a stale build refused by an integration project, the 30 s cap of an `evalInObsidian` closure | [Testing](/obsidian-dev-toolkit/guides/testing/), [End-to-end testing](/obsidian-dev-toolkit/guides/e2e-testing/) |
| `release` | `npm run version`, `check-plugin` and each of its findings, `minAppVersion`, the reusable workflows and their pins, a release that stopped halfway | [Commands](/obsidian-dev-toolkit/guides/cli-commands/#version-management), [CI and Release](/obsidian-dev-toolkit/guides/ci-and-release/) |
| `demo-vault` | What a demo vault commits, the authoring rules, the coverage and button suites, the release archive | [Demo Vault](/obsidian-dev-toolkit/guides/demo-vault/) |

An agent that installs the plugin shows them under the plugin's name, for example `obsidian-dev-toolkit:build`. Each description also names the neighboring skills it is not for, so a request about a failing release check does not load the build skill.

The skill text names no agent and no agent's own tools, so it reads the same in every agent. The repository's gate keeps it so (see below).

## The selection evals

`plugins/obsidian-dev-toolkit/evals/` holds one case per skill: a plain request that names no skill, and three graders. One checks that the expected skill fired, one that no other skill did, and one that the answer names the command or option that solves the request. Run them with `claude plugin eval plugins/obsidian-dev-toolkit --no-publish` from the repository root. They make real model calls, so they are not part of CI. `Codex` has no eval runner, so the cases run in `Claude Code` only.

The repository's own gate keeps the skills honest without a model: a unit test fails when a skill links a guide or heading that no longer exists, names an `npx` command or an import subpath the package does not have, lacks its eval case, carries a frontmatter field other than `name` and `description`, or names an agent or an agent-only feature outside a section marked as agent-specific, and when `plugin.json`'s version differs from `package.json`'s. The release writes the new version into `plugin.json` itself.

The skill set and the eval format are re-implemented after the `opdk` plugin of [`obsidian-plugin-dev-kit`](https://github.com/Dimagious/obsidian-plugin-dev-kit) (MIT).
