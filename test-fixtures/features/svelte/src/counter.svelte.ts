interface Counter {
  readonly count: number;
}

export function createCounter(initial: number): Counter {
  const count = $state(initial);
  return {
    get count(): number {
      return count;
    }
  };
}
