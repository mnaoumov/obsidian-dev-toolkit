// Imports a Tailwind stylesheet and a CSS module. The command's name uses a Tailwind utility, so Tailwind finds it in
// The sources, and the command returns the CSS module's scoped class name.
import { Plugin } from 'obsidian';

import cardClassNames from './card.module.css';
import './styles.css';

export default class StylesFixturePlugin extends Plugin {
  public override async onload(): Promise<void> {
    this.addCommand({
      callback: () => cardClassNames['card'],
      id: 'render',
      name: 'text-red-500'
    });
  }
}
