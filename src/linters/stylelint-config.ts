/**
 * @file
 *
 * An opt-in `stylelint` configuration for an Obsidian plugin's CSS that allows only theme tokens: colors, fonts and
 * spacing come from `var(--...)` custom properties, never from hex, named or `rgb()` / `hsl()` colors, raw pixel
 * sizes or `!important`. A plugin styled that way follows whatever theme the user runs.
 *
 * It is plain data and imports nothing from `stylelint`, so loading it needs no optional peer.
 *
 * Adapted from `stylelint.config.mjs` of `@insurgently/obsidian-ui` 0.4.0
 * (https://github.com/insurgently/insurgently-obsidian-ui), MIT License, Copyright (c) 2026 Insurgently.
 */

/**
 * The shape of {@link obsidianTokenOnlyStylelintConfig}, a `stylelint` `Config` with only `rules` set.
 */
export interface ObsidianTokenOnlyStylelintConfig {
  /**
   * The rules.
   */
  readonly rules: ObsidianTokenOnlyStylelintRules;
}

/**
 * The `stylelint` rules of {@link obsidianTokenOnlyStylelintConfig}.
 */
export interface ObsidianTokenOnlyStylelintRules {
  /**
   * Bans named colors (`red`, `black`).
   */
  readonly 'color-named': 'never';

  /**
   * Bans hex colors.
   */
  readonly 'color-no-hex': true;

  /**
   * Bans `!important`.
   */
  readonly 'declaration-no-important': true;

  /**
   * Bans raw pixel sizes on the size properties.
   */
  readonly 'declaration-property-unit-disallowed-list': Readonly<Record<string, readonly string[]>>;

  /**
   * Allows only token values on the color, font, spacing, border, shadow and stacking properties.
   */
  readonly 'declaration-property-value-allowed-list': Readonly<Record<string, readonly RegExp[]>>;

  /**
   * Bans color functions with literal channels.
   */
  readonly 'function-disallowed-list': readonly string[];
}

/**
 * The keywords allowed wherever a token is: none of them is a literal color or size.
 */
const KEYWORD = '0|auto|inherit|transparent|currentColor|none';

/**
 * A custom property name.
 */
const NAME = '--[\\w-]+';

/**
 * A `var()` without a fallback.
 */
const VAR_WITHOUT_FALLBACK = `var\\(${NAME}\\)`;

/**
 * A `var()` whose fallback is a `var()` without a fallback, or a keyword.
 */
const VAR_NESTED_ONCE = `var\\(${NAME}(?:,\\s*(?:${VAR_WITHOUT_FALLBACK}|${KEYWORD}))?\\)`;

/**
 * A `var()` whose fallback is another `var()` (two levels deep) or a keyword, never a raw length or color, so
 * `var(--x, 12px)` fails.
 */
const VAR = `var\\(${NAME}(?:,\\s*(?:${VAR_NESTED_ONCE}|${KEYWORD}))?\\)`;

/**
 * A `calc()` over `var()`s and plain numbers.
 */
const CALC = `calc\\(\\s*${VAR}(?:\\s*[-+*/]\\s*(?:${VAR}|-?\\d+(?:\\.\\d+)?))*\\s*\\)`;

/**
 * A `color-mix()` over `var()`s, with no hex color inside.
 */
const COLOR_MIX = `color-mix\\((?=[^#]*var\\()(?:[^()#]|${VAR})*\\)`;

/**
 * One token value.
 */
const ATOM = `(?:${VAR}|${CALC}|${COLOR_MIX}|${KEYWORD})`;

/**
 * A border or outline shorthand atom: a token, or a line style.
 */
const LINE_ATOM = `(?:${ATOM}|solid|dashed|dotted|double)`;

/**
 * One shadow: tokens, optionally `inset`.
 */
const SHADOW = `(?:${ATOM}|inset)(?:\\s+(?:${ATOM}|inset))*`;

