/**
 * @file
 *
 * Renders a coverage badge from the `coverage/lcov.info` report `testCoverage` writes, as a self-contained SVG in
 * the shields.io flat style, so a README can show the measured coverage with no external service. The
 * `obsidian-plugin-ci.yml` reusable workflow publishes it to a `badges` branch; see the CI and release guide.
 */

import { resolvePathFromRootSafe } from '@mnaoumov/typescript-dev-toolkit/root';
import {
  mkdir,
  readFile,
  writeFile
} from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Which coverage figure the badge shows.
 *
 * - `lines`: the share of lines covered, the figure most coverage services show.
 * - `functions`: the share of functions covered.
 * - `branches`: the share of branches covered.
 * - `lowest`: the lowest of the three, so the badge never shows a figure one of the others falls below.
 */
export type CoverageBadgeMetric = 'branches' | 'functions' | 'lines' | 'lowest';

/**
 * A covered and a total count of one kind of coverage item.
 */
export interface CoverageCount {
  /**
   * How many items are covered.
   */
  readonly covered: number;

  /**
   * How many items there are.
   */
  readonly total: number;
}

/**
 * The coverage totals of a whole lcov report.
 */
export interface CoverageTotals {
  /**
   * The branches (`BRF` / `BRH`).
   */
  readonly branches: CoverageCount;

  /**
   * The functions (`FNF` / `FNH`).
   */
  readonly functions: CoverageCount;

  /**
   * The lines (`LF` / `LH`).
   */
  readonly lines: CoverageCount;
}

/**
 * Options for {@link generateCoverageBadge}.
 */
export interface GenerateCoverageBadgeOptions {
  /**
   * The text on the left half of the badge.
   *
   * @default `'coverage'`
   */
  readonly label?: string;

  /**
   * The lcov report to read, relative to the project root.
   *
   * @default `'coverage/lcov.info'`
   */
  readonly lcovPath?: string;

  /**
   * Which coverage figure the badge shows.
   *
   * @default `'lines'`
   */
  readonly metric?: CoverageBadgeMetric;

  /**
   * Where to write the SVG, relative to the project root. The default sits beside the report, in a folder a
   * project ignores, so a local coverage run never leaves a changed file behind.
   *
   * @default `'coverage/coverage-badge.svg'`
   */
  readonly outputPath?: string;
}

/**
 * The result of {@link generateCoverageBadge}.
 */
export interface GenerateCoverageBadgeResult {
  /**
   * The absolute path of the SVG written.
   */
  readonly outputPath: string;

  /**
   * The coverage figure the badge shows, in percents, rounded down to one decimal.
   */
  readonly percent: number;
}

/**
 * Parameters for {@link renderCoverageBadgeSvg}.
 */
export interface RenderCoverageBadgeSvgParams {
  /**
   * The text on the left half of the badge.
   */
  readonly label: string;

  /**
   * The coverage figure, in percents.
   */
  readonly percent: number;
}

interface BadgeColorThreshold {
  readonly color: string;
  readonly minPercent: number;
}

const DEFAULT_LABEL = 'coverage';
const DEFAULT_LCOV_PATH = 'coverage/lcov.info';
const DEFAULT_OUTPUT_PATH = 'coverage/coverage-badge.svg';
const FULL_PERCENT = 100;
const PERCENT_PRECISION = 10;

const GREEN_MIN_PERCENT = 90;
const YELLOW_GREEN_MIN_PERCENT = 80;
const YELLOW_MIN_PERCENT = 70;
const ORANGE_MIN_PERCENT = 60;
const RED = '#e05d44';

// The shields.io color scale, from the top down; the last entry catches everything below it.
const BADGE_COLOR_THRESHOLDS: readonly BadgeColorThreshold[] = [
  { color: '#4c1', minPercent: FULL_PERCENT },
  { color: '#97ca00', minPercent: GREEN_MIN_PERCENT },
  { color: '#a4a61d', minPercent: YELLOW_GREEN_MIN_PERCENT },
  { color: '#dfb317', minPercent: YELLOW_MIN_PERCENT },
  { color: '#fe7d37', minPercent: ORANGE_MIN_PERCENT },
  { color: RED, minPercent: 0 }
];

