<template>
  <el-dialog
    v-model="visible"
    title="Добавить пользователя в CloudContact"
    width="520px"
    :close-on-click-modal="true"
    :close-on-press-escape="!loading"
    :show-close="!loading"
    @close="resetForm"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="160px"
      label-position="left"
    >
      <el-form-item label="Тип CloudContact" prop="service">
        <el-radio-group v-model="form.service" :disabled="loading">
          <el-radio value="osn">Основной</el-radio>
          <el-radio value="msp">МСП</el-radio>
          <el-radio value="back">БЭК</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="Группа (team)" prop="team">
        <el-select
          v-model="form.team"
          filterable
          clearable
          :loading="teamsLoading"
          :disabled="!form.service || loading"
          :placeholder="form.service ? 'Выберите команду' : 'Сначала выберите тип'"
          style="width: 100%"
        >
          <el-option v-for="t in teams" :key="t" :label="t" :value="t" />
        </el-select>
      </el-form-item>

      <el-form-item label="Логин" prop="nickname">
        <el-input
          v-model="form.nickname"
          placeholder="ivanov"
          :disabled="loading"
          clearable
        />
      </el-form-item>

      <el-form-item label="Пароль" prop="password">
        <el-input
          v-model="form.password"
          type="password"
          placeholder="Минимум 8 символов"
          :disabled="loading"
          show-password
          clearable
        >
          <template #suffix>
            <el-icon
              class="pwd-wand"
              title="Сгенерировать пароль"
              @click="genPassword"
            >
              <MagicStick />
            </el-icon>
          </template>
        </el-input>
      </el-form-item>

      <el-form-item label="Должность" prop="position">
        <el-input
          v-model="form.position"
          placeholder="Менеджер (опционально)"
          :disabled="loading"
          clearable
        />
      </el-form-item>

      <el-form-item label="Внутренний номер" prop="into_phone">
        <el-input
          v-model="form.into_phone"
          readonly
          :placeholder="
            form.team ? 'Подбирается автоматически…' : 'Сначала выберите команду'
          "
        >
          <template #suffix>
            <el-icon v-if="numberLoading" class="is-loading"><Loading /></el-icon>
          </template>
        </el-input>
        <span class="form-hint">
          Выбирается первый свободный номер из диапазона группы.
        </span>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button :disabled="loading" @click="visible = false">Отмена</el-button>
      <el-button type="primary" :loading="loading" @click="submitForm">
        Создать
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { MagicStick, Loading } from '@element-plus/icons-vue'
import { generatePassword } from '@/api/password.js'
import { getTeams, getFreeNumber } from '@/api/CloudContact/users.js'

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

const teams = ref([])
const teamsLoading = ref(false)
const numberLoading = ref(false)

const form = ref({
  service: '', // osn | msp | back
  team: '',
  nickname: '',
  password: '',
  position: '',
  into_phone: '',
})

const rules = {
  service: [
    { required: true, message: 'Выберите тип', trigger: 'change' },
  ],
  team: [
    { required: true, message: 'Выберите команду', trigger: 'change' },
  ],
  nickname: [
    { required: true, message: 'Укажите логин', trigger: 'blur' },
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
}

watch(
  () => props.modelValue,
  (v) => {
    visible.value = v
  },
)

watch(visible, (v) => emit('update:modelValue', v))

// Смена типа CloudContact → подгружаем команды именно этого сервиса.
watch(
  () => form.value.service,
  async (type) => {
    form.value.team = ''
    teams.value = []

    if (!type) return

    teamsLoading.value = true

    try {
      teams.value = await getTeams(type)
    } catch (error) {
      ElMessage.error(
        error instanceof Error ? error.message : 'Не удалось загрузить команды',
      )
    } finally {
      teamsLoading.value = false
    }
  },
)

// Выбор команды → подбираем первый свободный внутренний номер.
watch(
  () => form.value.team,
  async (team) => {
    form.value.into_phone = ''

    if (!team || !form.value.service) return

    numberLoading.value = true

    try {
      const res = await getFreeNumber(form.value.service, team)
      form.value.into_phone = String(res?.number ?? '')
    } catch (error) {
      ElMessage.warning(
        error instanceof Error ? error.message : 'Не удалось подобрать номер',
      )
    } finally {
      numberLoading.value = false
    }
  },
)

function resetForm() {
  formRef.value?.resetFields()
  form.value = {
    service: '',
    team: '',
    nickname: '',
    password: '',
    position: '',
    into_phone: '',
  }
  teams.value = []
}

async function genPassword() {
  try {
    form.value.password = await generatePassword()
  } catch (error) {
    ElMessage.error(
      error instanceof Error ? error.message : 'Не удалось сгенерировать пароль',
    )
  }
}

async function submitForm() {
  if (!formRef.value) return

  try {
    await formRef.value.validate()
  } catch {
    return
  }

  // TODO: подключить создание пользователя CloudContact (бэкенд).
  ElMessage.success('Форма заполнена (сохранение пока не подключено)')
  visible.value = false
}
</script>

<style scoped>
.pwd-wand {
  cursor: pointer;
  color: var(--el-text-color-secondary);
}

.pwd-wand:hover {
  color: var(--el-color-primary);
}

.form-hint {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}
</style>
