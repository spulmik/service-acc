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

      <el-button :loading="loading" @click="addUsrVpn">
        <el-icon><Plus /></el-icon>
      </el-button>
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
      <!-- NAME: аватар + имя + email -->
      <el-table-column label="Имя" min-width="280">
        <template #default="{ row }">
          <div class="user-cell">
            <div
              class="avatar"
              :style="{ background: avatarColor(row.name || row.email) }"
            >
              {{ initial(row.name || row.email) }}
            </div>
            <div class="user-meta">
              <div class="user-name">{{ row.name || '—' }}</div>
              <div class="user-email">{{ row.email }}</div>
            </div>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="Роль" min-width="120">
        <template #default="{ row }">
          <el-tag :type="roleType(row.role)" disable-transitions>
            <el-icon class="tag-icon"><User /></el-icon>{{ row.role || '—' }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="Статус" min-width="120">
        <template #default="{ row }">
          <span class="status">
            <span class="status-dot" :class="statusClass(row.status)"></span>
            {{ statusLabel(row.status) }}
          </span>
        </template>
      </el-table-column>

      <el-table-column label="Группы" min-width="120">
        <template #default="{ row }">
          <el-tag type="info" disable-transitions>
            {{ row.groups }} {{ plural(row.groups, 'группа', 'группы', 'групп') }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="Последний вход" min-width="180">
        <template #default="{ row }">
          <el-tooltip
            v-if="!isEmptyDate(row.last_login)"
            :content="fullDate(row.last_login)"
            placement="top"
          >
            <span class="last-login">
              <el-icon><Clock /></el-icon>{{ timeAgo(row.last_login) }}
            </span>
          </el-tooltip>
          <span v-else class="muted">—</span>
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

    <VpnAdd v-model="showAddDialog" @created="load" />
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Plus, User, Clock } from '@element-plus/icons-vue'
import { getUsers } from '@/api/Vpn/users.js'
import VpnAdd from './addusr.vue'
import {
  initial,
  avatarColor,
  roleType,
  statusClass,
  statusLabel,
  plural,
  timeAgo,
  fullDate,
  isEmptyDate,
} from '@/utils/format.js'

const search = ref('')
const tableData = ref([])
const loading = ref(false)
const error = ref('')
const showAddDialog = ref(false)
const currentPage = ref(1)
const pageSize = ref(20)

function addUsrVpn() {
  showAddDialog.value = true
}

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

/* NAME: аватар + имя + email */
.user-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar {
  flex: none;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
}

.user-meta {
  min-width: 0;
}

.user-name {
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-email {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tag-icon {
  margin-right: 4px;
  vertical-align: -2px;
}

/* STATUS: точка + текст */
.status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--el-text-color-secondary);
}

.status-dot.is-active {
  background: var(--el-color-success);
}

.status-dot.is-invited {
  background: var(--el-color-warning);
}

.status-dot.is-blocked {
  background: var(--el-color-danger);
}

/* LAST LOGIN */
.last-login {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--el-text-color-regular);
  cursor: default;
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