/**
 * Builds the pattern of a space-separated list of atoms, so `padding: 0 var(--x)` passes.
 *
 * @param atom - The pattern of one atom.
 * @returns The pattern of the whole value.
 */
function spaceSeparated(atom: string): RegExp {
  return new RegExp(String.raw`^${atom}(?:\s+${atom})*$`, 'iu');
}

/**
 * Token values only.
 */
const TOKEN_ONLY = [spaceSeparated(ATOM)] as const;

/**
 * Border and outline shorthands: token values and line styles.
 */
const LINE = [spaceSeparated(LINE_ATOM)] as const;

/**
 * Box shadows: one or more comma-separated shadows of token values.
 */
const SHADOWS = [new RegExp(`^${SHADOW}(?:\\s*,\\s*${SHADOW})*$`, 'iu')] as const;

/**
 * `z-index`: a token, or a plain integer from 0 to 9 for stacking inside one component. Layers above other UI use
 * Obsidian's `--layer-*` variables.
 */
const Z_INDEX = [...TOKEN_ONLY, /^\d$/u] as const;

/**
 * An opt-in `stylelint` configuration that allows only theme tokens in an Obsidian plugin's CSS.
 *
 * - No hex colors, no named colors, no `rgb()`, `rgba()`, `hsl()`, `hsla()` or `hwb()`: colors come from tokens.
 * - No `!important`.
 * - No `px` on the width, height, inline-size and block-size properties.
 * - Color, background, border, outline, shadow, font, line-height, `fill`, `stroke`, `gap`, padding, margin,
 *   border-radius and `z-index` values are a space-separated list of atoms. An atom is a `var()`, a `calc()` over
 *   `var()`s and plain numbers, a `color-mix()` over `var()`s, or one of `0`, `auto`, `inherit`, `transparent`,
 *   `currentColor` and `none`. A `var()` fallback is another `var()` or one of those keywords, never a raw length or
 *   color.
 *
 * A fixed size a plugin really needs is named: declare it once as a custom property on the component
 * (`--my-cover-width: 64px`) and use `width: var(--my-cover-width)`. The value allow-list does not check custom property
 * declarations, so the name is the allow-list entry and the raw number lives in one place. The color bans still
 * apply there: a color is derived from a theme variable (with `color-mix()`), never defined as a literal.
 *
 * Use it as the whole configuration (`export default obsidianTokenOnlyStylelintConfig;` in `stylelint.config.mjs`),
 * or spread it into one that extends a standard configuration.
 */
export const obsidianTokenOnlyStylelintConfig: ObsidianTokenOnlyStylelintConfig = {
  rules: {
    'color-named': 'never',
    'color-no-hex': true,
    'declaration-no-important': true,
    'declaration-property-unit-disallowed-list': {
      '/^(min-|max-)?(width|height|inline-size|block-size)$/': ['px']
    },
    'declaration-property-value-allowed-list': {
      '/^border(-(top|right|bottom|left|block|inline)(-(start|end))?)?-(color|width)$/': TOKEN_ONLY,
      '/^border(-(top|right|bottom|left|block|inline)(-(start|end))?)?$/': LINE,
      '/^margin/': TOKEN_ONLY,
      '/^outline(-(color|width))?$/': LINE,
      '/^padding/': TOKEN_ONLY,
      'background': TOKEN_ONLY,
      'background-color': TOKEN_ONLY,
      'border-radius': TOKEN_ONLY,
      'box-shadow': SHADOWS,
      'color': TOKEN_ONLY,
      'fill': TOKEN_ONLY,
      'font': TOKEN_ONLY,
      'font-family': TOKEN_ONLY,
      'font-size': TOKEN_ONLY,
      'font-weight': TOKEN_ONLY,
      'gap': TOKEN_ONLY,
      'line-height': TOKEN_ONLY,
      'outline-offset': TOKEN_ONLY,
      'stroke': TOKEN_ONLY,
      'z-index': Z_INDEX
    },
    'function-disallowed-list': ['rgb', 'rgba', 'hsl', 'hsla', 'hwb']
  }
};
