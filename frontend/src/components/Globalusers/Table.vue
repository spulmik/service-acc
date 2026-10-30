<template>
    <section class="gl-table">
        <div class="table-toolbar">
            <div>
                <h3>{{ title }}</h3>
                <span class="users-count">Всего: {{ filterTableData.lenght }}</span>
            </div>

            <el-input
            v-model="search"
            clearable
            placeholder="Поиск"
            :prefix-icon="Search"
            />

           <el-button
           :loading="loading"
           @click="load(true)"
           >Обновить список</el-button> 
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
        :data="pageTableData"
        stripe
        style="width: 100%;"
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
<script>
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Search } from '@element-plus/icons-vue'

const search = ref('')
const tableData = ref([])
const loading = ref(false)
const error = ref('')
const currentPage = ref(1)
const pageSize = ref(20)
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