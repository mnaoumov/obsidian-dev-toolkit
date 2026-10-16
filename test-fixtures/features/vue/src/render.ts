import { createApp } from 'vue';

import Greeting from './Greeting.vue';

export function render(): string {
  const container = document.createElement('div');
  const app = createApp(Greeting, { name: 'vue' });
  app.mount(container);
  const text = container.textContent;
  app.unmount();
  return text;
}
