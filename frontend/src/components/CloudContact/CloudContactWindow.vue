
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
        <CloudContactWindow v-if="activeName === 'CloudContact'" />
        <CloudContactWindowMsp v-else-if="activeName === 'CloudContactMsp'" />
        <CloudContactWindowBack v-else-if="activeName === 'CloudContactBack'" />
      </div>
    </el-card>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Plus } from '@element-plus/icons-vue'

import CloudContactWindow from '@/components/CloudContact/Osn/CloudContact.vue'
import CloudContactWindowMsp from '@/components/CloudContact/Msp/CloudContactMsp.vue'
import CloudContactWindowBack from '@/components/CloudContact/Back/CloudContactBack.vue'


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
