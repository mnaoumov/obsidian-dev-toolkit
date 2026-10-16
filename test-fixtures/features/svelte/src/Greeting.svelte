<script lang="ts">
  import { createCounter } from './counter.svelte.ts';

  interface Props {
    name: string;
  }

  const { name }: Props = $props();
  const counter = createCounter(1);
</script>

<p class="greeting">Hello from {name} {counter.count}</p>

<style>
  .greeting {
    color: rebeccapurple;
  }
</style>