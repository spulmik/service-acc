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
      <!-- NAME: аватар + ФИО + логин -->
      <el-table-column label="Имя" min-width="280">
        <template #default="{ row }">
          <div class="user-cell">
            <div
              class="avatar"
              :style="{ background: avatarColor(fullName(row) || row.loginId) }"
            >
              {{ initial(fullName(row) || row.loginId) }}
            </div>
            <div class="user-meta">
              <div class="user-name">{{ fullName(row) || '—' }}</div>
              <div class="user-email">{{ row.loginId }}</div>
            </div>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="Внутр. номер" min-width="130">
        <template #default="{ row }">
          <span v-if="row.extension" class="ext">{{ row.extension }}</span>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>

      <el-table-column label="Команда" min-width="180">
        <template #default="{ row }">
          <el-tag v-if="row.team" type="info" disable-transitions>
            {{ row.team }}
          </el-tag>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>

      <el-table-column label="Статус" min-width="130">
        <template #default="{ row }">
          <span class="status">
            <span
              class="status-dot"
              :class="row.disabled ? 'is-blocked' : 'is-active'"
            ></span>
            {{ row.disabled ? 'Отключён' : 'Активен' }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="" width="60" align="center">
        <template #default="{ row }">
          <el-dropdown
            trigger="click"
            placement="bottom-end"
            popper-class="vpn-row-menu"
            @command="(cmd) => onCommand(cmd, row)"
          >
            <el-button
              text
              circle
              size="small"
              class="row-actions"
              @click.stop
            >
              <el-icon :size="18"><MoreFilled /></el-icon>
            </el-button>

            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="delete" class="is-danger">
                  <el-icon><Delete /></el-icon>Удалить
                </el-dropdown-item>
                <el-dropdown-item
                  command="block"
                  :class="{ 'is-danger': !row.disabled }"
                >
                  <el-icon><CircleClose /></el-icon>{{ row.disabled ? 'Разблокировать' : 'Заблокировать' }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
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
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, MoreFilled, Delete, CircleClose} from '@element-plus/icons-vue'
import { getUsers, deleteUser, blockUser } from '@/api/CloudContact/users.js'
import { initial, avatarColor } from '@/utils/format.js'

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

function fullName(row) {
  return [row.lastName, row.firstName].map((s) => String(s || '').trim())
    .filter(Boolean)
    .join(' ')
}



function onCommand(command, row) {
  if (command === 'delete') onDelete(row)
  else if(command === 'block') onBlock(row)
}

async function onBlock(row) {
  if (!row.loginId) {
    ElMessage.error('У пользователя нет логина')
    return
  }

  const label = fullName(row) || row.loginId
  const willBlock = !row.disabled

  try {
    await ElMessageBox.confirm(
      willBlock
        ? `Заблокировать пользователя «${label}» (${row.loginId})?`
        : `Разблокировать пользователя «${label}» (${row.loginId})?`,
      willBlock ? 'Блокировка пользователя' : 'Разблокировка пользователя',
      {
        type: 'warning',
        confirmButtonText: willBlock ? 'Заблокировать' : 'Разблокировать',
        cancelButtonText: 'Отмена',
        confirmButtonClass: willBlock ? 'el-button--danger' : '',
      },
    )
  } catch {
    return
  }

  loading.value = true

  try {
    await blockUser(props.type, row.loginId, willBlock)
    ElMessage.success(
      willBlock
        ? `Пользователь «${label}» заблокирован`
        : `Пользователь «${label}» разблокирован`,
    )
    await load(true)
  } catch (err) {
    ElMessage.error(
      err instanceof Error ? err.message : 'Не удалось изменить статус пользователя',
    )
  } finally {
    loading.value = false
  }
}

async function onDelete(row) {
  if (!row.loginId) {
    ElMessage.error('У пользователя нет логина')
    return
  }

  const label = fullName(row) || row.loginId

  try {
    await ElMessageBox.confirm(
      `Удалить пользователя «${label}» (${row.loginId})? Действие необратимо.`,
      'Удаление пользователя',
      {
        type: 'warning',
        confirmButtonText: 'Удалить',
        cancelButtonText: 'Отмена',
        confirmButtonClass: 'el-button--danger',
      },
    )
  } catch {
    // Пользователь отменил удаление.
    return
  }

  loading.value = true

  try {
    await deleteUser(props.type, row.loginId)
    ElMessage.success(`Пользователь «${label}» удалён`)
    await load(true)
  } catch (err) {
    ElMessage.error(
      err instanceof Error ? err.message : 'Не удалось удалить пользователя',
    )
  } finally {
    loading.value = false
  }
}




const filterTableData = computed(() => {
  const query = search.value.trim().toLowerCase()

  if (!query) {
    return tableData.value
  }

  return tableData.value.filter((item) =>
    [item.loginId, item.firstName, item.lastName, item.extension, item.team].some(
      (v) => String(v ?? '').toLowerCase().includes(query),
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

watch(() => props.type, load)
onMounted(load)

defineExpose({ load })
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

.muted {
  color: var(--el-text-color-secondary);
}

.ext {
  font-variant-numeric: tabular-nums;
}

/* NAME: аватар + ФИО + логин */
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

.status-dot.is-blocked {
  background: var(--el-color-danger);
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

<!-- Меню действий строки телепортируется в body — стили не scoped. -->
<style>
.vpn-row-menu .el-dropdown-menu__item {
  gap: 8px;
}

.vpn-row-menu .el-dropdown-menu__item.is-danger {
  color: var(--el-color-danger);
}

.vpn-row-menu .el-dropdown-menu__item.is-danger:hover {
  background-color: var(--el-color-danger-light-9);
}
</style>
