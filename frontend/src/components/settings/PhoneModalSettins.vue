<template>
  <el-dialog
    v-model="visible"
    title="Номерной план телефонии"
    width="600px"
    align-center
    append-to-body
    :close-on-click-modal="true"
    class="phone-plan-dialog"
  >
    <div class="phone-plan-body">
      <el-empty description="Номерной план пока не настроен" />
    </div>

    <template #footer>
      <el-button @click="visible = false">Отмена</el-button>
      <el-button type="primary" @click="onSave">Сохранить</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'save'])

const visible = ref(props.modelValue)

watch(
  () => props.modelValue,
  (v) => {
    visible.value = v
  },
)

watch(visible, (v) => emit('update:modelValue', v))

function onSave() {
  // TODO: сохранить номерной план
  emit('save')
  visible.value = false
}
</script>

<style scoped>
.phone-plan-body {
  min-height: 120px;
}
</style>
