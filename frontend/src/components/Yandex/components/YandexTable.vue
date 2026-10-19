
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
      :data="filterTableData"
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
    width="220"
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
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Plus } from '@element-plus/icons-vue'
import { getUsers } from '@/api/Yandex/users.js'
import YandexDelete from './YandexDelete.vue'

const search = ref('')
const tableData = ref([])
const loading = ref(false)
const error = ref('')

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
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.table-toolbar h3 {
  margin: 0 0 6px;
  font-size: 17px;
  font-weight: 600;
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
