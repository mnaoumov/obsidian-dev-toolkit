/**
 * @file
 *
 * Type-checks the consumer-facing templates under `templates/`.
 *
 * The templates import this package by its published specifier (`@mnaoumov/obsidian-dev-toolkit/...`), the way
 * a consumer does, so they sit outside `tsconfig.json`'s `include` and outside every ESLint `files` pattern.
 * That is how the 96.0.1 `parseVersionArgs` breakage shipped: a rename landed in the library source but not in
 * the template beside it, and nothing type-checked the template to notice.
 *
 * `tsconfig.templates.json` closes that gap. The published specifier resolves through the package's own
 * `exports` onto the emitted `dist/lib` declarations — the exact surface a consumer resolves — and with no
 * `customConditions` nothing reaches back into the sources. Those declarations are self-contained (proven by
 * `build:validate-declarations`), so the templates program carries nothing else and the check stays fast and
 * leak-free.
 */

import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';
import { execFromRoot } from '@mnaoumov/typescript-dev-toolkit/root';

await wrapCliTask(async () => {
  await execFromRoot('tsc --project ./tsconfig.templates.json');
});
