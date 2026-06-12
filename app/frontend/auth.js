import { fetchJson } from "./api.js";
import { loadChats } from "./chat.js";
import { dom } from "./dom.js";
import { connectEvents } from "./events.js";

function finishBoot() {
  dom.bootEl.classList.add("hidden");
}

export function showAuth(message = "") {
  finishBoot();
  dom.authEl.classList.remove("hidden");
  dom.appEl.classList.add("hidden");
  dom.authStatusEl.textContent = message;
}

export function showApp(auth) {
  finishBoot();
  dom.authEl.classList.add("hidden");
  dom.appEl.classList.remove("hidden");
  if (auth?.user) {
    dom.statusEl.textContent = `Аккаунт: ${auth.user.first_name || auth.user.username || auth.user.id}`;
  }
  connectEvents();
}

function setAuthStepNumbers(clientConfigured) {
  const offset = clientConfigured ? 1 : 0;
  dom.phoneStepEl.querySelector(".auth-step-number").textContent = String(2 - offset);
  dom.codeStepEl.querySelector(".auth-step-number").textContent = String(3 - offset);
  dom.passwordStepEl.querySelector(".auth-step-number").textContent = String(4 - offset);
}

export async function checkAuth() {
  const auth = await fetchJson("/api/auth/status");
  if (!auth.authorized) {
    dom.clientStepEl.classList.toggle("hidden", Boolean(auth.client_configured));
    setAuthStepNumbers(Boolean(auth.client_configured));
    dom.authTextEl.textContent = auth.client_configured
      ? "Введите номер телефона и подтвердите вход кодом из Telegram."
      : "Заполните шаги ниже, чтобы подключить аккаунт.";
    showAuth("Аккаунт еще не подключен");
    return;
  }

  showApp(auth);
  await loadChats();
}

export async function sendCode() {
  const phone = dom.phoneEl.value.trim();
  if (!phone) {
    showAuth("Введите номер телефона");
    return;
  }

  const payload = { phone };
  if (!dom.clientStepEl.classList.contains("hidden")) {
    const apiId = Number(dom.apiIdEl.value.trim());
    const apiHash = dom.apiHashEl.value.trim();
    if (!apiId || !apiHash) {
      showAuth("Введите api_id и api_hash");
      return;
    }
    payload.api_id = apiId;
    payload.api_hash = apiHash;
  }

  dom.sendCodeEl.disabled = true;
  dom.authStatusEl.textContent = "Отправляем код...";
  try {
    const result = await fetchJson("/api/auth/send-code", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    if (result.authorized) {
      showApp(result);
      await loadChats();
      return;
    }

    dom.codeStepEl.classList.remove("hidden");
    dom.authTextEl.textContent = "Введите код, который пришел в Telegram.";
    dom.authStatusEl.textContent = "Код отправлен";
    dom.codeEl.focus();
  } catch (error) {
    dom.authStatusEl.textContent = error.message;
  } finally {
    dom.sendCodeEl.disabled = false;
  }
}

export async function signIn() {
  const code = dom.codeEl.value.trim();
  if (!code) {
    dom.authStatusEl.textContent = "Введите код";
    return;
  }

  dom.signInEl.disabled = true;
  dom.authStatusEl.textContent = "Проверяем код...";
  try {
    const result = await fetchJson("/api/auth/sign-in", {
      method: "POST",
      body: JSON.stringify({ code })
    });

    if (result.status === "password_required") {
      dom.passwordStepEl.classList.remove("hidden");
      dom.authTextEl.textContent = "Для аккаунта включена двухфакторная защита. Введите пароль 2FA.";
      dom.authStatusEl.textContent = "";
      dom.passwordEl.focus();
      return;
    }

    showApp(result);
    await loadChats();
  } catch (error) {
    dom.authStatusEl.textContent = error.message;
  } finally {
    dom.signInEl.disabled = false;
  }
}

export async function sendPassword() {
  const password = dom.passwordEl.value;
  if (!password) {
    dom.authStatusEl.textContent = "Введите пароль 2FA";
    return;
  }

  dom.sendPasswordEl.disabled = true;
  dom.authStatusEl.textContent = "Проверяем пароль...";
  try {
    const result = await fetchJson("/api/auth/password", {
      method: "POST",
      body: JSON.stringify({ password })
    });
    showApp(result);
    await loadChats();
  } catch (error) {
    dom.authStatusEl.textContent = error.message;
  } finally {
    dom.sendPasswordEl.disabled = false;
  }
}
