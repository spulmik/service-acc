
<template>
  <div>
    <el-button
      type="danger"
      size="small"
      @click="dialogVisible = true"
    >
      Удалить
    </el-button>

    <el-dialog
      v-model="dialogVisible"
      title="Подтверждение удаления"
      width="420px"
      :close-on-click-modal="false"
      :close-on-press-escape="!loading"
      :show-close="!loading"
    >
      <p>
        Вы точно хотите удалить пользователя
        <strong>«{{ userName }}»</strong>?
      </p>

      <p class="warning-text">
        Это действие может привести к потере данных пользователя
        и не всегда может быть отменено.
      </p>

      <template #footer>
        <el-button
          :disabled="loading"
          @click="dialogVisible = false"
        >
          Отмена
        </el-button>

        <el-button
          type="danger"
          :loading="loading"
          @click="confirmDelete"
        >
          Да, удалить
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { deleteUser } from '@/api/Yandex/users.js'

const props = defineProps({
  user: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['deleted'])

const dialogVisible = ref(false)
const loading = ref(false)

const userName = computed(() => {
  return (
    props.user.fio ||
    props.user.email ||
    props.user.nickname ||
    String(props.user.id)
  )
})

async function confirmDelete() {
  if (!props.user.id) {
    ElMessage.error('Не удалось определить ID пользователя')
    return
  }

  loading.value = true

  try {
    await deleteUser(props.user.id)

    dialogVisible.value = false
    ElMessage.success(`Пользователь «${userName.value}» удалён`)

    emit('deleted', props.user.id)
  } catch (error) {
    ElMessage.error(
      error instanceof Error
        ? error.message
        : 'Не удалось удалить пользователя'
    )
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.warning-text {
  color: var(--el-color-danger);
  font-size: 13px;
  line-height: 1.5;
}
</style>
