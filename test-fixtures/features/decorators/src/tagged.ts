// A class decorated at the top level of a module, with `experimentalDecorators` on, so the decorator call runs while
// The bundle loads. Parcel compiles it with a call to a helper it injects (`_ts_decorate`), which must be defined by then.
// The tag is keyed by the class itself, not its name, which a minifier renames.
const tags = new Map<unknown, string>();

function tag(name: string) {
  return (target: abstract new () => unknown): void => {
    tags.set(target, name);
  };
}

@tag('decorated')
export class Tagged {
  public describe(): string {
    return `${tags.get(Tagged) ?? 'undecorated'} class`;
  }
}
