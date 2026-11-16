<template>
  <el-dialog
    v-model="visible"
    title="Добавить пользователя в NetBird"
    width="500px"
    :close-on-click-modal="true"
    :close-on-press-escape="!loading"
    :show-close="!loading"
    @open="onOpen"
    @close="resetForm"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="140px"
      label-position="left"
    >
      <el-form-item label="ФИО" prop="fio">
        <el-input
          v-model="form.fio"
          placeholder="Иванов Иван Иванович"
          :disabled="loading"
          clearable
        />
      </el-form-item>

      <el-form-item label="Email" prop="email">
        <el-input
          v-model="form.email"
          placeholder="ivanov@energy-team.club"
          :disabled="loading"
          clearable
        />
      </el-form-item>

      <el-form-item label="Группы NetBird" prop="groups">
        <el-select
          v-model="form.groups"
          multiple
          filterable
          collapse-tags
          :loading="groupsLoading"
          :disabled="loading"
          placeholder="Группы в впн"
          style="width: 100%"
        >
          <el-option
            v-for="g in groups"
            :key="g.id"
            :label="g.peers_count ? `${g.name} (${g.peers_count})` : g.name"
            :value="g.id"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="Действие">
        <el-radio-group v-model="form.mode" :disabled="loading">
          <el-radio value="invite">Пригласить</el-radio>
          <el-radio value="create">Создать</el-radio>
        </el-radio-group>
        <span class="form-hint">
          «Пригласить» — отправляет инвайт (пользователь появится после
          принятия). «Создать» — заводит пользователя в NetBird сразу.
          Пароль не нужен: вход в NetBird — через IdP / приглашение.
        </span>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button
        :disabled="loading"
        @click="visible = false"
      >
        Отмена
      </el-button>

      <el-button
        type="primary"
        :loading="loading"
        @click="submitForm"
      >
        {{ form.mode === 'invite' ? 'Пригласить' : 'Создать' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { addUser, getStoredGroups } from '@/api/Vpn/users.js'


const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue', 'created'])

const visible = ref(props.modelValue)
const loading = ref(false)
const formRef = ref(null)

const groups = ref([])
const groupsLoading = ref(false)

const form = ref({
  fio: '',
  email: '',
  groups: [],
  mode: 'create',
})

const rules = {
  fio: [
    { required: true, message: 'Укажите ФИО', trigger: 'blur' },
    { min: 3, message: 'Минимум 3 символа', trigger: 'blur' },
  ],
  email: [
    { required: true, message: 'Укажите email', trigger: 'blur' },
    { type: 'email', message: 'Некорректный email', trigger: 'blur' },
  ],
}

watch(
  () => props.modelValue,
  (newVal) => {
    visible.value = newVal
  }
)

watch(visible, (newVal) => {
  emit('update:modelValue', newVal)
})

async function onOpen() {
  if (groups.value.length) return

  groupsLoading.value = true

  try {
    const result = await getStoredGroups()
    groups.value = Array.isArray(result) ? result : result?.groups || []
  } catch (error) {
    ElMessage.error(
      error instanceof Error ? error.message : 'Не удалось загрузить группы'
    )
  } finally {
    groupsLoading.value = false
  }
}

function resetForm() {
  formRef.value?.resetFields()
  form.value = {
    fio: '',
    email: '',
    groups: [],
    mode: 'create',
  }
}

async function submitForm() {
  if (!formRef.value) return

  try {
    await formRef.value.validate()
  } catch {
    return
  }

  loading.value = true

  try {
    const email = form.value.email.toLowerCase().trim()
    const name = form.value.fio.trim()

    const result = await addUser({
      email,
      name,
      role: 'user',
      autoGroups: form.value.groups,
      mode: form.value.mode,
    })

    ElMessage.success(
      form.value.mode === 'invite'
        ? `Приглашение для «${email}» отправлено`
        : `Пользователь «${email}» создан`
    )

    visible.value = false
    emit('created', result)
  } catch (error) {
    ElMessage.error(
      error instanceof Error
        ? error.message
        : 'Не удалось создать пользователя'
    )
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.form-hint {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}
</style>
