
<template>
  <main class="page">
    <el-card class="panel">
      <template #header>
        <div class="card-header">
          <strong>Реестр управления УЗ</strong>
          <el-button
          v-model="showGlAddDialog"
          @click="GlobalAddUser"
          icon=""
          ><el-icon><Plus /></el-icon>

          </el-button>
        </div>
      </template>

      <el-tabs v-model="activeName" class="tabs">
        <el-tab-pane label="Все Пользователи" name="AllUsr" />
        <el-tab-pane label="Яндекс" name="Yandex" />
        <el-tab-pane label="Рег" name="Reg" />
        <el-tab-pane label="CloudContact" name="CloudContact" />
        <el-tab-pane label="ВПН" name="Vpn" />
      </el-tabs>

      <div class="tab-content">
        <AllUsr v-if="activeName === 'AllUsr'" />
        <YandexWindow v-if="activeName === 'Yandex'" />
        <RegWindow v-else-if="activeName === 'Reg'" />
        <CloudContactWindow
          v-else-if="activeName === 'CloudContact'"
        />
        <VpnWindow v-else-if="activeName === 'Vpn'" />
      </div>
    </el-card>
  </main>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Plus } from '@element-plus/icons-vue'
import YandexWindow from '@/components/Yandex/YandexWindow.vue'
import RegWindow from '@/components/REG/RegWindow.vue'
import CloudContactWindow from '@/components/CloudContact/CloudContactWindow.vue'
import VpnWindow from '@/components/Vpn/OpenVpnWindow.vue'

const activeName = ref('AllUsr')
const showGlAddDialog = ref(false)
const error = ref('')

function GlobalAddUser() {
  ElMessage.info('Добавление пока не реализовано')
  // showGlAddDialog.value = true
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
