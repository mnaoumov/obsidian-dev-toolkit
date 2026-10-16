<script setup lang="ts">
const props = defineProps<{ name: string }>();
</script>

<template>
  <p class="greeting">Hello from {{ props.name }}</p>
</template>