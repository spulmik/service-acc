<template>
  <section class="contact-table">
    <div class="table-toolbar">
      <div>
        <h3>{{ title }}</h3>
        <span class="users-count">Всего: {{ filterTableData.length }}</span>
      </div>

      <el-input
        v-model="search"
        clearable
        placeholder="Поиск"
        :prefix-icon="Search"
        class="search-input"
      />

      <el-button :loading="loading" @click="load(true)">Обновить список</el-button>
    </div>

    <el-alert
      v-if="error"
      :title="error"
      type="error"
      show-icon
      :closable="false"
      class="table-alert"
    />

    <el-table
      v-loading="loading"
      :data="pagedTableData"
      stripe
      style="width: 100%"
      empty-text="Нет данных"
    >
      <el-table-column
        v-for="col in columns"
        :key="col"
        :prop="col"
        :label="col"
        min-width="160"
        show-overflow-tooltip
      />
    </el-table>

    <div class="table-footer">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :total="filterTableData.length"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        background
      />
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import { getUsers } from '@/api/CloudContact/users.js'

const props = defineProps({
  // Тип вкладки: osn | msp | back — по нему выбирается URL запроса.
  type: { type: String, required: true },
  title: { type: String, default: 'Пользователи' },
})

const search = ref('')
const tableData = ref([])
const loading = ref(false)
const error = ref('')
const currentPage = ref(1)
const pageSize = ref(20)

// Колонки берём из ключей первой строки — пока структура данных не задана.
const columns = computed(() =>
  tableData.value.length ? Object.keys(tableData.value[0]) : [],
)

const filterTableData = computed(() => {
  const query = search.value.trim().toLowerCase()

  if (!query) {
    return tableData.value
  }

  return tableData.value.filter((item) =>
    Object.values(item).some((v) =>
      String(v ?? '').toLowerCase().includes(query),
    ),
  )
})

const pagedTableData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value

  return filterTableData.value.slice(start, start + pageSize.value)
})

watch([search, pageSize], () => {
  currentPage.value = 1
})

// force=true (кнопка «Обновить список») — сбрасываем кэш на бэкенде.
// Автозагрузка при монтировании/смене вкладки идёт из кэша (быстро).
async function load(force = false) {
  loading.value = true
  error.value = ''

  try {
    const result = await getUsers(props.type, { refresh: force === true })

    // Поддержим массив и типовые обёртки {users|items|mailboxes}.
    tableData.value = Array.isArray(result)
      ? result
      : result?.users || result?.items || result?.mailboxes || []

    currentPage.value = 1
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : 'Не удалось загрузить данные'

    ElMessage.error(error.value)
  } finally {
    loading.value = false
  }
}

// Перезагружаем при смене типа и при монтировании.
watch(() => props.type, load)
onMounted(load)
</script>

<style scoped>
.contact-table {
  padding: 20px;
}

.table-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.table-toolbar > div:first-child {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex: 1;
}

.users-count {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.search-input {
  width: 280px;
}

.table-alert {
  margin-bottom: 16px;
}

.table-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 12px;
  margin-top: 16px;
}
</style>
