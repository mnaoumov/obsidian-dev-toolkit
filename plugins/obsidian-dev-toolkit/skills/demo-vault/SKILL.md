---
name: demo-vault
description: Create, author, check and ship the demo vault of an Obsidian plugin that uses @mnaoumov/obsidian-dev-toolkit (`demo-vault/`, `00 Start.md`, `code-button`s run by `CodeScript Toolkit`, `startup.ts` and `demoSetup.ts`, `registerDemoVaultCoverageSuite`, `registerDemoVaultButtonSuite`, the `<plugin-id>-demo-vault.zip` release asset, the `Open demo vault` command). Use it to add a demo vault, write or fix its notes, fix a failing coverage or button suite ("no-wikilinks", "Try it" without a button, unreachable note, `fix-require-modules` not installed, `notRendered`), or check what the release archives. Not for the plugin's own build (build), its other tests (test) or the version bump and tag (release).
---

# The demo vault of an Obsidian plugin built with `@mnaoumov/obsidian-dev-toolkit`

A demo vault is a curated vault at `demo-vault/` in the plugin repository. It is the plugin's documentation, read in Obsidian and on `GitHub` by someone who has not installed the plugin, and a playground whose `code-button`s set up each demo. Full guide: [Demo Vault](https://mnaoumov.dev/obsidian-dev-toolkit/guides/demo-vault/).

## What the vault commits

1. Notes, opening with `00 Start.md`, plus `README.md` for the `GitHub` reader.
2. `demo-vault/.obsidian/community-plugins.json` with BOTH ids: `["demo-vault-helper", "<plugin-id>"]`. With only the helper, the vault boots and the plugin it demonstrates stays off.
3. `demo-vault/_assets/CodeScriptToolkit/startup.ts`, which must `export` an `invoke(app)` function (it opens the start note). A top-level script throws `this.startupScript.invoke is not a function`.
4. `demo-vault/_assets/CodeScriptToolkit/demoSetup.ts` for shared button code, so each button is a one-liner: `require('/demoSetup.ts').installAndEnable(app, '<id>')`.
5. A `tsconfig.json` covering `startup.ts` and `demoSetup.ts`: the shared `ESLint` config lints both as source, and the typed rules refuse a file no project covers.

It commits NO plugin `data.json`, no `Invocables/` placeholder, no `demo-vault-helper` and none of the four `app.json` settings the toolkit injects into the archive (`defaultViewMode`, `livePreview`, `useMarkdownLinks`, `newLinkFormat`). Gitignore `demo-vault/.obsidian/plugins/*`, `demo-vault/.obsidian/workspace*.json` and `demo-vault/.obsidian/hotkeys.json`.

## Authoring rules (machine-checked)

1. Every note opens with an `# H1`, then 1-3 sentences of what the feature does, in behavior terms.
2. Links between notes are `[Text](<./NN Name.md>)`, never `[[wikilinks]]`. A note whose subject IS a wikilink says so: `<!-- obsidian-dev-toolkit-disable-next-line demo-vault-validation/no-wikilinks -- <reason> -->`, or the `obsidian-dev-toolkit:` frontmatter key `demo-vault-validation: { allow-wikilinks: <reason> }`.
3. No `[Docs](...)` line: the note is the documentation.
4. `00 Start.md` is a getting-started narrative with an index; every other note is reachable from it.
5. Every `Try it` section has a `code-button` that performs its setup. One that cannot be scripted carries `<!-- obsidian-dev-toolkit-disable-next-line demo-vault-validation/try-it-code-button -- <reason> -->` on its heading.

The first example also says, in prose, that the rectangle is a button, that clicking runs the code, and that `</>` shows the source. No check can see that.

## Commands and suites

- `src/demo-vault.no-app.integration.test.ts` calls `registerDemoVaultCoverageSuite({ rootFolder })` from `@mnaoumov/obsidian-dev-toolkit/demo-vault-coverage`: the authoring rules plus, with `configInterfaces` / `interfaces`, that every setting and API member is demonstrated. It runs in `npm run test:integration:no-app`, with no Obsidian.
- `src/demo-vault-buttons.demo-vault.integration.test.ts` calls `registerDemoVaultButtonSuite()` from `@mnaoumov/obsidian-dev-toolkit/demo-vault-buttons`: it clicks every button in a real Obsidian. It needs a global setup built on `buildDemoVaultPopulate` and an `integration-tests:demo-vault` project, listed in `scripts/test-integration.ts`. Run it alone with `npx vitest run --project integration-tests:demo-vault`.
- `npm run version` archives the vault into `dist/build/<plugin-id>-demo-vault.zip`, with the built plugin and `demo-vault-helper` injected, and attaches it to the release. `--no-demo-vault` skips it.
- `npx archive-demo-vault` builds the same archive without a release, after `npm run build`.

## Traps

| Symptom | Cause and fix |
| --- | --- |
| `Community plugin "fix-require-modules" is not installed in the demo vault` | The button suite copies `CodeScript Toolkit` out of your own `demo-vault/`. Open `demo-vault/` in Obsidian once, so `demo-vault-helper` installs it, then re-run. |
| `No projects matched the filter "integration-tests:demo-vault"` | Declare the project in `scripts/vitest-config.ts` AND list it in `scripts/test-integration.ts`. |
| The button suite throws at registration about the timeouts | `settleTimeoutInMilliseconds + buttonResultTimeoutInMilliseconds` must stay under the 30 s cap of one closure. |
| `status: 'notRendered'` | Reading view unmounts far sections; read the failure line's mounted captions before assuming the button broke. |
| A link created while authoring is a wikilink | The `useMarkdownLinks` setting reaches only the archive. Rewrite it; the coverage suite catches it. |
| A note a button creates fails reachability locally | Gitignore it in the vault: the suite skips notes `git` ignores. |
| A legacy `obsidian-dev-utils-disable...` directive is reported | Rename it to the `obsidian-dev-toolkit-` spelling the message names. |

## Stop and recover

1. Run the coverage suite first: it is fast and needs no Obsidian.
2. Fix notes, not checks: an exemption needs a written reason, and one covering nothing fails the suite.
3. Then run the button suite, and read the note, caption and captured error it reports.
