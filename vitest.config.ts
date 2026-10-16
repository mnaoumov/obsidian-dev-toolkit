import {
  DEFAULT_VITEST_TEST_EXCLUDE,
  defineLibraryVitestConfig
} from '@mnaoumov/typescript-dev-toolkit/test-runners/vitest-config';

const ESLINT_TYPECHECK_TEST_FILES = 'src/linters/eslint-rules/*.test.ts';
const INTEGRATION_TEST_FILES = 'src/**/*.integration.test.ts';
// The suites that load a build in a real Obsidian, which CI does not have.
const OBSIDIAN_INTEGRATION_TEST_FILES = 'src/**/*.obsidian.integration.test.ts';

// Every `@typescript-eslint/rule-tester` case builds a type-aware program, so these run one file at a time in a
// shared worker; see AGENTS.md on why a timeout here is machine load rather than a broken rule.
const ESLINT_TYPECHECK_GROUP_ORDER = 1;
const BIG_TIMEOUT_IN_MILLISECONDS = 30_000;

// Some tests here load `@mnaoumov/obsidian-lib` modules, which import `obsidian`: the mocks stand in for it.
const SHARED_RESOLVE = {
  alias: {
    obsidian: 'obsidian-test-mocks/obsidian'
  }
};

const SHARED_SERVER = {
  // eslint-disable-next-line unicorn/name-replacements -- `deps` is a Vitest config key.
  deps: {
    inline: ['@obsidian-typings', '@mnaoumov/typescript-dev-toolkit', '@mnaoumov/typescript-lib']
  }
};

export default defineLibraryVitestConfig({
  projects: [
    {
      resolve: SHARED_RESOLVE,
      test: {
        environment: 'node',
        exclude: [...DEFAULT_VITEST_TEST_EXCLUDE, INTEGRATION_TEST_FILES, ESLINT_TYPECHECK_TEST_FILES],
        include: ['src/**/*.test.ts'],
        name: 'unit-tests',
        server: SHARED_SERVER,
        setupFiles: []
      }
    },
    {
      resolve: SHARED_RESOLVE,
      test: {
        environment: 'node',
        exclude: [...DEFAULT_VITEST_TEST_EXCLUDE],
        include: [ESLINT_TYPECHECK_TEST_FILES],
        isolate: false,
        maxWorkers: 1,
        name: 'unit-tests:eslint-typecheck',
        sequence: {
          groupOrder: ESLINT_TYPECHECK_GROUP_ORDER
        },
        server: SHARED_SERVER,
        setupFiles: []
      }
    },
    {
      resolve: SHARED_RESOLVE,
      test: {
        environment: 'node',
        exclude: [...DEFAULT_VITEST_TEST_EXCLUDE, OBSIDIAN_INTEGRATION_TEST_FILES],
        include: [INTEGRATION_TEST_FILES],
        name: 'integration-tests',
        server: SHARED_SERVER,
        setupFiles: [],
        testTimeout: BIG_TIMEOUT_IN_MILLISECONDS
      }
    },
    {
      test: {
        environment: 'node',
        exclude: [...DEFAULT_VITEST_TEST_EXCLUDE],
        fileParallelism: false,
        // An empty vault in an owned Obsidian: each case installs the plugin it built itself.
        globalSetup: ['obsidian-integration-testing/vitest-global-setup-no-plugin'],
        hookTimeout: BIG_TIMEOUT_IN_MILLISECONDS,
        include: [OBSIDIAN_INTEGRATION_TEST_FILES],
        // Not `integration-tests:obsidian`: `test:integration` selects `integration-tests:*` too, and CI runs it.
        name: 'obsidian-integration-tests',
        server: SHARED_SERVER,
        setupFiles: ['obsidian-integration-testing/vitest-setup'],
        testTimeout: BIG_TIMEOUT_IN_MILLISECONDS
      }
    },
    {
      test: {
        environment: 'node',
        exclude: [...DEFAULT_VITEST_TEST_EXCLUDE],
        // The build and test scripts' own helpers; outside `src/`, so outside the coverage gate.
        include: ['scripts/**/*.test.ts'],
        name: 'unit-tests:scripts',
        setupFiles: []
      }
    }
  ]
});
