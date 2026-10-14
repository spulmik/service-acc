<template>
  <!-- Проверяем сессию при открытии приложения -->
  <main v-if="checking" class="auth-page">
    <el-card class="auth-card">
      <el-icon class="loading-icon" :size="28">
        <Loading />
      </el-icon>

      <p>Проверка авторизации...</p>
    </el-card>
  </main>

  <!-- Форма входа -->
  <main v-else-if="!authenticated" class="auth-page">
    <el-card class="auth-card">
      <div class="auth-heading">
        <h1>Управленческий учет</h1>
        <p>Войдите в систему для продолжения</p>
      </div>

          <el-form
            label-position="top"
            @submit.prevent="login"
          >
        <el-form-item label="Логин">
          <el-input
            v-model="username"
            placeholder="Введите логин"
            autocomplete="username"
            :disabled="loading"
            clearable
          />
        </el-form-item>

        <el-form-item label="Пароль">
          <el-input
            v-model="password"
            type="password"
            placeholder="Введите пароль"
            autocomplete="current-password"
            show-password
            :disabled="loading"
            @keyup.enter="login"
          />
        </el-form-item>

        <el-alert
          v-if="error"
          :title="error"
          type="error"
          show-icon
          :closable="false"
          class="form-error"
        />

        <el-button
          type="primary"
          :loading="loading"
          :disabled="!username.trim() || !password"
          class="login-button"
          @click="login"
        >
          Войти
        </el-button>
      </el-form>
    </el-card>
  </main>

  <!-- Основное приложение доступно после авторизации -->
  <div v-else class="app-shell">
    <header class="app-topbar">
      <strong>Управленческий учет</strong>

      <div class="user-controls">
        <span class="username">{{ currentUser }}</span>

        <el-button
          plain
          :loading="loggingOut"
          @click="logout"
        >
          Выйти
        </el-button>
      </div>
    </header>

    <el-alert
      v-if="error"
      :title="error"
      type="error"
      show-icon
      :closable="false"
      class="global-error"
    />

    <router-view />
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { Loading } from "@element-plus/icons-vue";

const checking = ref(true);
const authenticated = ref(false);

const username = ref("");
const password = ref("");
const currentUser = ref("");

const loading = ref(false);
const loggingOut = ref(false);
const error = ref("");

async function checkSession() {
  error.value = "";

  try {
    const response = await fetch("/auth/me", {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      credentials: "same-origin",
    });

    if (response.status === 401) {
      authenticated.value = false;
      return;
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      error.value =
        data.error || "Не удалось проверить авторизацию";
      return;
    }

    authenticated.value = data.authenticated === true;
    currentUser.value = data.username || "";
  } catch {
    error.value = "Не удалось связаться с сервером";
  } finally {
    checking.value = false;
  }
}

async function login() {
  if (loading.value) {
    return;
  }

  const loginName = username.value.trim();

  if (!loginName || !password.value) {
    error.value = "Введите логин и пароль";
    return;
  }

  loading.value = true;
  error.value = "";

  try {
    const response = await fetch("/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({
        username: loginName,
        password: password.value,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      error.value =
        data.error || "Не удалось выполнить вход";
      return;
    }

    authenticated.value = true;
    currentUser.value = data.username || loginName;

    password.value = "";
    error.value = "";
  } catch {
    error.value = "Не удалось связаться с сервером";
  } finally {
    loading.value = false;
  }
}

async function logout() {
  if (loggingOut.value) {
    return;
  }

  loggingOut.value = true;
  error.value = "";

  try {
    const response = await fetch("/auth/logout", {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
      credentials: "same-origin",
    });

    if (!response.ok) {
      error.value = "Не удалось завершить сессию";
      return;
    }

    authenticated.value = false;
    currentUser.value = "";
    username.value = "";
    password.value = "";
  } catch {
    error.value = "Не удалось связаться с сервером";
  } finally {
    loggingOut.value = false;
  }
}

onMounted(checkSession);
</script>

<style scoped>
.auth-page {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 100vh;
  padding: 24px;
  background: #f5f7fa;
}

.auth-card {
  width: 100%;
  max-width: 420px;
}

.auth-heading {
  margin-bottom: 24px;
  text-align: center;
}

.auth-heading h1 {
  margin: 0 0 10px;
  font-size: 24px;
}

.auth-heading p {
  margin: 0;
  color: #606266;
  font-size: 14px;
}

.form-error {
  margin: 12px 0;
}

.login-button {
  width: 100%;
  margin-top: 8px;
}

.loading-icon {
  display: block;
  margin: 0 auto 12px;
}

.app-shell {
  min-height: 100vh;
  background: #f5f7fa;
}

.app-topbar {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 60px;
  padding: 12px 24px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
}

.user-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.username {
  color: #606266;
  font-size: 14px;
}

.global-error {
  margin-bottom: 12px;
}

@media (max-width: 520px) {
  .app-topbar {
    padding: 12px;
  }

  .user-controls {
    gap: 8px;
  }

  .username {
    overflow-wrap: anywhere;
  }

  .auth-page {
    padding: 16px;
  }
}
</style>