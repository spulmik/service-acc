<template>
  <el-dialog
    v-model="visible"
    title="Добавить пользователя"
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
      <el-form-item label="Домен" prop="domain">
        <el-select
          v-model="form.domain"
          :disabled="loading"
          placeholder="Выберите домен"
          style="width: 100%"
        >
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

      <el-form-item label="Никнейм" prop="nickname">
        <el-input
          v-model="form.nickname"
          placeholder="ivanov"
          :disabled="loading"
          clearable
        >
          <template #append>@{{ form.domain }}</template>
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

      <!-- Доп. поля нужны только для Яндекс 360. -->
      <template v-if="isYandex">
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
      </template>
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
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { createUser as createRegUser } from '@/api/Reg/users.js'
import { createUser as createYandexUser } from '@/api/Yandex/users.js'

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
  domain: 'energy-team.club',
  nickname: '',
  password: '',
  firstName: '',
  lastName: '',
  middleName: '',
  position: '',
})

// Яндекс 360 живёт на energy-team.ru, Reg.ru — на energy-team.club.
const isYandex = computed(() => form.value.domain === 'energy-team.ru')

// Правила реактивные: имя и фамилия обязательны только для Яндекса.
const rules = computed(() => ({
  domain: [
    { required: true, message: 'Выберите домен', trigger: 'change' },
  ],
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
    { min: 8, message: 'Минимум 8 символов', trigger: 'blur' },
  ],
  ...(isYandex.value
    ? {
        firstName: [
          { required: true, message: 'Укажите имя', trigger: 'blur' },
        ],
        lastName: [
          { required: true, message: 'Укажите фамилию', trigger: 'blur' },
        ],
      }
    : {}),
}))

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
    domain: 'energy-team.club',
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

  const nickname = form.value.nickname.toLowerCase().trim()
  const email = `${nickname}@${form.value.domain}`

  try {
    let result

    if (isYandex.value) {
      result = await createYandexUser({
        departmentId: 1,
        nickname,
        password: form.value.password,
        name: {
          first: form.value.firstName.trim(),
          last: form.value.lastName.trim(),
          ...(form.value.middleName && {
            middle: form.value.middleName.trim(),
          }),
        },
        ...(form.value.position && {
          position: form.value.position.trim(),
        }),
      })
    } else {
      result = await createRegUser({
        nickname,
        password: form.value.password,
        domain: form.value.domain,
      })
    }

    ElMessage.success(`Пользователь «${email}» создан`)

    visible.value = false
    emit('created', { domain: form.value.domain, user: result?.user })
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
