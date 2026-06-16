<template>
  <svg class="sparkline" viewBox="0 0 180 56" preserveAspectRatio="none" aria-hidden="true">
    <path class="spark-area" :d="paths.area"></path>
    <path class="spark-line" :d="paths.line"></path>
  </svg>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  values: {
    type: Array,
    default: () => []
  }
})

const paths = computed(() => {
  const clean = props.values.filter(Number.isFinite)
  if (clean.length < 2) return { line: '', area: '' }
  const width = 180
  const height = 56
  const min = Math.min(...clean)
  const max = Math.max(...clean)
  const span = max - min || 1
  const points = clean.map((value, index) => {
    const x = (index / (clean.length - 1)) * width
    const y = height - ((value - min) / span) * (height - 6) - 3
    return [x, y]
  })
  const line = points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ')
  return {
    line,
    area: `${line} L${width} ${height} L0 ${height} Z`
  }
})
</script>
