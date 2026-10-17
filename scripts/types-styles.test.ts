// The ambient stylesheet types (`types/styles.d.ts`): a CSS module import gives its class names, while a plain
// stylesheet stays untyped. TypeScript resolves an import against the FIRST declared wildcard among those with equally
// long prefixes, so a `*.css` declared before `*.module.css` typed every CSS module import `any`. The assertions are
// checked by the type-check, not at run time.

// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- The file is ambient, so it cannot be imported.
/// <reference path="../types/styles.d.ts" />

import {
  describe,
  expectTypeOf,
  it
} from 'vitest';

import type cssClassNames from './fixtures/card.module.css';
import type pcssClassNames from './fixtures/card.module.pcss';
import type sassClassNames from './fixtures/card.module.sass';
import type scssClassNames from './fixtures/card.module.scss';

type ClassNames = Readonly<Record<string, string>>;

describe('types/styles', () => {
  it('types a CSS module default import as its class names', () => {
    expectTypeOf<typeof cssClassNames>().toEqualTypeOf<ClassNames>();
    expectTypeOf<typeof pcssClassNames>().toEqualTypeOf<ClassNames>();
    expectTypeOf<typeof sassClassNames>().toEqualTypeOf<ClassNames>();
    expectTypeOf<typeof scssClassNames>().toEqualTypeOf<ClassNames>();
  });
});
