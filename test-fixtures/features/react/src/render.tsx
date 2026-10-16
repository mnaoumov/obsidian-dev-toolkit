import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

interface GreetingProps {
  readonly name: string;
}

function Greeting({ name }: GreetingProps): React.JSX.Element {
  return <p className="greeting">Hello from {name}</p>;
}

export function render(): string {
  const container = document.createElement('div');
  const root = createRoot(container);
  flushSync(() => {
    root.render(<Greeting name="react" />);
  });
  const text = container.textContent;
  root.unmount();
  return text;
}
