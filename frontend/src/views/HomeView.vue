<template>
  <main class="page">
    <el-card class="panel">
      <template #header>
        <div class="card-header">
          <strong>Service ACC</strong>
          <el-tag type="success">Vue работает</el-tag>
        </div>
      </template>

      <h1>Панель управления</h1>

      <p>Vue-приложение успешно загружено.</p>

      <el-button type="primary" @click="showMessage">
        Проверить интерфейс
      </el-button>

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
import { ref } from "vue";

const checked = ref(false);

function showMessage() {
  checked.value = true;
}
</script>

<style scoped>
.page {
  padding: 32px;
  background: #f5f7fa;
}

.panel {
  max-width: 800px;
  margin: 0 auto;
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