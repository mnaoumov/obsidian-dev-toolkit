import type { ResolvePathFromRootSafeParams } from '@mnaoumov/typescript-dev-toolkit/root';

import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  isAbsolute,
  join
} from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  generateCoverageBadge,
  getCoverageBadgeColor,
  getCoveragePercent,
  parseLcovTotals,
  renderCoverageBadgeSvg
} from './coverage-badge.ts';

// The project root a relative path resolves against, so the defaults land in a temporary folder.
const rootFolder = vi.hoisted(() => ({ current: '' }));

vi.mock('@mnaoumov/typescript-dev-toolkit/root', () => ({
  resolvePathFromRootSafe: ({ path }: ResolvePathFromRootSafeParams): string => isAbsolute(path) ? path : join(rootFolder.current, path)
}));

const LCOV = [
  'TN:',
  'SF:src/a.ts',
  'FNF:4',
  'FNH:3',
  'LF:10',
  'LH:9',
  'BRF:4',
  'BRH:2',
  'end_of_record',
  'SF:src/b.ts',
  'FNF:1',
  'FNH:1',
  'LF:10',
  'LH:10',
  'BRF:0',
  'BRH:0',
  'end_of_record'
].join('\r\n');

describe('parseLcovTotals', () => {
  it('should sum the counts of every file', () => {
    expect(parseLcovTotals(LCOV)).toEqual({
      branches: { covered: 2, total: 4 },
      functions: { covered: 4, total: 5 },
      lines: { covered: 19, total: 20 }
    });
  });

  it('should count zero for a kind the report does not carry', () => {
    expect(parseLcovTotals('SF:src/a.ts\nLF:2\nLH:1\nend_of_record\n')).toEqual({
      branches: { covered: 0, total: 0 },
      functions: { covered: 0, total: 0 },
      lines: { covered: 1, total: 2 }
    });
  });
});

describe('getCoveragePercent', () => {
  const totals = parseLcovTotals(LCOV);

  it('should pick the metric asked for', () => {
    expect(getCoveragePercent(totals, 'lines')).toBe(95);
    expect(getCoveragePercent(totals, 'functions')).toBe(80);
    expect(getCoveragePercent(totals, 'branches')).toBe(50);
  });

  it('should pick the lowest of the three for lowest', () => {
    expect(getCoveragePercent(totals, 'lowest')).toBe(50);
  });

  it('should count a kind with nothing to cover as fully covered', () => {
    expect(getCoveragePercent(parseLcovTotals(''), 'lowest')).toBe(100);
  });

  it('should round down so a nearly full figure never shows 100', () => {
    expect(getCoveragePercent(parseLcovTotals('LF:10000\nLH:9996\n'), 'lines')).toBe(99.9);
  });
});

describe('getCoverageBadgeColor', () => {
  it.each([
    [100, '#4c1'],
    [95, '#97ca00'],
    [85, '#a4a61d'],
    [75, '#dfb317'],
    [65, '#fe7d37'],
    [10, '#e05d44'],
    [-1, '#e05d44']
  ])('should color %d%% as %s', (percent, color) => {
    expect(getCoverageBadgeColor(percent)).toBe(color);
  });
});

describe('renderCoverageBadgeSvg', () => {
  it('should render the label, the figure and its color', () => {
    const svg = renderCoverageBadgeSvg({ label: 'coverage', percent: 100 });
    expect(svg).toContain('<title>coverage: 100%</title>');
    expect(svg).toContain('fill="#4c1"');
    expect(svg).toContain('>100%</text>');
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
  });

  it('should escape the label', () => {
    const svg = renderCoverageBadgeSvg({ label: 'a<b>&"c"', percent: 50 });
    expect(svg).toContain('a&lt;b&gt;&amp;&quot;c&quot;');
    expect(svg).not.toContain('a<b>');
  });

  it('should widen the badge for a wider text', () => {
    const narrow = renderCoverageBadgeSvg({ label: 'il', percent: 1 });
    const wide = renderCoverageBadgeSvg({ label: 'MW', percent: 1 });
    expect(getWidth(wide)).toBeGreaterThan(getWidth(narrow));
  });
});

describe('generateCoverageBadge', () => {
  let folder = '';

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'coverage-badge-'));
  });

  afterEach(async () => {
    await rm(folder, { force: true, recursive: true });
  });

  it('should write the badge of the lcov report', async () => {
    const lcovPath = join(folder, 'lcov.info');
    await writeFile(lcovPath, LCOV);
    const outputPath = join(folder, 'nested', 'badge.svg');

    const result = await generateCoverageBadge({ label: 'tests', lcovPath, metric: 'functions', outputPath });

    expect(result).toEqual({ outputPath, percent: 80 });
    const svg = await readFile(outputPath, 'utf-8');
    expect(svg).toContain('<title>tests: 80%</title>');
  });

  it('should read coverage/lcov.info and write coverage/coverage-badge.svg by default', async () => {
    rootFolder.current = folder;
    await mkdir(join(folder, 'coverage'));
    await writeFile(join(folder, 'coverage', 'lcov.info'), LCOV);

    const result = await generateCoverageBadge();

    expect(result).toEqual({ outputPath: join(folder, 'coverage', 'coverage-badge.svg'), percent: 95 });
    expect(await readFile(result.outputPath, 'utf-8')).toContain('<title>coverage: 95%</title>');
  });

  it('should say how to get a report when there is none', async () => {
    await expect(generateCoverageBadge({ lcovPath: join(folder, 'missing.info') })).rejects.toThrow('Run the tests with coverage first.');
  });
});

function getWidth(svg: string): number {
  return Number(/width="(?<width>[\d.]+)"/u.exec(svg)?.groups?.['width']);
}
