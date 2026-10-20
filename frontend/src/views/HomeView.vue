
<template>
  <main class="page">
    <el-card class="panel">
      <template #header>
        <div class="card-header">
          <strong>Реестр управления УЗ</strong>
        </div>
      </template>

      <el-tabs v-model="activeName" class="tabs">
        <el-tab-pane label="Яндекс" name="Yandex" />
        <el-tab-pane label="Рег" name="Reg" />
        <el-tab-pane label="CloudContact" name="CloudContact" />
        <el-tab-pane label="ВПН" name="OpenVpn" />
      </el-tabs>

      <div class="tab-content">
        <YandexWindow v-if="activeName === 'Yandex'" />
        <RegWindow v-else-if="activeName === 'Reg'" />
        <CloudContactWindow
          v-else-if="activeName === 'CloudContact'"
        />
        <OpenVpnWindow v-else-if="activeName === 'OpenVpn'" />
      </div>
    </el-card>
  </main>
</template>

<script setup>
import { ref } from 'vue'

import YandexWindow from '@/components/Yandex/YandexWindow.vue'
import RegWindow from '@/components/REG/RegWindow.vue'
import CloudContactWindow from '@/components/CloudContactWindow.vue'
import OpenVpnWindow from '@/components/OpenVpnWindow.vue'

const activeName = ref('Yandex')
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
