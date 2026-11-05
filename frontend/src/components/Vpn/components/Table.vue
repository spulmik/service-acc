<template>
  <section class="vpn-table">
    <div class="table-toolbar">
      <div>
        <h3>Пользователи</h3>
        <span class="users-count">Всего: {{ filterTableData.length }}</span>
      </div>

      <el-input
        v-model="search"
        clearable
        placeholder="Поиск"
        :prefix-icon="Search"
        class="search-input"
      />

      <el-button :loading="loading" @click="load">Обновить список</el-button>
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
      <el-table-column prop="name" label="Имя" min-width="180" show-overflow-tooltip />
      <el-table-column prop="email" label="Email" min-width="220" show-overflow-tooltip />

      <el-table-column label="Роль" min-width="120">
        <template #default="{ row }">
          <el-tag :type="roleType(row.role)" disable-transitions>
            {{ row.role || '—' }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="Статус" min-width="120">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)" disable-transitions>
            {{ row.status || '—' }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column prop="groups" label="Групп" width="90" align="center" />

      <el-table-column label="Последний вход" min-width="170">
        <template #default="{ row }">
          <span>{{ formatDate(row.last_login) }}</span>
        </template>
      </el-table-column>

      <el-table-column label="Заблокирован" width="130" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.is_blocked" type="danger" disable-transitions>Да</el-tag>
          <span v-else class="muted">Нет</span>
        </template>
      </el-table-column>

      <el-table-column label="Сервисный" width="110" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.is_service_user" type="info" disable-transitions>Да</el-tag>
          <span v-else class="muted">Нет</span>
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
import { getUsers } from '@/api/Vpn/users.js'

const search = ref('')
const tableData = ref([])
const loading = ref(false)
const error = ref('')
const currentPage = ref(1)
const pageSize = ref(20)

const filterTableData = computed(() => {
  const query = search.value.trim().toLowerCase()

  if (!query) {
    return tableData.value
  }

  return tableData.value.filter((item) =>
    [item.name, item.email, item.role, item.status].some((v) =>
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

function roleType(role) {
  if (role === 'owner') return 'danger'
  if (role === 'admin') return 'warning'
  return 'info'
}

function statusType(status) {
  if (status === 'active') return 'success'
  if (status === 'invited') return 'warning'
  if (status === 'blocked') return 'danger'
  return 'info'
}

function formatDate(value) {
  if (!value) return '—'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function load() {
  loading.value = true
  error.value = ''

  try {
    const result = await getUsers()

    tableData.value = Array.isArray(result)
      ? result
      : result?.users || []

    currentPage.value = 1
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : 'Не удалось загрузить пользователей VPN'

    ElMessage.error(error.value)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.vpn-table {
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
