import type { JSX } from 'solid-js';

import { render as renderSolid } from 'solid-js/web';

interface GreetingProps {
  readonly name: string;
}

function Greeting(props: GreetingProps): JSX.Element {
  return <p class="greeting">Hello from {props.name}</p>;
}

export function render(): string {
  const container = document.createElement('div');
  const dispose = renderSolid(() => <Greeting name="solid" />, container);
  const text = container.textContent;
  dispose();
  return text;
}
