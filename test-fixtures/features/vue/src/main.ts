// Renders the fixture's component into a detached element and returns its text, which the bundler test checks.
import { Plugin } from 'obsidian';

import { render } from './render.ts';

export default class FeatureFixturePlugin extends Plugin {
  public override async onload(): Promise<void> {
    this.addCommand({
      callback: () => render(),
      id: 'render',
      name: 'Render'
    });
  }
}
