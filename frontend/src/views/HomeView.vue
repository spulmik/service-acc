<template>
  <main class="page">
    <el-card class="panel">
      <template #header>
        <div class="card-header">
          <strong>Реестр управления УЗ</strong>
        </div>
        <el-tabs v-model="activeName" class="tabs" @tab-click="handleClick">
          <el-tab-pane></el-tab-pane>
          <el-tab-pane label="Яндекс" name="Yandex">YandexWindow</el-tab-pane>
          <el-tab-pane label="Рег" name="Reg">RegWindow</el-tab-pane>
          <el-tab-pane label="CloudContact" name="CloudContact">CloudContactWindow</el-tab-pane>
          <el-tab-pane label="ВПН" name="OpenVpn">OpenVpnWindow</el-tab-pane>
        </el-tabs>
      </template>
      

        <style>
        .demo-tabs > .el-tabs__content {
          padding: 32px;
          color: #6b778c;
          font-size: 32px;
          font-weight: 600;
        }
        </style>


      <h1>Панель управления</h1>
<!-- 
      <el-button type="primary" @click="showMessage">
        Проверить интерфейс
      </el-button> -->
      <el-alert
        v-if="checked"
        title="тест">
      </el-alert>

      <el-alert
        v-if="checked"
        title="Vue Router и Element Plus работают"
        type="success"
        show-icon
        :closable="false"
        class="result"
      />
    </el-card>
  </main>
</template>

<script setup>
  import { ref } from 'vue'
  const activeName = ref('tabs')
  const handleClick = (tab, event) => {
    console.log(tab, event)
  }

const checked = ref(false);

function showMessage() {
  checked.value = true;
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
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.result {
  margin-top: 20px;
}
</style>
