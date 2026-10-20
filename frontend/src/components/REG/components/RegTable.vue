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
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import { getMailboxes } from '@/api/Reg/users.js'

const search = ref('')
const tableData = ref([])
const loading = ref(false)
const error = ref('')
const selectedDomain = ref('energy-team.club')
const currentPage = ref(1)
const pageSize = ref(20)

const filterTableData = computed(() => {
  const query = search.value.toLowerCase().trim()

  if (!query) {
    return tableData.value
  }

  return tableData.value.filter((item) =>
    item.email.toLowerCase().includes(query) ||
    item.username.toLowerCase().includes(query)
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
