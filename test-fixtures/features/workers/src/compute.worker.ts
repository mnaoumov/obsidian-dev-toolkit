import { answer } from './answer.ts';
import bytes from './answer.wasm';

const instance = new WebAssembly.Instance(new WebAssembly.Module(bytes));
const compute = instance.exports['answer'] as () => number;
postMessage(answer + compute());
