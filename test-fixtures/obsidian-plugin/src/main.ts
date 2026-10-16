// The fixture every bundler adapter builds. It exercises the four things a plugin bundle has to get right:
// `obsidian` stays external, a Node builtin stays external, a dynamic import is inlined into `main.js`, and
// the imported CSS ends up in `styles.css`. No type annotations, so rollup and webpack need no TypeScript
// plugin to read it.
import { sep } from 'node:path';
import { Plugin } from 'obsidian';

import './styles.css';

export default class BundlerFixturePlugin extends Plugin {
  async onload() {
    const { getGreeting } = await import('./greeting.ts');
    this.addCommand({
      id: 'greet',
      name: getGreeting('bundler'),
      callback: () => sep
    });
  }
}
