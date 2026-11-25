<template>
  <section class="vpn-table">
    <div class="table-toolbar">
      <div>
        <h3>Приглашения</h3>
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

      <el-table-column label="Статус" min-width="130">
        <template #default="{ row }">
          <span class="status">
            <span
              class="status-dot"
              :class="row.expired ? 'is-blocked' : 'is-invited'"
            ></span>
            {{ row.expired ? 'Истёк' : 'Приглашён' }}
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

      <el-table-column label="Создано" min-width="170">
        <template #default="{ row }">
          <el-tooltip
            v-if="!isEmptyDate(row.created_at)"
            :content="fullDate(row.created_at)"
            placement="top"
          >
            <span class="last-login">
              <el-icon><Clock /></el-icon>{{ timeAgo(row.created_at) }}
            </span>
          </el-tooltip>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>

      <el-table-column label="Истекает" min-width="170">
        <template #default="{ row }">
          <el-tooltip
            v-if="!isEmptyDate(row.expires_at)"
            :content="fullDate(row.expires_at)"
            placement="top"
          >
            <span class="last-login" :class="{ 'is-expired': row.expired }">
              <el-icon><Clock /></el-icon>{{ formatDate(row.expires_at) }}
            </span>
          </el-tooltip>
          <span v-else class="muted">—</span>
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
                <el-dropdown-item command="refresh">
                  <el-icon><Refresh /></el-icon>Regenerate
                </el-dropdown-item>
                <el-dropdown-item command="delete" class="is-danger">
                  <el-icon><Delete /></el-icon>Delete
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
import { Search, User, Clock, Refresh, Delete, MoreFilled} from '@element-plus/icons-vue'
import { getInviteUsers, regenerateInvite, deleteInvite} from '@/api/Vpn/users.js'
import {
  initial,
  avatarColor,
  roleType,
  plural,
  timeAgo,
  fullDate,
  formatDate,
  isEmptyDate,
} from '@/utils/format.js'

const search = ref('')
const tableData = ref([])
const loading = ref(false)
const error = ref('')
const currentPage = ref(1)
const pageSize = ref(20)

// Человекочитаемая причина, почему письмо не ушло.
function mailReason(reason) {
  const map = {
    smtp_not_configured: 'SMTP не настроен на сервере',
    no_recipient: 'не указан адрес получателя',
    no_invite_token: 'NetBird не выдал ссылку-приглашение',
    send_failed: 'ошибка отправки',
  }

  return map[reason] || 'неизвестная причина'
}

const filterTableData = computed(() => {
  const query = search.value.trim().toLowerCase()

  if (!query) {
    return tableData.value
  }

  return tableData.value.filter((item) =>
    [item.name, item.email, item.role].some((v) =>
      String(v ?? '').toLowerCase().includes(query),
    ),
  )
})


function onCommand(command, row) {
  if (command === 'refresh') onRegenerate(row)
  else if (command === 'delete') onDelete(row)
}

async function onRegenerate(row) {
  if (!row.id) {
    ElMessage.error('У приглашения нет ID')
    return
  }

  loading.value = true

  try {
    // Передаём email и name — NetBird при regenerate их не возвращает,
    // а они нужны для отправки письма с новой ссылкой.
    const result = await regenerateInvite(row.id, {
      email: row.email,
      name: row.name,
    })

    ElMessage.success(`Приглашение для «${row.email}» обновлено`)

    // Старая ссылка уже недействительна — сообщаем, ушла ли новая на почту.
    const mail = result?.mail

    if (mail?.sent) {
      ElMessage.success(`Новая ссылка отправлена на ${row.email}`)
    } else {
      ElMessage.warning(
        `Ссылка обновлена, но письмо не отправлено (${mailReason(mail?.reason)})`,
      )
    }

    await load()
  } catch (err) {
    ElMessage.error(
      err instanceof Error ? err.message : 'Не удалось обновить приглашение'
    )
  } finally {
    loading.value = false
  }
}

async function onDelete(row) {
  if (!row.id) {
    ElMessage.error('У приглашения нет ID')
    return
  }

  try {
    await ElMessageBox.confirm(
      `Удалить приглашение для «${row.name || row.email}»? Ссылка-приглашение перестанет работать.`,
      'Удаление приглашения',
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
    await deleteInvite(row.id)
    ElMessage.success(`Приглашение для «${row.email}» удалено`)
    await load()
  } catch (err) {
    ElMessage.error(
      err instanceof Error ? err.message : 'Не удалось удалить приглашение'
    )
  } finally {
    loading.value = false
  }
}

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
    const result = await getInviteUsers()

    tableData.value = Array.isArray(result)
      ? result
      : result?.users || []

    currentPage.value = 1
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : 'Не удалось загрузить приглашения VPN'

    ElMessage.error(error.value)
  } finally {
    loading.value = false
  }
}

onMounted(load)

defineExpose({ load })
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

/* DATES */
.last-login {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--el-text-color-regular);
  cursor: default;
}

.last-login.is-expired {
  color: var(--el-color-danger);
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
