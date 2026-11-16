
<template>
    <el-card class="panel">
      <template #header>
        <div class="card-header-cloud">
          <strong>Реестр управления ВПН</strong>
        </div>
      </template>

      <div class="tabs-row">
        <el-tabs v-model="activeName" class="tabs">
          <el-tab-pane label="Пользователи" name="VpnUsrs" />
          <el-tab-pane label="Приглашенные" name="VpnUsrsIvite" />
        </el-tabs>

        <el-button @click="addUsrVpn">
          <el-icon><Plus /></el-icon>
        </el-button>
      </div>

      <div class="tab-content">
        <VpnTable v-if="activeName === 'VpnUsrs'" ref="usersTable" />
        <VpnTableinv v-else-if="activeName === 'VpnUsrsIvite'" ref="inviteTable" />
      </div>

      <VpnAdd v-model="showAddDialog" @created="onCreated" />
    </el-card>
</template>

<script setup>
import { ref } from 'vue'
import VpnTable from './components/users/Table.vue'
import VpnTableinv from './components/inviteusers/Table.vue'
import VpnAdd from './components/users/addusr.vue'
import { Plus } from '@element-plus/icons-vue'

const activeName = ref('VpnUsrs')
const showAddDialog = ref(false)
const usersTable = ref(null)
const inviteTable = ref(null)

function addUsrVpn() {
  showAddDialog.value = true
}

// После создания/приглашения обновляем активную таблицу.
function onCreated() {
  usersTable.value?.load?.()
  inviteTable.value?.load?.()
}
</script>

<style scoped>
.tabs-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
</style>
