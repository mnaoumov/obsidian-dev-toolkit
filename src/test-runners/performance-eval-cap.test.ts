import { DEFAULT_EVAL_CAP_IN_MILLISECONDS as HARNESS_DEFAULT_EVAL_CAP_IN_MILLISECONDS } from 'obsidian-integration-testing';
import {
  describe,
  expect,
  it
} from 'vitest';

import { DEFAULT_EVAL_CAP_IN_MILLISECONDS } from './performance-eval-cap.ts';

describe('DEFAULT_EVAL_CAP_IN_MILLISECONDS', () => {
  it('equals the cap obsidian-integration-testing enforces', () => {
    expect(DEFAULT_EVAL_CAP_IN_MILLISECONDS).toBe(HARNESS_DEFAULT_EVAL_CAP_IN_MILLISECONDS);
  });
});
