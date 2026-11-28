// A decorated class reached at load time, beside a dynamic import of another module, which the parcel adapter turns
// Into a `require()`. Together they are the shape whose `main.js` threw `_ts_decorate is not a function` at load.
import { Plugin } from 'obsidian';

import { Tagged } from './tagged.ts';

export default class DecoratorsFixturePlugin extends Plugin {
  public override async onload(): Promise<void> {
    const { getSuffix } = await import('./suffix.ts');
    this.addCommand({
      callback: () => `${new Tagged().describe()}${getSuffix()}`,
      id: 'render',
      name: 'Describe'
    });
  }
}
