import { render as renderPreact } from 'preact';

interface GreetingProps {
  readonly name: string;
}

function Greeting({ name }: GreetingProps): preact.JSX.Element {
  return <p class="greeting">Hello from {name}</p>;
}

export function render(): string {
  const container = document.createElement('div');
  renderPreact(<Greeting name="preact" />, container);
  return container.textContent;
}
