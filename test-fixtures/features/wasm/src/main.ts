// Instantiates the inlined WebAssembly module, whose one export answers 42.
import { Plugin } from 'obsidian';

import wasmBytes from './answer.wasm';

export default class WasmFixturePlugin extends Plugin {
  public override async onload(): Promise<void> {
    const { instance } = await WebAssembly.instantiate(wasmBytes);
    const answer = instance.exports['answer'] as () => number;
    this.addCommand({
      callback: () => answer(),
      id: 'render',
      name: 'Answer'
    });
  }
}
