---
title: CI and Release
description: Reusable GitHub workflows for a plugin's CI, its release from a tag and the attestation of its release assets, and a coverage badge with no external service.
---

The toolkit ships three reusable GitHub workflows, so a plugin repository carries a few lines that call them instead of the steps themselves. Each is an ordinary [reusable workflow](https://docs.github.com/en/actions/sharing-automations/reusing-workflows): the calling workflow owns the triggers and the permissions, and the toolkit owns the steps.

| Workflow | What it does | Trigger it from |
| --- | --- | --- |
| `obsidian-plugin-ci.yml` | Installs the dependencies and runs the gate; optionally publishes a coverage badge. | `push` and `pull_request` |
| `obsidian-plugin-release.yml` | Checks the tag, builds the plugin, archives the demo vault, publishes the GitHub release and attests its assets. | `push` of a tag |
| `obsidian-plugin-attest-release-assets.yml` | Attests the assets of a release made elsewhere, such as by `npm run version`. | `release: published` |

Each call pins the workflow to a release tag of the toolkit, which is the version number with no `v`. The workflows ship from 3.0.0 on. Pin the same version as the toolkit in your `package.json`, so the commands the workflows run (`generate-coverage-badge`, `archive-demo-vault`) are the ones installed. [Dependabot's `github-actions` ecosystem](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/keeping-your-actions-up-to-date-with-dependabot) updates the pin along with your other actions.

## Shared inputs

`obsidian-plugin-ci.yml` and `obsidian-plugin-release.yml` set up the job the same way, from the same four inputs:

| Input | Default | Meaning |
| --- | --- | --- |
| `package-manager` | `npm` | `npm`, `pnpm`, `yarn` or `bun`. pnpm is set up with `pnpm/action-setup`, which reads the version from the `packageManager` field of `package.json`; Yarn is set up through Corepack; Bun with `oven-sh/setup-bun`. |
| `node-version` | empty | The Node.js version. When it is empty, the version comes from `node-version-file`. |
| `node-version-file` | `.nvmrc` | The file naming the Node.js version. When it does not exist either, the latest LTS is used. |
| `install-command` | empty | The install command. When it is empty, the package manager's frozen install is used: `npm ci`, `pnpm install --frozen-lockfile`, `yarn install --immutable` (Yarn Berry, detected by `.yarnrc.yml`) or `yarn install --frozen-lockfile`, or `bun install --frozen-lockfile`. |

Both set `HUSKY=0`, so the install does not set up Git hooks on the runner.

## CI

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  ci:
    uses: mnaoumov/obsidian-dev-toolkit/.github/workflows/obsidian-plugin-ci.yml@3.0.0
```

The job checks out the repository, installs the dependencies and runs the gate.

| Input | Default | Meaning |
| --- | --- | --- |
| `gate-command` | empty | The command that checks the plugin. When it is empty, it is `<package manager> run gate`, the [branch gate](https://mnaoumov.dev/typescript-dev-toolkit/guides/cli-commands/) of a toolkit project. A plugin without one names its own checks, such as `npm run lint && npm test && npm run build`. |
| `coverage-badge` | `false` | Render the coverage badge after the gate and publish it. See [Coverage badge](#coverage-badge). |
| `coverage-badge-metric` | `lines` | The figure the badge shows: `lines`, `functions`, `branches`, or `lowest` for the lowest of the three. |
| `coverage-badge-branch` | `badges` | The branch the badge is published to. |

## Release

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags: ['*']

permissions:
  contents: write
  id-token: write
  attestations: write

jobs:
  release:
    uses: mnaoumov/obsidian-dev-toolkit/.github/workflows/obsidian-plugin-release.yml@3.0.0
```

To release, bump the version in `manifest.json`, `package.json` and `versions.json`, commit, then push a tag that is that version:

```sh
git tag 1.2.3
git push origin 1.2.3
```

The job then does the following, in order:

1. **Checks the tag.** Obsidian finds a release by the version in the plugin's manifest, so a tag that is not that version is a release that never reaches anyone. The job fails unless the tag is the `version` of `manifest.json`. For a tag with a `-` in it, it compares against `manifest-beta.json` when the plugin has one.
2. **Builds the plugin** with `build-command`, into `dist/build`.
3. **Archives the demo vault** when the plugin has a `demo-vault/` folder, with the toolkit's `archive-demo-vault` command, so the release carries the same archive `npm run version` attaches. See [Demo Vault](/obsidian-dev-toolkit/guides/demo-vault/).
4. **Publishes the release.** Every file in `dist/build` is attached: `main.js`, `manifest.json`, `styles.css` and the demo vault archive. An empty file is left out with a warning, because GitHub refuses a 0-byte asset and rolls the whole release back. A tag with a `-` in it makes a pre-release. When the release exists already, its assets are replaced.
5. **Attests the assets' build provenance** with `actions/attest`, so anyone can check them with `gh attestation verify <file> --repo <owner>/<repo>`.

| Input | Default | Meaning |
| --- | --- | --- |
| `build-command` | empty | The command that builds the plugin into `dist/build`. When it is empty, it is `<package manager> run build`. |
| `tag` | empty | The tag to release. When it is empty, it is the pushed tag. |
| `demo-vault` | `true` | Archive `demo-vault/` into the release. It needs the toolkit installed; set it to `false` to skip the archive. |
| `attest` | `true` | Attest the assets. Without it, the caller needs only `contents: write`. |
| `draft` | `false` | Create the release as a draft. |

The toolkit's own `npm run version` (see [Commands](/obsidian-dev-toolkit/guides/cli-commands/#version-management)) bumps the version, tags and creates the release from your machine. A plugin that releases that way does not need this workflow, only the attestation one below.

## Attest release assets

```yaml
# .github/workflows/attest-release-assets.yml
name: Attest Release Assets

on:
  release:
    types: [published]

permissions:
  contents: read
  id-token: write
  attestations: write

jobs:
  attest:
    uses: mnaoumov/obsidian-dev-toolkit/.github/workflows/obsidian-plugin-attest-release-assets.yml@3.0.0
```

It downloads the assets of the published release and attests their build provenance. Its one input, `tag`, names another release to attest; by default it is the release that triggered the run.

## Coverage badge

The badge shows the coverage your tests measure, rendered by the toolkit as an SVG in the shields.io style, with no external service. It reads `coverage/lcov.info`, the report the toolkit's `testCoverage` writes.

Turn it on in the CI call, and let that job push:

```yaml
permissions:
  contents: write

jobs:
  ci:
    uses: mnaoumov/obsidian-dev-toolkit/.github/workflows/obsidian-plugin-ci.yml@3.0.0
    with:
      coverage-badge: true
```

Every run renders the badge after the gate, so a pull request whose coverage report is missing fails there. On a push to the default branch, the badge is committed as `coverage.svg` to the `badges` branch, which holds nothing else. Its commits carry `[skip ci]`, and no commit is made when the badge has not changed. Show it in the README:

```markdown
[![Coverage](https://raw.githubusercontent.com/<owner>/<repo>/badges/coverage.svg)](https://github.com/<owner>/<repo>/actions/workflows/ci.yml)
```

To render it locally, run the `generate-coverage-badge` command after a coverage run. It writes `coverage/coverage-badge.svg`, inside the folder a project already ignores, so a local run leaves no changed file behind:

```sh
npm run test:coverage
npx generate-coverage-badge
```

| Flag | Default | Meaning |
| --- | --- | --- |
| `--lcov=<path>` | `coverage/lcov.info` | The lcov report to read. |
| `--output=<path>` | `coverage/coverage-badge.svg` | Where to write the SVG. |
| `--metric=<metric>` | `lines` | `lines`, `functions`, `branches` or `lowest`. |
| `--label=<text>` | `coverage` | The text on the left half of the badge. |

The figure is rounded down to one decimal, so a project at 99.96% shows 99.9% rather than 100%. A kind of coverage with nothing to measure counts as fully covered. The color follows the shields.io scale: bright green at 100%, then green from 90%, yellow-green from 80%, yellow from 70%, orange from 60% and red below.

The same badge is available from a script, through `generateCoverageBadge`:

```typescript
import { generateCoverageBadge } from '@mnaoumov/obsidian-dev-toolkit/test-runners/coverage-badge';
import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';

await wrapCliTask(async () => {
  await generateCoverageBadge({ metric: 'lowest', outputPath: 'docs/coverage.svg' });
});
```
