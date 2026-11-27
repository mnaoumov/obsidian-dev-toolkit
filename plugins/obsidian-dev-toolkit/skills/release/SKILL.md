---
name: release
description: Check, cut and publish a release of an Obsidian plugin that uses @mnaoumov/obsidian-dev-toolkit (`npm run version`, `npx check-plugin`, `npx update-workflow-pins`, the reusable `obsidian-plugin-ci.yml`, `obsidian-plugin-release.yml` and `obsidian-plugin-attest-release-assets.yml` workflows). Use it to bump the version, tag and publish, release a beta for BRAT, read a failing community directory check (manifest, `versions.json`, tag, assets, scanner, API version floor), fix `workflow-pin-version-mismatch`, set `minAppVersion`, or recover a release that stopped halfway. Not for build or mobile-load failures (build), failing tests (test) or the demo vault's content and suites (demo-vault).
---

# Release an Obsidian plugin with `@mnaoumov/obsidian-dev-toolkit`

Run every command from the plugin root. The id and version come from `manifest.json`. Full guides: [Commands, Version Management](https://mnaoumov.dev/obsidian-dev-toolkit/guides/cli-commands/#version-management), [Check Against the Community Directory](https://mnaoumov.dev/obsidian-dev-toolkit/guides/cli-commands/#check-against-the-community-directory) and [CI and Release](https://mnaoumov.dev/obsidian-dev-toolkit/guides/ci-and-release/).

## Safety

- A release pushes a tag and a commit and publishes a `GitHub` release. Do not run `npm run version` unless the user asked for that release.
- Never force-push, and never move or delete a published tag or release. A bad release is fixed by the next version.
- `npx check-plugin` and `npx update-workflow-pins --dry-run` change nothing, so they are always safe.

## Which command

| Question | Command |
| --- | --- |
| Can this be released? | `npx check-plugin` (add `--require-assets` after a build, `--tag=<x.y.z>` to check a tag) |
| Would the community directory's scanner pass it? | `npx check-plugin --scanner` (downloads and runs the scanner's own action: minutes, needs network) |
| Is `minAppVersion` high enough for the API the code calls? | `npx check-plugin --api-version` |
| Cut the release | `npm run version '--' patch` (or `minor`, `major`, `x.y.z`; quote the `--` in `PowerShell`) |
| Release with no terminal (an agent, CI) | add `--no-changelog-editing`, or `--changelog-file <path>` with prepared notes |
| A beta for BRAT | `npm run version '--' prepatch` (or `preminor`, `premajor`, `prerelease`) |
| Move the workflow pins after a toolkit upgrade | `npx update-workflow-pins` |

`npm run version` runs the branch gate, settles the changelog, writes `manifest.json`, `versions.json`, `package.json` and the lockfile, runs the community directory checks, commits and tags. It then pushes the tag only, creates the `GitHub` release with every file in `dist/build` (the demo vault archive among them), verifies it, and pushes the branch last. Plugin flags: `--min-app-version=<x.y.z>`, `--api-version`, `--no-demo-vault`, `--no-release-checks`.

## `minAppVersion`

Every stable release sets `minAppVersion` to the latest public desktop Obsidian, read from the desktop app's own update feed, and adds a `versions.json` entry for it. That is deliberate policy: a plugin never carries older Obsidian versions. `--min-app-version=<x.y.z>` is the explicit opt-out. A pre-release goes to `manifest-beta.json` and leaves `manifest.json` and `versions.json` alone.

## Reading a failing check

| Finding | Fix |
| --- | --- |
| An id or name holding `obsidian` or `plugin`, a description over 250 characters or naming Obsidian | Edit `manifest.json`. A listed id is exempt and can never change. |
| `versions-missing-manifest-version` | A hand bump skipped `versions.json`. Release through `npm run version` instead of editing versions by hand. |
| `versions-min-app-version-mismatch` / `-decreasing` | The entry for the current version must equal `minAppVersion`, and no newer version may map a lower minimum. |
| `package-version-mismatch` / `package-lock-version-mismatch` | `package.json` or the lockfile differs from the manifest. Restore the files and release through `npm run version`. |
| `repository-license-missing` / `repository-readme-missing` | Add `LICENSE` and `README.md` at the root. |
| `workflow-pin-version-mismatch`, `workflow-pin-not-release` | A `uses: mnaoumov/obsidian-dev-toolkit/...@<pin>` line names another release than the installed toolkit. Run `npx update-workflow-pins` and commit it with the lockfile. |
| `build-script-missing`, `build-script-not-toolkit` (warnings) | The directory rebuilds `main.js` with the `build` script. Make it run the toolkit's production build. |
| `--api-version` reports a floor above `minAppVersion` | Guard the newer API with `requireApiVersion()`, or raise the minimum. |
| A scanner finding your `npm run lint` does not report | The directory reports it too, for example an `eslint-disable` naming a rule the scanner does not load. Fix it in the source. |

## Stop and recover

| Stopped at | State and next step |
| --- | --- |
| The gate (format, lint, tests, build) | Nothing was written. Fix it, commit, run the release again. |
| `The interactive changelog review needs a terminal` | Nothing was written. Pass `--no-changelog-editing` or `--changelog-file`. |
| `desktop-releases.json has no valid public latestVersion`, or its fetch failed | Nothing was edited. Retry later, or pass `--min-app-version`. |
| An existing `versions.json` entry for the new version | Nothing was edited. A released entry is never overwritten: release the next version. |
| A community directory check after the bump | Not tagged yet. Restore the version files (`git checkout -- .`), fix the finding, run again. |
| The `GitHub` release step | The tag is pushed, the branch is not. Read the error, fix the release on `GitHub` by hand, then `git push` the branch. Never delete the tag. |
| A 0-byte asset (`Bad Content-Length`) | `GitHub` refuses empty files. Make `styles.css` non-empty, or create the release by hand without it. |

## Releasing from a tag in CI instead

Call the reusable workflow from `.github/workflows/release.yml` and pin it to the toolkit version in `package.json` (`uses: mnaoumov/obsidian-dev-toolkit/.github/workflows/obsidian-plugin-release.yml@<version>`, permissions `contents: write`, `id-token: write`, `attestations: write`). Bump `manifest.json`, `package.json` and `versions.json`, commit, push only the tag (`git push origin 1.2.3`), and push the branch once the workflow is green. The release notes are the tag's `CHANGELOG.md` section. A plugin that releases with `npm run version` needs only `obsidian-plugin-attest-release-assets.yml`.
