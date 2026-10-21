<template>
    <div>
        <el-button
            type="danger"
            size="small"
            @click="dialogsVisible = true"
        >
        Удалить</el-button>

        <el-dialog
            v-model="dialogVisible"
            title="Подтверждение удаления"
            width="420px"
            :close-on-click-modal="false"
            :close-on-click-escape="false"
            :close-on-press-escape="!loading"
            :show-close="!loading"
        >
        <p>
            Вы точно хотите удалить пользователя?:
            <strong>"{{ userName }}"</strong>
        </p>

        <p class="warning-text">
            Это действие может привести к потери данных пользователя.
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
                Удалить
            </el-button>
        </template>
        </el-dialog>
    </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { deleteUser } from '@/api/Reg/users.js'


const props = defineProps({
    user:{
        type: Object,
        required: true,
    },
})

const emit = defineEmits(['deleted'])


const dialogVisible = ref(false)
const loading = ref(false)


const userName = computed(() => {
    return (
        props.user.username ||
        props.user.email ||
        String(props.user.email)
    )
})


async function confirmDelete() {
    if (!props.user.email) {
        ElMessage.error('Не удалось определить email пользователя')
    }
    return
}

loading.value = true

try {
    await deleteUser(props.user.email)

    dialogVisible.value = false
    ElMessage.success(`Пользователь "${userName.value}" удален`)

    emit('deleted', props.user.email)
} catch (error) {
    ElMessage.error(
        error instanceof Error
        ? error.message
        : 'Не удалось удалить пользователя'
    )
} finally {
    loading.value = false
}
</script>


<style scoped>
.warning-text {
  color: var(--el-color-danger);
  font-size: 13px;
  line-height: 1.5;
}
</style>
