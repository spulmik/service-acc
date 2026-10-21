
<template>
  <section class="yandex-table">
    <div class="table-toolbar">
      <div>
        <h3>Пользователи</h3>
        <span class="users-count">
          Всего: {{ filterTableData.length }}
        </span>
      </div>

      <el-input
        v-model="search"
        clearable
        placeholder="Поиск по почте или ФИО"
        :prefix-icon="Search"
        class="search-input"
      />
      <el-button
        :loading="loading"
        @click="addYandexUser"
        icon=""><el-icon><Plus /></el-icon>
      </el-button>
      <el-button
          :loading="loading"
          @click="loadUsers"
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
      empty-text="Пользователи не найдены"
    >
      <el-table-column
        label="Почта"
        prop="email"
        min-width="240"
        show-overflow-tooltip
      />

      <el-table-column
        label="ФИО"
        prop="fio"
        min-width="240"
        show-overflow-tooltip
      />

      <el-table-column
        label="Логин"
        prop="nickname"
        min-width="150"
        show-overflow-tooltip
      />

    <el-table-column
    label="Действия"
    width="250"
    align="right"
    fixed="right"
    >
    <template #default="{ row }">
        <el-button
        size="small"
        @click="handleEdit(row)"
        >
        Изменить
        </el-button>

        <YandexDelete
        :user="row"
        @deleted="loadUsers"
        />
    </template>
    </el-table-column>

    </el-table>

    <div class="table-footer">
      <span class="footer-info">
        Домен: @energy-team.ru 
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

    <!-- Диалог добавления пользователя -->
    <YandexAdd
      v-model="showAddDialog"
      @created="handleUserCreated"
    />
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Plus } from '@element-plus/icons-vue'
import { getUsers } from '@/api/Yandex/users.js'
import YandexDelete from './YandexDelete.vue'
import YandexAdd from './YandexAdd.vue'

const search = ref('')
const tableData = ref([])
const loading = ref(false)
const error = ref('')
const showAddDialog = ref(false)
const currentPage = ref(1)
const pageSize = ref(20)

const filterTableData = computed(() => {
  const query = search.value.trim().toLowerCase()

  if (!query) {
    return tableData.value
  }

  return tableData.value.filter((item) =>
    [item.email, item.fio, item.nickname]
      .some((value) =>
        String(value || '').toLowerCase().includes(query)
      )
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

async function loadUsers() {
  loading.value = true
  error.value = ''

  try {
    const users = await getUsers()

    tableData.value = users.map((user) => ({
      ...user,
      email:
        user.email ||
        (user.nickname ? `${user.nickname}@energy-team.ru` : ''),
      fio: [
        user.name?.last,
        user.name?.first,
        user.name?.middle,
      ].filter(Boolean).join(' '),
      nickname: user.nickname || '',
    }))
    currentPage.value = 1
  } catch (err) {
    error.value =
      err instanceof Error
        ? err.message
        : 'Не удалось загрузить пользователей'

    ElMessage.error(error.value)
  } finally {
    loading.value = false
  }
}

function handleEdit(row) {
  console.log('Редактирование пользователя:', row)
  ElMessage.info('Редактирование пока не реализовано')
}

function addYandexUser() {
  showAddDialog.value = true
}

function handleUserCreated(newUser) {
  // Обновить список пользователей
  loadUsers()
}

onMounted(loadUsers)
</script>

<style scoped>
.yandex-table {
  margin-top: 20px;
  width: 100%;
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
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.search-input {
  max-width: 320px;
}

.table-alert {
  margin-bottom: 16px;
}

.table-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

@media (max-width: 640px) {
  .table-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .search-input {
    max-width: none;
  }
}
</style>
