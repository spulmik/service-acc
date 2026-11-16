<template>
  <el-dialog
    v-model="visible"
    title="Номерной план телефонии"
    width="960px"
    align-center
    append-to-body
    :close-on-click-modal="false"
    class="phone-plan-dialog"
    @open="load"
  >
    <el-alert
      v-if="error"
      :title="error"
      type="error"
      show-icon
      :closable="false"
      class="plan-alert"
    />

    <el-tabs v-model="activeTab">
      <!-- ───────── Вкладка: таблица (группа → команды → диапазон) ───────── -->
      <el-tab-pane label="Таблица" name="table">
        <div v-loading="loading" class="plan-wrap">
          <div v-for="g in groups" :key="g.id" class="plan-group">
            <div class="plan-group-head">
              <strong>{{ g.name }}</strong>

              <div class="range">
                <span class="range-label">Диапазон №:</span>
                <el-input-number
                  v-model="g.firstNumber"
                  :controls="false"
                  :min="0"
                  size="small"
                  placeholder="первый"
                  style="width: 110px"
                />
                <span class="dash">—</span>
                <el-input-number
                  v-model="g.lastNumber"
                  :controls="false"
                  :min="0"
                  size="small"
                  placeholder="последний"
                  style="width: 110px"
                />
                <el-button
                  text
                  type="primary"
                  size="small"
                  :loading="g._saving"
                  @click="saveGroupRange(g)"
                >
                  Сохранить
                </el-button>
              </div>
            </div>

            <div class="plan-teams">
              <div
                v-for="t in teamsOfGroup(g.name)"
                :key="t.id"
                class="plan-team"
              >
                <span class="team-name">{{ t.team }}</span>
                <span class="team-flags">
                  <el-checkbox :model-value="t.osn" disabled label="Osn" />
                  <el-checkbox :model-value="t.msp" disabled label="Msp" />
                  <el-checkbox :model-value="t.back" disabled label="Back" />
                </span>
              </div>

              <span v-if="!teamsOfGroup(g.name).length" class="muted">
                Нет команд — перетащите их на вкладке «Группы».
              </span>
            </div>
          </div>

          <el-empty
            v-if="!groups.length && !loading"
            description="Групп пока нет — создайте на вкладке «Группы»"
          />
        </div>
      </el-tab-pane>

      <!-- ───────── Вкладка: группы (drag-and-drop) ───────── -->
      <el-tab-pane label="Группы" name="groups">
        <div class="groups-toolbar">
          <el-button type="primary" :icon="Plus" @click="onCreateGroup">
            Создать группу
          </el-button>
          <el-button :icon="showPools ? Minus : Plus" @click="togglePools">
            Команды
          </el-button>
        </div>

        <!-- 3 миниокна с командами по тенантам -->
        <div v-if="showPools" v-loading="teamsLoading" class="pools">
          <div v-for="pool in POOLS" :key="pool.type" class="pool">
            <div class="pool-head">{{ pool.label }}</div>
            <div class="pool-body">
              <span
                v-for="team in teamsByTenant[pool.type]"
                :key="pool.type + ':' + team"
                class="chip"
                :class="{ 'is-assigned': assignedSet.has(team) }"
                draggable="true"
                @dragstart="onDragStart(team, pool.type, $event)"
              >
                {{ team }}
              </span>
              <span v-if="!teamsByTenant[pool.type].length" class="muted">
                нет команд
              </span>
            </div>
          </div>
        </div>

        <el-divider />

        <!-- Группы — зоны перетаскивания -->
        <div class="groups">
          <div
            v-for="g in groups"
            :key="g.id"
            class="group-card"
            @dragover.prevent
            @drop="onDropToGroup(g.name, $event)"
          >
            <div class="group-head">
              <strong>{{ g.name }}</strong>
              <el-button
                text
                type="danger"
                size="small"
                @click="onDeleteGroup(g)"
              >
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
            <div class="group-body">
              <span
                v-for="t in teamsOfGroup(g.name)"
                :key="g.name + ':' + t.team"
                class="chip chip-in-group"
                draggable="true"
                @dragstart="onDragStart(t.team, null, $event)"
              >
                {{ t.team }}
              </span>
              <span v-if="!teamsOfGroup(g.name).length" class="muted drop-hint">
                перетащите команду сюда
              </span>
            </div>
          </div>

          <span v-if="!groups.length" class="muted">
            Групп пока нет — создайте первую.
          </span>
        </div>

        <!-- Зона «без группы» (отвязать) -->
        <div
          class="unassign-zone"
          @dragover.prevent
          @drop="onDropToGroup(null, $event)"
        >
          Перетащите сюда, чтобы убрать из группы
        </div>
      </el-tab-pane>
    </el-tabs>

    <template #footer>
      <el-button @click="visible = false">Закрыть</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Minus, Delete } from '@element-plus/icons-vue'
