<template>
  <el-dialog
    v-model="visible"
    title="Добавить пользователя Яндекс 360"
    width="500px"
    :close-on-click-modal="false"
    :close-on-press-escape="!loading"
    :show-close="!loading"
    @close="resetForm"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="120px"
      label-position="left"
    >
      <el-form-item label="Никнейм" prop="nickname">
        <el-input
          v-model="form.nickname"
          placeholder="ivanov"
          :disabled="loading"
          clearable
        >
          <template #append>@energy-team.ru</template>
        </el-input>
        <span class="form-hint">
          3-30 символов: латиница, цифры, точка, дефис, подчёркивание
        </span>
      </el-form-item>

      <el-form-item label="Пароль" prop="password">
        <el-input
          v-model="form.password"
          type="password"
          placeholder="Минимум 8 символов"
          :disabled="loading"
          show-password
          clearable
        />
      </el-form-item>

      <el-form-item label="Имя" prop="firstName">
        <el-input
          v-model="form.firstName"
          placeholder="Иван"
          :disabled="loading"
          clearable
        />
      </el-form-item>

      <el-form-item label="Фамилия" prop="lastName">
        <el-input
          v-model="form.lastName"
          placeholder="Иванов"
          :disabled="loading"
          clearable
        />
      </el-form-item>

      <el-form-item label="Отчество" prop="middleName">
        <el-input
          v-model="form.middleName"
          placeholder="Иванович (опционально)"
          :disabled="loading"
          clearable
        />
      </el-form-item>

      <el-form-item label="Должность" prop="position">
        <el-input
          v-model="form.position"
          placeholder="Менеджер (опционально)"
          :disabled="loading"
          clearable
        />
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
        Создать
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { createUser } from '@/api/Yandex/users.js'

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

const form = ref({
  nickname: '',
  password: '',
  firstName: '',
  lastName: '',
  middleName: '',
  position: '',
})

const rules = {
  nickname: [
    { required: true, message: 'Укажите никнейм', trigger: 'blur' },
    {
      pattern: /^[a-z0-9._-]{3,30}$/,
      message: '3-30 символов: латиница, цифры, . - _',
      trigger: 'blur',
    },
  ],
  password: [
    { required: true, message: 'Укажите пароль', trigger: 'blur' },
    {
      min: 8,
      message: 'Минимум 8 символов',
      trigger: 'blur',
    },
  ],
  firstName: [
    { required: true, message: 'Укажите имя', trigger: 'blur' },
  ],
  lastName: [
    { required: true, message: 'Укажите фамилию', trigger: 'blur' },
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

function resetForm() {
  formRef.value?.resetFields()
  form.value = {
    nickname: '',
    password: '',
    firstName: '',
    lastName: '',
    middleName: '',
    position: '',
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
    const userData = {
      departmentId: 1,
      nickname: form.value.nickname.toLowerCase().trim(),
      password: form.value.password,
      name: {
        first: form.value.firstName.trim(),
        last: form.value.lastName.trim(),
        ...(form.value.middleName && { middle: form.value.middleName.trim() }),
      },
      ...(form.value.position && { position: form.value.position.trim() }),
    }

    const result = await createUser(userData)

    ElMessage.success(
      `Пользователь «${userData.nickname}@energy-team.ru» создан`
    )

    visible.value = false
    emit('created', result.user)
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

