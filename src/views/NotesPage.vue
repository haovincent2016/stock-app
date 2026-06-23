<template>
  <div class="app-shell notes-shell">
    <header class="topbar">
      <div class="topbar-brand">
        <h1>笔记</h1>
        <router-link class="topbar-menu" :to="{ name: 'home' }">期货</router-link>
        <router-link class="topbar-menu" :to="{ name: 'stocks' }">股票</router-link>
        <router-link class="topbar-menu active" :to="{ name: 'notes' }">笔记</router-link>
        <span class="topbar-date">{{ notes.length }} 条</span>
      </div>
      <div class="topbar-actions">
        <el-button :disabled="!notes.length" @click="exportNotes">导出文件</el-button>
      </div>
    </header>

    <main class="notes-page">
      <section class="notes-editor">
        <div class="notes-date-row">
          <span>当前日期</span>
          <strong>{{ todayLabel }}</strong>
        </div>
        <el-input v-model="draftTitle" clearable placeholder="标题（可选）" />
        <el-input
          v-model="draftBody"
          type="textarea"
          :rows="6"
          resize="vertical"
          placeholder="写下笔记..."
        />
        <div class="notes-editor-actions">
          <span>{{ draftBody.trim().length }} 字</span>
          <el-button type="primary" :disabled="!canSave" @click="saveNote">保存笔记</el-button>
        </div>
      </section>

      <div class="notes-content-layout">
        <section class="notes-list-panel">
          <div class="notes-list-head">
            <h2>已保存笔记</h2>
            <button v-if="notes.length" type="button" @click="clearDraft">清空输入</button>
          </div>

          <div v-if="notes.length" class="notes-list">
            <article
              v-for="(note, index) in pagedNotes"
              :key="note.id"
              class="note-card"
              :class="{ active: selectedNoteId === note.id }"
            >
              <button type="button" class="note-card-select" @click="selectedNoteId = note.id">
                <div class="note-card-main">
                  <span class="note-index">{{ pageStart + index + 1 }}</span>
                  <div>
                    <h3>{{ note.title || '未命名笔记' }}</h3>
                    <span>{{ note.noteDate || formatDay(note.createdAt) }} · {{ formatDate(note.updatedAt || note.createdAt) }}</span>
                  </div>
                </div>
              </button>
              <button type="button" class="note-delete-btn" title="删除" @click="deleteNote(note.id)">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 7h16" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                  <path d="M6 7l1 14h10l1-14" />
                  <path d="M9 7V4h6v3" />
                </svg>
              </button>
            </article>
          </div>

          <div v-if="notes.length > pageSize" class="notes-pagination">
            <button type="button" :disabled="currentPage === 1" @click="currentPage -= 1">上一页</button>
            <span>{{ currentPage }} / {{ totalPages }}</span>
            <button type="button" :disabled="currentPage === totalPages" @click="currentPage += 1">下一页</button>
          </div>

          <div v-if="!notes.length" class="empty-state notes-empty">还没有笔记</div>
        </section>

        <aside v-if="selectedNote" class="note-detail-panel">
          <div class="note-detail-head">
            <div>
              <h2>{{ selectedNote.title || '未命名笔记' }}</h2>
              <span>{{ selectedNote.noteDate || formatDay(selectedNote.createdAt) }} · {{ formatDate(selectedNote.updatedAt || selectedNote.createdAt) }}</span>
            </div>
            <button type="button" class="note-close-btn" title="关闭" @click="selectedNoteId = ''">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12" />
                <path d="M18 6L6 18" />
              </svg>
            </button>
          </div>
          <div class="note-detail-editor">
            <el-input v-model="selectedDraftTitle" clearable placeholder="标题（可选）" />
            <el-input
              v-model="selectedDraftBody"
              type="textarea"
              :rows="10"
              resize="vertical"
              placeholder="笔记内容"
            />
            <div class="note-detail-actions">
              <span>{{ selectedDraftBody.trim().length }} 字</span>
              <el-button type="primary" :disabled="!canSaveSelected" @click="saveSelectedNote">保存修改</el-button>
            </div>
          </div>
        </aside>
      </div>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'

const NOTES_STORAGE_KEY = 'trading_notes_v1'

const draftTitle = ref('')
const draftBody = ref('')
const notes = ref([])
const todayLabel = ref(formatDay(new Date()))
const currentPage = ref(1)
const pageSize = 5
const selectedNoteId = ref('')
const selectedDraftTitle = ref('')
const selectedDraftBody = ref('')

const canSave = computed(() => draftTitle.value.trim() || draftBody.value.trim())
const totalPages = computed(() => Math.max(1, Math.ceil(notes.value.length / pageSize)))
const pageStart = computed(() => (currentPage.value - 1) * pageSize)
const pagedNotes = computed(() => notes.value.slice(pageStart.value, pageStart.value + pageSize))
const selectedNote = computed(() => notes.value.find((note) => note.id === selectedNoteId.value) || null)
const canSaveSelected = computed(() => {
  if (!selectedNote.value) return false
  if (!selectedDraftTitle.value.trim() && !selectedDraftBody.value.trim()) return false
  return selectedDraftTitle.value.trim() !== (selectedNote.value.title || '') || selectedDraftBody.value.trim() !== selectedNote.value.body
})

onMounted(loadNotes)

watch(
  notes,
  (value) => {
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(value))
    if (currentPage.value > totalPages.value) currentPage.value = totalPages.value
  },
  { deep: true }
)

watch(
  selectedNote,
  (note) => {
    selectedDraftTitle.value = note?.title || ''
    selectedDraftBody.value = note?.body || ''
  },
  { immediate: true }
)

function loadNotes() {
  try {
    const rows = JSON.parse(localStorage.getItem(NOTES_STORAGE_KEY) || '[]')
    notes.value = Array.isArray(rows) ? rows.filter((row) => row?.id && row?.body) : []
  } catch {
    notes.value = []
  }
}

function saveNote() {
  const title = draftTitle.value.trim()
  const body = draftBody.value.trim()
  if (!title && !body) return

  notes.value.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    body,
    noteDate: formatDay(new Date()),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  })
  currentPage.value = 1
  clearDraft()
}

function deleteNote(id) {
  notes.value = notes.value.filter((note) => note.id !== id)
  if (selectedNoteId.value === id) selectedNoteId.value = ''
}

function saveSelectedNote() {
  const note = selectedNote.value
  if (!note) return
  const title = selectedDraftTitle.value.trim()
  const body = selectedDraftBody.value.trim()
  if (!title && !body) return

  note.title = title
  note.body = body
  note.updatedAt = new Date().toISOString()
}

function clearDraft() {
  draftTitle.value = ''
  draftBody.value = ''
}

function exportNotes() {
  if (!notes.value.length) return
  const content = notes.value.map(formatNoteForExport).join('\n\n---\n\n')
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `交易笔记-${dateStamp()}.txt`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function formatNoteForExport(note) {
  return [
    `标题：${note.title || '未命名笔记'}`,
    `日期：${note.noteDate || formatDay(note.createdAt)}`,
    `时间：${formatDate(note.updatedAt || note.createdAt)}`,
    '',
    note.body
  ].join('\n')
}

function formatDay(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  const pad = (number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function formatDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return date.toLocaleString('zh-CN', { hour12: false })
}

function dateStamp() {
  const date = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`
}
</script>