import {
  getPlan,
  assignTeam,
  getGroups,
  createGroup,
  updateGroup,
  deleteGroup,
} from '@/api/PhonePlan/plan.js'
import { getTeams } from '@/api/CloudContact/users.js'

const POOLS = [
  { type: 'osn', label: 'CloudContact Osn' },
  { type: 'msp', label: 'CloudContact Msp' },
  { type: 'back', label: 'CloudContact Back' },
]

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const visible = ref(props.modelValue)
const activeTab = ref('table')
const rows = ref([]) // phone_plan: команда + флаги + группа
const groups = ref([]) // phone_groups: имя + диапазон
const loading = ref(false)
const error = ref('')

const showPools = ref(false)
const teamsLoading = ref(false)
const teamsByTenant = reactive({ osn: [], msp: [], back: [] })
const teamsLoaded = ref(false)

// Команда перетаскивания: { team, tenant }.
const dragData = ref(null)

watch(
  () => props.modelValue,
  (v) => {
    visible.value = v
  },
)

watch(visible, (v) => emit('update:modelValue', v))

// Множество уже привязанных команд (для подсветки в пулах).
const assignedSet = computed(
  () => new Set(rows.value.filter((r) => r.group).map((r) => r.team)),
)

function teamsOfGroup(name) {
  return rows.value.filter((r) => (r.group || null) === name)
}

function withSaving(list) {
  return (list || []).map((g) => ({ ...g, _saving: false }))
}

async function load() {
  loading.value = true
  error.value = ''

  try {
    const [planRes, groupsRes] = await Promise.all([getPlan(), getGroups()])

    rows.value = planRes?.rows || []
    groups.value = withSaving(groupsRes)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Не удалось загрузить план'
    ElMessage.error(error.value)
  } finally {
    loading.value = false
  }
}

// --- Вкладка «Таблица»: сохранение диапазона группы ---

async function saveGroupRange(g) {
  if (
    g.firstNumber != null &&
    g.lastNumber != null &&
    Number(g.lastNumber) < Number(g.firstNumber)
  ) {
    ElMessage.warning('Последний номер меньше первого')
    return
  }

  g._saving = true

  try {
    const saved = await updateGroup(g.id, {
      firstNumber: g.firstNumber,
      lastNumber: g.lastNumber,
    })

    if (saved) Object.assign(g, saved, { _saving: false })
    ElMessage.success('Сохранено')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : 'Не удалось сохранить')
  } finally {
    g._saving = false
  }
}

// --- Вкладка «Группы» ---

async function togglePools() {
  showPools.value = !showPools.value

  if (showPools.value && !teamsLoaded.value) {
    await loadTeams()
  }
}

async function loadTeams() {
  teamsLoading.value = true

  try {
    const results = await Promise.allSettled(POOLS.map((p) => getTeams(p.type)))

    POOLS.forEach((p, i) => {
      teamsByTenant[p.type] =
        results[i].status === 'fulfilled' ? results[i].value : []
    })

    teamsLoaded.value = true
  } catch (err) {
    ElMessage.error(
      err instanceof Error ? err.message : 'Не удалось загрузить команды',
    )
  } finally {
    teamsLoading.value = false
  }
}