const BADGE_HEIGHT = 20;
// The padding on both sides of a text together.
const TEXT_PADDING = 12;
const HALF = 0.5;
const TEXT_BASELINE = 14;
const TEXT_SHADOW_BASELINE = 15;

// Approximate advance widths of 11px Verdana, the face shields.io measures with. The rendered text is stretched to
// the computed width through `textLength`, so an estimate a pixel off moves the padding, never clips the text.
const NARROW_CHARACTER_WIDTH = 3.9;
const DEFAULT_CHARACTER_WIDTH = 7;
const WIDE_CHARACTER_WIDTH = 9.5;
const PERCENT_SIGN_WIDTH = 11.9;
const NARROW_CHARACTERS = new Set([' ', '-', ',', ';', ':', '!', '.', '\'', '(', ')', '/', 'f', 'I', 'i', 'j', 'l', 'r', 't']);
const WIDE_CHARACTERS = new Set(['M', 'm', 'W', 'w']);

/**
 * Reads the lcov report, renders the badge and writes it.
 *
 * @param options - The {@link GenerateCoverageBadgeOptions}.
 * @returns A {@link Promise} that resolves to the {@link GenerateCoverageBadgeResult}.
 * @throws When the lcov report cannot be read; run the tests with coverage first.
 */
export async function generateCoverageBadge(options: GenerateCoverageBadgeOptions = {}): Promise<GenerateCoverageBadgeResult> {
  const {
    label = DEFAULT_LABEL,
    lcovPath = DEFAULT_LCOV_PATH,
    metric = 'lines',
    outputPath = DEFAULT_OUTPUT_PATH
  } = options;

  const resolvedLcovPath = resolvePathFromRootSafe({ path: lcovPath });
  let lcov: string;
  try {
    lcov = await readFile(resolvedLcovPath, 'utf-8');
  } catch (error) {
    throw new Error(`Could not read the lcov report '${resolvedLcovPath}'. Run the tests with coverage first.`, { cause: error });
  }

  const percent = getCoveragePercent(parseLcovTotals(lcov), metric);
  const resolvedOutputPath = resolvePathFromRootSafe({ path: outputPath });
  await mkdir(dirname(resolvedOutputPath), { recursive: true });
  await writeFile(resolvedOutputPath, renderCoverageBadgeSvg({ label, percent }));
  return { outputPath: resolvedOutputPath, percent };
}

/**
 * Picks the badge color of a coverage figure, on the shields.io scale.
 *
 * @param percent - The coverage figure, in percents.
 * @returns The color, as a CSS hex color.
 */
export function getCoverageBadgeColor(percent: number): string {
  const threshold = BADGE_COLOR_THRESHOLDS.find((candidate) => percent >= candidate.minPercent);
  return threshold?.color ?? RED;
}

/**
 * Computes the figure a badge shows.
 *
 * A kind with nothing to cover counts as fully covered, as vitest's own summary reports it. The figure is rounded
 * DOWN to one decimal, so a project at 99.96% never shows 100%.
 *
 * @param totals - The {@link CoverageTotals}.
 * @param metric - The {@link CoverageBadgeMetric}.
 * @returns The coverage figure, in percents.
 */
export function getCoveragePercent(totals: CoverageTotals, metric: CoverageBadgeMetric): number {
  const percents = {
    branches: toPercent(totals.branches),
    functions: toPercent(totals.functions),
    lines: toPercent(totals.lines)
  };
  const percent = metric === 'lowest' ? Math.min(percents.branches, percents.functions, percents.lines) : percents[metric];
  return Math.floor(percent * PERCENT_PRECISION) / PERCENT_PRECISION;
}

