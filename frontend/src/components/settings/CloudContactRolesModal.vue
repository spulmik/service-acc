<template>
  <el-dialog
    v-model="visible"
    title="Роли CloudContact"
    width="720px"
    align-center
    append-to-body
    :close-on-click-modal="false"
    @open="load"
  >
    <el-alert
      v-if="error"
      :title="error"
      type="error"
      show-icon
      :closable="false"
      class="roles-alert"
    />

    <p class="roles-hint">
      Справочник ролей. Отметьте, в каких сервисах доступна роль — форма
      добавления пользователя покажет роли выбранного сервиса.
    </p>

    <el-table
      v-loading="loading"
      :data="rows"
      stripe
      size="small"
      style="width: 100%"
      empty-text="Ролей пока нет — добавьте первую"
    >
      <el-table-column label="Название роли" min-width="220">
        <template #default="{ row }">
          <el-input v-model="row.name" placeholder="Agent" size="small" />
        </template>
      </el-table-column>

      <el-table-column label="Осн" width="70" align="center">
        <template #default="{ row }"><el-checkbox v-model="row.osn" /></template>
      </el-table-column>
      <el-table-column label="МСП" width="70" align="center">
        <template #default="{ row }"><el-checkbox v-model="row.msp" /></template>
      </el-table-column>
      <el-table-column label="БЭК" width="70" align="center">
        <template #default="{ row }"><el-checkbox v-model="row.back" /></template>
      </el-table-column>

      <el-table-column label="" width="130" align="center">
        <template #default="{ row, $index }">
          <el-button
            text
            type="primary"
            size="small"
            :loading="row._saving"
            @click="saveRow(row)"
          >
            Сохранить
          </el-button>
          <el-button
            text
            type="danger"
            size="small"
            @click="removeRow(row, $index)"
          >
            <el-icon><Delete /></el-icon>
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-button class="add-btn" :icon="Plus" @click="addRow">
      Добавить роль
    </el-button>

    <template #footer>
      <el-button @click="visible = false">Закрыть</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Delete } from '@element-plus/icons-vue'
import {
  getAllRoles,
  createRole,
  updateRole,
  deleteRole,
} from '@/api/CloudContact/roles.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const visible = ref(props.modelValue)
const rows = ref([])
const loading = ref(false)
const error = ref('')

watch(
  () => props.modelValue,
  (v) => {
    visible.value = v
  },
)

watch(visible, (v) => emit('update:modelValue', v))

function blankRow() {
  return { id: null, name: '', osn: false, msp: false, back: false, _saving: false }
}

async function load() {
  loading.value = true
  error.value = ''

  try {
    const result = await getAllRoles()
    rows.value = result.map((r) => ({ ...r, _saving: false }))
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Не удалось загрузить роли'
    ElMessage.error(error.value)
  } finally {
    loading.value = false
  }
}

function addRow() {
  rows.value.push(blankRow())
}

async function saveRow(row) {
  if (!row.name || !row.name.trim()) {
    ElMessage.warning('Укажите название роли')
    return
  }

  row._saving = true

  const payload = {
    name: row.name.trim(),
    osn: row.osn,
    msp: row.msp,
    back: row.back,
  }

  try {
    const saved = row.id
      ? await updateRole(row.id, payload)
      : await createRole(payload)

    if (saved) Object.assign(row, saved, { _saving: false })
    ElMessage.success('Сохранено')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : 'Не удалось сохранить')
  } finally {
    row._saving = false
  }
}

async function removeRow(row, index) {
  if (!row.id) {
    rows.value.splice(index, 1)
    return
  }

  try {
    await deleteRole(row.id)
    rows.value.splice(index, 1)
    ElMessage.success('Удалено')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : 'Не удалось удалить')
  }
}
</script>

<style scoped>
.roles-alert {
  margin-bottom: 12px;
}

.roles-hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}

.add-btn {
  margin-top: 12px;
}
</style>
