---
title: Debugging in VS Code
description: Attach VS Code to Obsidian and bind TypeScript breakpoints to esbuild development source maps.
---

VS Code's built-in browser debugger can attach to the Obsidian renderer; you do not need the retired Debugger for Chrome extension. Start Obsidian with its debugging endpoint and run the development build first, as [Debugging plugins](/obsidian-dev-toolkit/guides/debugging/) describes.

## Generate the attach configuration

Open the plugin's project root in VS Code, with `package.json` and `src/` directly inside the workspace folder. From that same directory, run the installed toolkit's command:

```bash
npx generate-vscode-debug-config
```

It creates `.vscode/launch.json`, reading `name` from `package.json`. It refuses to overwrite an existing file, including a JSON-with-comments file. If you already have configurations, add the configuration below to their `configurations` array yourself, replacing `my-plugin-package` with your `npm` package name. A scoped name such as `@example/my-plugin` goes in full, including the slash. The manifest's `id` and display `name` are different values and are not the source-map prefix.

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Attach to Obsidian",
      "type": "chrome",
      "request": "attach",
      "address": "127.0.0.1",
      "port": 9222,
      "webRoot": "${workspaceFolder}",
      "sourceMaps": true,
      "sourceMapPathOverrides": {
        "app://obsidian.md/plugin:my-plugin-package/*": "${workspaceFolder}/*"
      }
    }
  ]
}
```

For a different port, run `npx generate-vscode-debug-config --port=9333` and start Obsidian with `npx start-obsidian-for-debugging --port=9333`. See the [VS Code browser debugging documentation](https://code.visualstudio.com/docs/nodejs/browser-debugging) and [debugger options](https://github.com/microsoft/vscode-js-debug/blob/main/OPTIONS.md) for the underlying attach and path-mapping settings.

## Attach and pause

In VS Code, choose **Run and Debug → Attach to Obsidian**, then press **F5**. With several vault windows open, select the target belonging to your development vault. Set a breakpoint inside a command callback and invoke that command in Obsidian. A bound breakpoint pauses on your original TypeScript line, with locals available in VS Code.

The generated override maps the build's `app://obsidian.md/plugin:<package name>/<project-relative path>` sources back to `${workspaceFolder}/<project-relative path>`. This works when the build's project root and the VS Code workspace root are the same directory. Custom entry points outside the project root and multi-root workspaces need mappings to their actual local files.

## Diagnose unbound breakpoints

1. Confirm the attach target is your development vault's renderer and that the plugin is enabled there. A Node inspector port attaches to a different runtime.
2. Confirm the deployed `main.js` is the latest development build. Check the watcher output and `OBSIDIAN_CONFIG_FOLDER`; an old production bundle has no useful TypeScript map.
3. Confirm `package.json`'s `name` matches the `plugin:` prefix in the override, especially after renaming a package. Regenerate the configuration or update the existing entry.
4. Open the plugin's own project folder as the workspace. In a monorepo, replace `${workspaceFolder}` in both fields with the plugin folder or a named workspace folder such as `${workspaceFolder:my-plugin}`.
5. Run **Debug: Diagnose Breakpoint Problems** in VS Code's Command Palette. Inspect loaded scripts and their source maps; add `"trace": true` to the attach configuration when collecting a debugger trace.
6. Reload the plugin after attachment, then invoke the callback containing the breakpoint. A breakpoint on a type-only declaration or another line with no emitted JavaScript cannot pause execution.
