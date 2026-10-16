import {
  flushSync,
  mount,
  unmount
} from 'svelte';

import Greeting from './Greeting.svelte';

export function render(): string {
  const target = document.createElement('div');
  const app = mount(Greeting, { props: { name: 'svelte' }, target });
  flushSync();
  const text = target.textContent;
  void unmount(app);
  return text;
}
