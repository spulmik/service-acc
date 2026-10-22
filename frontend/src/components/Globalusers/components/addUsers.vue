<script setup lang="ts">
import { rules } from 'eslint-config-prettier';

</script>

<template>
    <el-dialog
     v-model="visible"
     title="Добавление пользователя"
     width="500px"
     :close-on-click-modal="false"
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
            </el-input>
        </el-form-item>

        <el-form-item label="Пароль" prop="password">
            <el-input
            v-model="form.password">

            </el-input>

        </el-form-item>
    </el-form>
    </el-dialog>
</template>

<script setup>
    import { ref, watch } from 'vue'
    import { ElMessage } from 'element-plus'
    import { createUser } from '@/api/Globalusers/users.js'

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

</script>