/**
 * Sums the per-file counts of an lcov report.
 *
 * @param lcov - The text of the report.
 * @returns The {@link CoverageTotals}.
 */
export function parseLcovTotals(lcov: string): CoverageTotals {
  const sums = new Map<string, number>();
  for (const line of lcov.split(/\r?\n/u)) {
    const match = /^(?<key>BRF|BRH|FNF|FNH|LF|LH):(?<value>\d+)$/u.exec(line.trim());
    if (!match?.groups) {
      continue;
    }
    const { key = '', value = '' } = match.groups;
    sums.set(key, (sums.get(key) ?? 0) + Number(value));
  }

  function count(coveredKey: string, totalKey: string): CoverageCount {
    return { covered: sums.get(coveredKey) ?? 0, total: sums.get(totalKey) ?? 0 };
  }

  return {
    branches: count('BRH', 'BRF'),
    functions: count('FNH', 'FNF'),
    lines: count('LH', 'LF')
  };
}

/**
 * Renders a coverage badge in the shields.io flat style.
 *
 * @param params - The {@link RenderCoverageBadgeSvgParams}.
 * @returns The SVG text.
 */
export function renderCoverageBadgeSvg(params: RenderCoverageBadgeSvgParams): string {
  const { label, percent } = params;
  const value = `${String(percent)}%`;
  const labelTextWidth = measureText(label);
  const valueTextWidth = measureText(value);
  const labelWidth = labelTextWidth + TEXT_PADDING;
  const valueWidth = valueTextWidth + TEXT_PADDING;
  const width = labelWidth + valueWidth;
  const labelCenter = labelWidth * HALF;
  const valueCenter = labelWidth + valueWidth * HALF;
  const color = getCoverageBadgeColor(percent);
  const title = escapeXml(`${label}: ${value}`);
  const escapedLabel = escapeXml(label);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(BADGE_HEIGHT)}" role="img" aria-label="${title}">
  <title>${title}</title>
  <linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
  <clipPath id="r"><rect width="${String(width)}" height="${String(BADGE_HEIGHT)}" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${String(labelWidth)}" height="${String(BADGE_HEIGHT)}" fill="#555"/>
    <rect x="${String(labelWidth)}" width="${String(valueWidth)}" height="${String(BADGE_HEIGHT)}" fill="${color}"/>
    <rect width="${String(width)}" height="${String(BADGE_HEIGHT)}" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11" text-rendering="geometricPrecision">
    <text x="${String(labelCenter)}" y="${String(TEXT_SHADOW_BASELINE)}" fill="#010101" fill-opacity=".3" textLength="${String(labelTextWidth)}">${escapedLabel}</text>
    <text x="${String(labelCenter)}" y="${String(TEXT_BASELINE)}" textLength="${String(labelTextWidth)}">${escapedLabel}</text>
    <text x="${String(valueCenter)}" y="${String(TEXT_SHADOW_BASELINE)}" fill="#010101" fill-opacity=".3" textLength="${String(valueTextWidth)}">${value}</text>
    <text x="${String(valueCenter)}" y="${String(TEXT_BASELINE)}" textLength="${String(valueTextWidth)}">${value}</text>
  </g>
</svg>
`;
}

function escapeXml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function measureCharacter(character: string): number {
  if (character === '%') {
    return PERCENT_SIGN_WIDTH;
  }
  if (NARROW_CHARACTERS.has(character)) {
    return NARROW_CHARACTER_WIDTH;
  }
  return WIDE_CHARACTERS.has(character) ? WIDE_CHARACTER_WIDTH : DEFAULT_CHARACTER_WIDTH;
}

function measureText(text: string): number {
  let width = 0;
  for (const character of text) {
    width += measureCharacter(character);
  }
  return Math.round(width);
}

function toPercent(count: CoverageCount): number {
  return count.total === 0 ? FULL_PERCENT : count.covered / count.total * FULL_PERCENT;
}