async function onCreateGroup() {
  try {
    const { value } = await ElMessageBox.prompt('Название группы', 'Новая группа', {
      confirmButtonText: 'Создать',
      cancelButtonText: 'Отмена',
      inputPattern: /\S/,
      inputErrorMessage: 'Введите название',
    })

    await createGroup(value.trim())
    groups.value = withSaving(await getGroups())
    ElMessage.success('Группа создана')
  } catch (err) {
    if (err === 'cancel' || err === 'close') return
    ElMessage.error(err instanceof Error ? err.message : 'Не удалось создать группу')
  }
}

async function onDeleteGroup(g) {
  try {
    await ElMessageBox.confirm(
      `Удалить группу «${g.name}»? Команды из неё будут отвязаны.`,
      'Удаление группы',
      {
        type: 'warning',
        confirmButtonText: 'Удалить',
        cancelButtonText: 'Отмена',
        confirmButtonClass: 'el-button--danger',
      },
    )
  } catch {
    return
  }

  try {
    await deleteGroup(g.id)
    await load()
    ElMessage.success('Группа удалена')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : 'Не удалось удалить группу')
  }
}

function onDragStart(team, tenant, event) {
  dragData.value = { team, tenant }

  if (event?.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', team)
  }
}

async function onDropToGroup(groupName, event) {
  event?.preventDefault()

  const data = dragData.value
  dragData.value = null

  if (!data?.team) return

  try {
    const saved = await assignTeam({
      team: data.team,
      group: groupName,
      tenant: data.tenant || undefined,
    })

    const idx = rows.value.findIndex((r) => r.id === saved.id)
    if (idx >= 0) {
      Object.assign(rows.value[idx], saved)
    } else {
      rows.value.push(saved)
    }
  } catch (err) {
    ElMessage.error(
      err instanceof Error ? err.message : 'Не удалось привязать команду',
    )
  }
}
</script>

<style scoped>
.plan-alert {
  margin-bottom: 12px;
}

.muted {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

/* ── Вкладка «Таблица»: карточки групп ── */
.plan-wrap {
  min-height: 120px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.plan-group {
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  overflow: hidden;
}

.plan-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: var(--el-fill-color-light);
  border-bottom: 1px solid var(--el-border-color);
  flex-wrap: wrap;
}

.range {
  display: flex;
  align-items: center;
  gap: 8px;
}

.range-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.dash {
  color: var(--el-text-color-secondary);
}

.plan-teams {
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.plan-team {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 0;
}

.team-name {
  font-size: 14px;
}

.team-flags {
  display: flex;
  gap: 14px;
}

/* ── Вкладка «Группы» ── */
.groups-toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}

.pools {
  display: flex;
  gap: 12px;
  overflow-x: auto;
}

.pool {
  flex: 1 1 0;
  min-width: 220px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-fill-color-light);
}

.pool-head {
  padding: 8px 12px;
  font-weight: 600;
  font-size: 13px;
  border-bottom: 1px solid var(--el-border-color);
}

.pool-body {
  padding: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 60px;
  max-height: 200px;
  overflow-y: auto;
}

.groups {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.group-card {
  flex: 1 1 220px;
  min-width: 220px;
  border: 1px dashed var(--el-border-color);
  border-radius: 8px;
}

.group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-bottom: 1px solid var(--el-border-color);
}

.group-body {
  padding: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 60px;
}

.chip {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 14px;
  font-size: 12px;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  border: 1px solid var(--el-color-primary-light-7);
  cursor: grab;
  user-select: none;
}

.chip:active {
  cursor: grabbing;
}

.chip.is-assigned {
  opacity: 0.5;
}

.chip-in-group {
  background: var(--el-fill-color);
  color: var(--el-text-color-primary);
  border-color: var(--el-border-color);
}

.drop-hint {
  font-size: 12px;
  font-style: italic;
}

.unassign-zone {
  margin-top: 14px;
  padding: 12px;
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  border: 1px dashed var(--el-border-color);
  border-radius: 8px;
}
</style>
