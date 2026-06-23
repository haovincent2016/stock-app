<template>
  <router-view />
  <router-link class="notes-entry" :class="{ active: isNotesPage }" :to="{ name: 'notes' }" title="笔记" aria-label="打开笔记">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v5h4" />
      <path d="M9 12h6" />
      <path d="M9 16h4" />
    </svg>
  </router-link>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const isNotesPage = computed(() => route.name === 'notes')
</script>
