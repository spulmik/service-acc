<template>
  <section class="gl-table">
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

      <el-switch
        v-model="showPasswords"
        active-text="Показать пароли"
        inline-prompt
      />

      <el-button :loading="loading" @click="load">Обновить список</el-button>

      

      <el-button @click="settingsVisible = true">Настройки</el-button>
    </div>

    <SettingsDialog v-model="settingsVisible" />


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
        :key="col.prop"
        :prop="col.prop"
        :label="col.label"
        min-width="150"
        show-overflow-tooltip
      />

      <el-table-column label="Пароль" min-width="160">
        <template #default="{ row }">
          <span v-if="!row.password" class="muted">—</span>
          <span v-else-if="showPasswords" class="password-cell">{{
            row.password
          }}</span>
          <span v-else class="muted">••••••••</span>
        </template>
      </el-table-column>
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
import { getMembers } from '@/api/Globalusers/users.js'
import SettingsDialog from './SettingsDialog.vue'

defineProps({
  title: { type: String, default: 'Управление пользователями' },
})

// Красивые подписи для известных полей. Незнакомые покажем как есть.
const LABELS = {
  fio: 'ФИО',
  username: 'Логин',
  email: 'Email',
  yandex: 'Яндекс',
  reg: 'Рег',
  vpn: 'ВПН',
  cloudcontact: 'CloudContact',
  cloudcontact_msp: 'CloudContact MSP',
  cloudcontact_back: 'CloudContact Back',
  phone: 'Телефон',
  position: 'Должность',
  vpngroups: 'Группы VPN',
}

// Служебные поля и пароль (пароль — отдельной колонкой с маскировкой).
const HIDDEN = new Set(['id', 'created_at', 'updated_at', 'password'])

// Столбцы строим динамически по ключам из БД (первая строка ответа).
const columns = computed(() => {
  const first = tableData.value[0]

  if (!first) {
    return []
  }

  return Object.keys(first)
    .filter((key) => !HIDDEN.has(key))
    .map((key) => ({ prop: key, label: LABELS[key] || key }))
})

const search = ref('')
const tableData = ref([])
const loading = ref(false)
const error = ref('')
const currentPage = ref(1)
const pageSize = ref(20)
const showPasswords = ref(false)
const settingsVisible = ref(false)

const filterTableData = computed(() => {
  const query = search.value.trim().toLowerCase()

  if (!query) {
    return tableData.value
  }

  // В поиск пароль не включаем намеренно.
  return tableData.value.filter((item) =>
    columns.value.some((col) =>
      String(item[col.prop] ?? '')
        .toLowerCase()
        .includes(query),
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

async function load() {
  loading.value = true
  error.value = ''

  try {
    const result = await getMembers()

    tableData.value = Array.isArray(result)
      ? result
      : result?.members || []

    currentPage.value = 1
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : 'Не удалось загрузить участников'

    ElMessage.error(error.value)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.gl-table {
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
  width: 260px;
}

.password-cell {
  font-family: monospace;
}

.muted {
  color: var(--el-text-color-secondary);
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
