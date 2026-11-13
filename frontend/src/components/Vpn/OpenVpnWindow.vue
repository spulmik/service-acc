
<template>
    <el-card class="panel">
      <template #VPNheader>
        <div class="card-header-cloud">
          <strong>Реестр управления ВПН</strong>
        </div>
      </template>

      <el-tabs v-model="activeName" class="tabs">
        <el-tab-pane label="Пользователи" name="VpnUsrs" />
        <el-tab-pane label="Приглашенные" name="VpnUsrsIvite" />
      </el-tabs>

      <div class="tab-content">
        <VpnTable v-if="activeName ===  'VpnUsrs'" />
        <VpnTableinv v-else-if="activeName === 'VpnUsrsIvite'" />
      </div>
    </el-card>
</template>
<script setup>
import { ref } from 'vue'
import VpnTable from "./components/users/Table.vue";
import VpnTableinv from './components/inviteusers/Table.vue';

const activeName = ref('VpnUsrs')
// const showGlAddDialog = ref(false)
</script>