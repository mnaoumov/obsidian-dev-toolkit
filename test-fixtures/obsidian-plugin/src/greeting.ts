// No type annotations on purpose: rollup and webpack get no TypeScript plugin in the bundler test, so this
// file has to be valid JavaScript as well.
export function getGreeting(name) {
  return `Hello, ${name}`;
}
