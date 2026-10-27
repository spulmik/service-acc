
<template>
    <el-card class="panel">
      <template #CloudHeader>
        <div class="card-header-cloud">
          <strong>Реестр управления УЗ</strong>
        </div>
      </template>

      <el-tabs v-model="activeName" class="tabs">
        <el-tab-pane label="CloudContact" name="CloudContact" />
        <el-tab-pane label="CloudContactMsp" name="CloudContactMsp" />
        <el-tab-pane label="CloudContactBack" name="CloudContactBack" />
      </el-tabs>

      <div class="tab-content">
        <YandexWindow v-if="activeName === 'CloudContact'" />
        <RegWindow v-else-if="activeName === 'CloudContactMsp'" />
        <div v-else-if="activeName === 'CloudContactBack'">
          CloudContactBack — в разработке
        </div>
      </div>
    </el-card>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Plus } from '@element-plus/icons-vue'
import YandexWindow from '@/components/Yandex/YandexWindow.vue'
import RegWindow from '@/components/REG/RegWindow.vue'

const activeName = ref('CloudContact')
const showGlAddDialog = ref(false)
const error = ref('')

function GlobalAddUser() {
  // ElMessage.info('Добавление пока не реализовано')
  showGlAddDialog.value = true
}

</script>

<style scoped>
.page {
  width: 100%;
  min-height: 100vh;
  padding: clamp(12px, 2vw, 32px);
  background: #f5f7fa;
}

.panel {
  width: 100%;
  max-width: none;
  margin: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.tabs {
  margin-bottom: 20px;
}

.tab-content {
  min-height: 300px;
}
</style>
