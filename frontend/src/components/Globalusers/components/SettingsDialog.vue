<template>
  <el-drawer
    v-model="visible"
    title="Настройки"
    direction="rtl"
    size="440px"
    :before-close="handleClose"
    class="settings-drawer"
  >
    <div class="settings-content">
      <!-- Действие: синхронизация групп NetBird -->
      <div class="settings-row">
        <div class="settings-text">
          <strong>Группы NetBird</strong>
          <p class="settings-hint">
            Записать актуальные группы из NetBird в нашу БД (каталог).
          </p>
        </div>

        <el-button :loading="syncing" @click="syncVpnGroups">
          Синхр. группы VPN
        </el-button>
      </div>

      <el-divider />

      <!-- Форма настроек. Поля — временные, будешь менять под свои настройки. -->
      <el-form :model="form" label-position="top">
        <el-form-item label="Домен по умолчанию">
          <el-select v-model="form.defaultDomain" style="width: 100%">
            <el-option
              label="@energy-team.ru (Яндекс 360)"
              value="energy-team.ru"
            />
            <el-option
              label="@energy-team.club (Reg.ru)"
              value="energy-team.club"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="Действие NetBird по умолчанию">
          <el-radio-group v-model="form.vpnDefaultMode">
            <el-radio value="invite">Пригласить</el-radio>
            <el-radio value="create">Создать</el-radio>
          </el-radio-group>
        </el-form-item>
        <!-- сюда добавляй новые настройки -->
      </el-form>

      <div class="settings-footer">
        <el-button @click="visible = false">Отмена</el-button>
        <el-button type="primary" :loading="saving" @click="onSubmit">
          {{ saving ? 'Сохранение…' : 'Сохранить' }}
        </el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup>
import { reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { syncGroups } from '@/api/Vpn/users.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'submit'])

const visible = ref(props.modelValue)
const syncing = ref(false)
const saving = ref(false)

// Значения формы (пока дефолты из текущего хардкода — заменишь на свои).
const form = reactive({
  defaultDomain: 'energy-team.club',
  vpnDefaultMode: 'invite',
})

watch(
  () => props.modelValue,
  (v) => {
    visible.value = v
  },
)

watch(visible, (v) => emit('update:modelValue', v))

// Не закрываем drawer во время сохранения.
function handleClose(done) {
  if (saving.value) return
  done()
}

// Сохранение настроек. Пока заглушка — позже подключим запись в БД.
async function onSubmit() {
  saving.value = true

  try {
    // TODO: отправить { ...form } на бэкенд (сохранение в БД).
    emit('submit', { ...form })

    ElMessage.success('Настройки сохранены')
    visible.value = false
  } finally {
    saving.value = false
  }
}

// Записать группы NetBird в нашу БД (каталог vpn_groups).
async function syncVpnGroups() {
  syncing.value = true

  try {
    const result = await syncGroups()
    const count = result?.total ?? result?.groups?.length ?? 0

    ElMessage.success(`Группы VPN синхронизированы: ${count}`)
  } catch (err) {
    ElMessage.error(
      err instanceof Error ? err.message : 'Не удалось синхронизировать группы',
    )
  } finally {
    syncing.value = false
  }
}
</script>

<style scoped>
.settings-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.settings-text {
  flex: 1;
}

.settings-hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}

/* Кнопки прижимаем к низу drawer. */
.settings-footer {
  margin-top: auto;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 16px;
}
</style>
