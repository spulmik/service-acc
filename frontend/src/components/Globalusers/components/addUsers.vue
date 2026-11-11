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

      <!-- Другие сервисы: в каких ещё системах завести пользователя -->
      <el-form-item label="Сервисы">
        <el-checkbox-group v-model="form.services" :disabled="loading">
          <el-checkbox value="cloudcontact">CloudContact</el-checkbox>
          <el-checkbox value="vpn">NetBird</el-checkbox>
        </el-checkbox-group>
      </el-form-item>

      <!-- Поля появляются при выборе соответствующей галочки. -->
      <el-form-item v-if="isCloud" label="CloudContact" prop="cloudcontact">
        <el-input
          v-model="form.cloudcontact"
          placeholder="Логин в CloudContact"
          :disabled="loading"
          clearable
        />
      </el-form-item>

      <el-form-item v-if="isVpn" label="Группы NetBird" prop="vpn">
        <el-select
          v-model="form.vpn"
          multiple
          filterable
          collapse-tags
          :loading="vpnGroupsLoading"
          :disabled="loading"
          placeholder="Группы в впн"
          style="width: 100%"
        >
          <el-option
            v-for="g in vpnGroups"
            :key="g.id"
            :label="g.peers_count ? `${g.name} (${g.peers_count})` : g.name"
            :value="g.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item v-if="isVpn" label="Действие NetBird">
        <el-radio-group v-model="form.vpnMode" :disabled="loading">
          <el-radio value="invite">Пригласить</el-radio>
          <el-radio value="create">Создать</el-radio>
        </el-radio-group>
        <span class="form-hint">
          «Пригласить» — отправляет инвайт (пользователь появится после
          принятия). «Создать» — заводит пользователя в NetBird сразу.
        </span>
      </el-form-item>
        

      <!-- ФИО/должность: показываем для обоих доменов. -->
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
        
        <el-form-item label="Номер телефона" prop="phone">
          <el-input
            v-model="form.phone"
            placeholder="+7 000 000-00-00"
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
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { MagicStick } from '@element-plus/icons-vue'
import { createUser as createRegUser } from '@/api/Reg/users.js'
import { createUser as createYandexUser } from '@/api/Yandex/users.js'
import { generatePassword } from '@/api/password.js'
import { saveMember } from '@/api/Globalusers/users.js'
import { getStoredGroups, addUser as addVpnUser } from '@/api/Vpn/users.js'

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
  phone: '',
  services: [],
  cloudcontact: '',
  vpn: [],
  vpnMode: 'invite',
})

// Яндекс 360 живёт на energy-team.ru, Reg.ru — на energy-team.club.
const isYandex = computed(() => form.value.domain === 'energy-team.ru')
// services — массив выбранных галочек, поэтому проверяем includes.
const isCloud = computed(() => form.value.services.includes('cloudcontact'))
const isVpn = computed(() => form.value.services.includes('vpn'))

// Доступные группы NetBird — грузим один раз, когда впервые отметили VPN.
const vpnGroups = ref([])
const vpnGroupsLoading = ref(false)

async function loadVpnGroups() {
  if (vpnGroups.value.length || vpnGroupsLoading.value) return

  vpnGroupsLoading.value = true

  try {
    const result = await getStoredGroups()

    vpnGroups.value = Array.isArray(result) ? result : result?.groups || []
  } catch (error) {
    ElMessage.error(
      error instanceof Error ? error.message : 'Не удалось загрузить группы NetBird'
    )
  } finally {
    vpnGroupsLoading.value = false
  }
}

watch(isVpn, (on) => {
  if (on) loadVpnGroups()
})

// Поля ФИО показываем для обоих доменов, но обязательны (required)
// имя и фамилия только для Яндекса — для Reg.ru они необязательны.
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

// При смене домена правила required меняются — убираем возможную
// старую ошибку валидации с имени/фамилии (для Reg.ru они необязательны).
watch(
  () => form.value.domain,
  () => {
    formRef.value?.clearValidate(['firstName', 'lastName'])
  }
)

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
    phone: '',
    services: [],
    cloudcontact: '',
    vpn: [],
    vpnMode: 'invite',
  }
}

async function genPassword() {
  try {
    form.value.password = await generatePassword()
  } catch (error) {
    ElMessage.error(
      error instanceof Error ? error.message : 'Не удалось сгенерировать пароль'
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

    // Сохраняем все поля формы в реестр (members). УЗ уже создана,
    // поэтому ошибку реестра показываем предупреждением, а не как провал.
    const fio =
      [form.value.lastName, form.value.firstName, form.value.middleName]
        .map((s) => s.trim())
        .filter(Boolean)
        .join(' ') || nickname

    // В реестр пишем имена групп (в form.vpn лежат ID — переводим их в имена).
    const vpnGroupNames = isVpn.value
      ? form.value.vpn
          .map((id) => vpnGroups.value.find((g) => g.id === id)?.name || id)
          .join(', ')
      : ''

    // NetBird: почта уже создана выше — теперь создаём/приглашаем в NetBird.
    // Режим выбирается радио: invite (обычный, с письмом) / create (сервисный).
    // auto_groups — ID групп. Внешняя ошибка не рушит создание УЗ.
    if (isVpn.value) {
      const isInvite = form.value.vpnMode === 'invite'

      try {
        await addVpnUser({
          email,
          name: fio,
          role: 'user',
          autoGroups: form.value.vpn,
          mode: form.value.vpnMode,
        })
      } catch (vpnError) {
        ElMessage.warning(
          `NetBird: ${isInvite ? 'приглашение' : 'создание'} не выполнено — ${
            vpnError instanceof Error ? vpnError.message : 'ошибка'
          }`,
        )
      }
    }

    try {
      await saveMember({
        fio,
        username: nickname,
        email,
        password: form.value.password,
        phone: form.value.phone.trim(),
        position: form.value.position.trim(),
        yandex: isYandex.value ? email : '',
        reg: isYandex.value ? '' : email,
        cloudcontact: isCloud.value ? form.value.cloudcontact.trim() : '',
        vpngroups: vpnGroupNames,
      })
    } catch (saveError) {
      ElMessage.warning(
        `Пользователь создан, но не сохранён в реестр: ${
          saveError instanceof Error ? saveError.message : 'ошибка'
        }`,
      )
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
