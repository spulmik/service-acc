<template>
  <section class="reg-table">
    <div class="table-toolbar">
      <div>
        <h3>Почтовые ящики</h3>
        <span class="users-count">
          Всего: {{ filterTableData.length }}
        </span>
      </div>

      <el-input
        v-model="search"
        clearable
        placeholder="Поиск по почте"
        :prefix-icon="Search"
        class="search-input"
      />

      <el-button
        :loading="loading"
        @click="addUserReg"
        ><el-icon><Plus /></el-icon>
      </el-button>

      <el-button
        :loading="loading"
        @click="loadMailboxes"
      >
        Обновить список
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
      empty-text="Почтовые ящики не найдены"
    >
      <el-table-column
        label="Почта"
        prop="email"
        min-width="240"
        show-overflow-tooltip
      />

      <el-table-column
        label="Логин"
        prop="username"
        min-width="180"
        show-overflow-tooltip
      />

      <el-table-column label="Статус" min-width="130">
        <template #default="{ row }">
          <span class="status">
            <span
              class="status-dot"
              :class="row.is_blocked ? 'is-blocked' : 'is-active'"
            ></span>
            {{ row.is_blocked ? 'Отключён' : 'Активен' }}
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
                  :class="{ 'is-danger': !row.is_blocked }"
                >
                  <el-icon><CircleClose /></el-icon>{{ row.is_blocked ? 'Разблокировать' : 'Заблокировать' }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </el-table-column>
    </el-table>

    <div class="table-footer">
      <span class="footer-info">
        Домен: {{ selectedDomain }}
      </span>

      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :total="filterTableData.length"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        background
      />
    </div>

    <!-- Диалог добавления почты -->
    <RegAdd
      v-model="showAddDialog"
      @created="loadMailboxes"
    />
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox} from 'element-plus'
import { Search, Plus, MoreFilled, Delete, CircleClose } from '@element-plus/icons-vue'
import { getMailboxes, deleteUser, blockUser } from '@/api/Reg/users.js'
// import RegDelete from './RegDelete.vue'
import RegAdd from './RegAdd.vue'
// import {  } from "@/utils/format.js";

const search = ref('')
const tableData = ref([])
const loading = ref(false)
const error = ref('')
const showAddDialog = ref(false)
const selectedDomain = ref('energy-team.club')
const currentPage = ref(1)
const pageSize = ref(20)


function onCommand(command, row) {
  if (command === 'delete') onDelete(row)
  else if (command === 'block') onBlock(row)
}

// Блокировка / разблокировка: is_blocked приходит с бэкенда (ISPmanager
// disabled=on), поэтому одна и та же кнопка переключает статус.
async function onBlock(row) {
  if (!row.email) {
    ElMessage.error('У пользователя нет email')
    return
  }

  const willBlock = !row.is_blocked

  try {
    await ElMessageBox.confirm(
      willBlock
        ? `Заблокировать пользователя «${row.email}»? Он потеряет доступ к почте.`
        : `Разблокировать пользователя «${row.email}»?`,
      willBlock ? 'Блокировка пользователя' : 'Разблокировка пользователя',
      {
        type: 'warning',
        confirmButtonText: willBlock ? 'Заблокировать' : 'Разблокировать',
        cancelButtonText: 'Отмена',
        confirmButtonClass: willBlock ? 'el-button--danger' : '',
      }
    )
  } catch {
    // Пользователь отменил действие.
    return
  }

  loading.value = true

  try {
    await blockUser(row.email, willBlock)
    ElMessage.success(
      willBlock
        ? `Пользователь «${row.email}» заблокирован`
        : `Пользователь «${row.email}» разблокирован`
    )
    await loadMailboxes()
  } catch (err) {
    ElMessage.error(
      err instanceof Error ? err.message : 'Не удалось изменить статус пользователя'
    )
  } finally {
    loading.value = false
  }
}


async function onDelete(row) {
  // У ящика ISPmanager нет числового ID: он идентифицируется полным адресом.
  if (!row.email) {
    ElMessage.error('У пользователя нет email')
    return
  }

  try {
    await ElMessageBox.confirm(
      `Удалить пользователя «${row.email}»? Пользователь будет удалён из системы.`,
      'Удаление пользователя',
      {
        type: 'warning',
        confirmButtonText: 'Удалить',
        cancelButtonText: 'Отмена',
        confirmButtonClass: 'el-button--danger',
      }
    )
  } catch {
    // Пользователь отменил удаление.
    return
  }

  loading.value = true

  try {
    await deleteUser(row.email)
    ElMessage.success(`Пользователь «${row.email}» удален`)
    await loadMailboxes()
  } catch (err) {
    ElMessage.error(
      err instanceof Error ? err.message : 'Не удалось удалить пользователя'
    )
  } finally {
    loading.value = false
  }
}


const filterTableData = computed(() => {
  const query = search.value.toLowerCase().trim()

  if (!query) {
    return tableData.value
  }

  return tableData.value.filter((item) =>
    (item.email || '').toLowerCase().includes(query) ||
    (item.username || '').toLowerCase().includes(query) ||
    (item.is_blocked ? 'отключён' : 'активен').includes(query)
  )
})

// Срез под текущую страницу — таблице отдаём только видимые строки.
const pagedTableData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value

  return filterTableData.value.slice(start, start + pageSize.value)
})

// При новом поиске или смене размера страницы возвращаемся на первую,
// чтобы не оказаться на несуществующей странице.
watch([search, pageSize], () => {
  currentPage.value = 1
})

// function handleEdit(row) {
//   console.log('Редактирование пользователя:', row)
//   ElMessage.info('Редактирование пока не реализовано')
// }

function addUserReg() {
  showAddDialog.value = true
}

async function loadMailboxes() {
  loading.value = true
  error.value = ''

  try {
    const result = await getMailboxes(selectedDomain.value)

    // Бэкенд уже отдаёт готовые { username, email } с корректным
    // адресом из ISPmanager, поэтому ничего не достраиваем.
    tableData.value = result.mailboxes
    currentPage.value = 1

    console.log('Загружено почтовых ящиков:', tableData.value.length)
  } catch (err) {
    error.value =
      err instanceof Error
        ? err.message
        : 'Не удалось загрузить почтовые ящики'

    ElMessage.error(error.value)
  } finally {
    loading.value = false
  }
}

onMounted(loadMailboxes)
</script>

<style scoped>
.reg-table {
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

.table-toolbar h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.users-count {
  font-size: 14px;
  color: #909399;
}

.search-input {
  width: 300px;
}

/* STATUS: точка + текст — как в CloudContact и ВПН */
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
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding-top: 12px;
  margin-top: 16px;
  flex-wrap: wrap;
}

.footer-info {
  font-size: 13px;
  color: #909399;
}
</style>
