
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
        <el-tab-pane
          v-if="canSeeMembers"
          label="Все Пользователи"
          name="AllUsr"
        />
        <el-tab-pane label="Яндекс" name="Yandex" />
        <el-tab-pane label="Рег" name="Reg" />
        <el-tab-pane label="CloudContact" name="CloudContact" />
        <el-tab-pane label="ВПН" name="Vpn" />
      </el-tabs>

      <div class="tab-content">
        <AllUsr v-if="canSeeMembers && activeName === 'AllUsr'" />
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
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Plus } from '@element-plus/icons-vue'
import YandexWindow from '@/components/Yandex/YandexWindow.vue'
import RegWindow from '@/components/REG/RegWindow.vue'
import CloudContactWindow from '@/components/CloudContact/CloudContactWindow.vue'
import VpnWindow from '@/components/Vpn/OpenVpnWindow.vue'
import AllUsr from "@/components/Globalusers/AllUsrs.vue";
import { getMe } from '@/api/Globalusers/users.js'

// Вкладку «Все Пользователи» (реестр с паролями) видят только логины
// из MEMBERS_ALLOWED_USERS — решает бэкенд через /api/me.
const canSeeMembers = ref(false)
// Пока не знаем права — начинаем с Яндекса; при наличии доступа переключим.
const activeName = ref('Yandex')
const showGlAddDialog = ref(false)
const error = ref('')

onMounted(async () => {
  try {
    const me = await getMe()

    canSeeMembers.value = !!me?.canSeeMembers

    if (canSeeMembers.value) {
      activeName.value = 'AllUsr'
    }
  } catch {
    canSeeMembers.value = false
  }
})

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
