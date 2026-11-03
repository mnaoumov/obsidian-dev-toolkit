/**
 * @file
 *
 * Generates a VS Code renderer debugger configuration for esbuild development bundles.
 */

const DEFAULT_DEBUG_PORT = 9222;
const MAX_PORT = 65_535;

// eslint-disable-next-line no-template-curly-in-string -- VS Code substitutes this variable when attaching.
const WORKSPACE_FOLDER = '${workspaceFolder}';

/**
 * Parameters for {@link createObsidianDebugConfig}.
 */
export interface CreateObsidianDebugConfigParams {
  /**
   * The npm package name, matching the build's source-map URL prefix.
   */
  readonly pluginName: string;
  /**
   * The renderer's remote debugging port.
   *
   * @default `9222`
   */
  readonly port?: number;
}

/**
 * The settings accepted by VS Code's built-in browser debugger.
 */
export interface ObsidianDebugAttachConfig {
  /**
   * The local debugging address.
   */
  readonly address: string;
  /**
   * The name shown in Run and Debug.
   */
  readonly name: string;
  /**
   * The renderer debugging port.
   */
  readonly port: number;
  /**
   * Attaches to an already running Obsidian.
   */
  readonly request: string;
  /**
   * Maps the toolkit's development source URLs onto the local project.
   */
  readonly sourceMapPathOverrides: Readonly<Record<string, string>>;
  /**
   * Enables source-map support.
   */
  readonly sourceMaps: boolean;
  /**
   * The built-in browser debugger type.
   */
  readonly type: string;
  /**
   * The local root for source files.
   */
  readonly webRoot: string;
}

/**
 * A VS Code launch configuration containing the renderer attachment.
 */
export interface ObsidianDebugConfig {
  /**
   * The renderer attachment configurations.
   */
  readonly configurations: readonly ObsidianDebugAttachConfig[];
  /**
   * The VS Code launch file schema version.
   */
  readonly version: string;
}

/**
 * Creates an attach configuration matching the esbuild development source-map rewrite.
 *
 * @param params - The package name and optional renderer port.
 * @returns A serializable VS Code launch file.
 * @throws If the port or package name cannot be used in the mapping.
 */
export function createObsidianDebugConfig(params: CreateObsidianDebugConfigParams): ObsidianDebugConfig {
  const { pluginName, port = DEFAULT_DEBUG_PORT } = params;
  if (!Number.isSafeInteger(port) || port < 1 || port > MAX_PORT) {
    throw new Error('The debugging port must be an integer between 1 and 65535.');
  }
  if (!pluginName || pluginName === '(unknown)' || /[\s*?#]/.test(pluginName)) {
    throw new Error('A package name without whitespace or URL wildcard characters is required.');
  }
  return {
    configurations: [{
      address: '127.0.0.1',
      name: 'Attach to Obsidian',
      port,
      request: 'attach',
      sourceMapPathOverrides: {
        [`app://obsidian.md/plugin:${pluginName}/*`]: `${WORKSPACE_FOLDER}/*`
      },
      sourceMaps: true,
      type: 'chrome',
      webRoot: WORKSPACE_FOLDER
    }],
    version: '0.2.0'
  };
}
