
<template>
    <el-card class="panel">
      <template #CloudHeader>
        <div class="card-header-cloud">
          <strong>Реестр управления УЗ</strong>
        </div>
      </template>

      <div class="tabs-row">
        <el-tabs v-model="activeName" class="tabs">
          <el-tab-pane label="CloudContact" name="CloudContact" />
          <el-tab-pane label="CloudContactMsp" name="CloudContactMsp" />
          <el-tab-pane label="CloudContactBack" name="CloudContactBack" />
        </el-tabs>

        <el-button @click="addUsrCloudContact">
          <el-icon><Plus /></el-icon>
        </el-button>
      </div>

      <div class="tab-content">
        <CloudContactWindow
          v-if="activeName === 'CloudContact'"
          :key="reloadKey"
        />
        <CloudContactWindowMsp
          v-else-if="activeName === 'CloudContactMsp'"
          :key="reloadKey"
        />
        <CloudContactWindowBack
          v-else-if="activeName === 'CloudContactBack'"
          :key="reloadKey"
        />
      </div>
    </el-card>

    <CloudContactAdd v-model="showAddDialog" @created="onCreated" />
</template>

<script setup>
import { ref } from 'vue'
// import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'

import CloudContactWindow from '@/components/CloudContact/Osn/CloudContact.vue'
import CloudContactWindowMsp from '@/components/CloudContact/Msp/CloudContactMsp.vue'
import CloudContactWindowBack from '@/components/CloudContact/Back/CloudContactBack.vue'
import CloudContactAdd  from "@/components/CloudContact/components/CloudContactAdd.vue";

const showAddDialog = ref(false)
const activeName = ref('CloudContact')
const reloadKey = ref(0)
// const error = ref('')


function addUsrCloudContact() {
  showAddDialog.value = true
}

// После создания пользователя — перемонтируем активную таблицу (обновит список).
function onCreated() {
  reloadKey.value++
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

.tabs-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.tab-content {
  min-height: 300px;
}
</style>
