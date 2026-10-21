import { fetchJson } from "./api.js";
import { dom } from "./dom.js";
import { setExportChat } from "./exportContext.js";
import {
  clearMediaPanel,
  closeContactCard,
  renderChats,
  renderContactAvatars,
  renderContactCard,
  renderHistoryStatus,
  renderMediaAvatars,
  renderMediaPanel,
  renderMediaStatus,
  renderMessages
} from "./render.js";
import { state } from "./state.js";

export async function loadChats() {
  state.chats = await fetchJson("/api/chats");
  renderChats();
}

export function isMessageSearchActive() {
  return dom.messageSearchEl.value.trim() !== "";
}

function updateMessageSearchClear() {
  dom.messageSearchClearEl.classList.toggle("hidden", !isMessageSearchActive());
}

function setMessageSearchEnabled(enabled) {
  dom.messageSearchEl.disabled = !enabled;
  if (!enabled) {
    dom.messageSearchEl.value = "";
    updateMessageSearchClear();
  }
}

function isNearBottom() {
  const distance = dom.messagesEl.scrollHeight - dom.messagesEl.scrollTop - dom.messagesEl.clientHeight;
  return distance < 120;
}

export function scheduleChatsRefresh(delay = 250) {
  clearTimeout(state.chatsRefreshTimer);
  state.chatsRefreshTimer = setTimeout(() => {
    loadChats().catch(error => {
      dom.statusEl.textContent = error.message;
    });
  }, delay);
}

export function scheduleMessagesRefresh(delay = 250) {
  if (!state.chatId || isMessageSearchActive()) return;
  clearTimeout(state.messagesRefreshTimer);
  state.messagesRefreshTimer = setTimeout(() => {
    refreshCurrentChat().catch(error => {
      renderHistoryStatus(error.message);
    });
  }, delay);
}

export function scheduleMediaRefresh(delay = 250) {
  if (!state.chatId || isMessageSearchActive()) return;
  clearTimeout(state.mediaRefreshTimer);
  state.mediaRefreshTimer = setTimeout(() => {
    refreshCurrentMedia().catch(error => {
      renderMediaStatus(error.message);
    });
  }, delay);
}

const PAGE_SIZE = 200;

function oldestTelegramId(container, skipMessageId) {
  let oldest = null;
  for (const node of container.querySelectorAll("[data-ta-telegram-id]")) {
    if (skipMessageId != null && node.dataset.taMessageId === String(skipMessageId)) continue;
    const id = Number(node.dataset.taTelegramId);
    if (!Number.isFinite(id)) continue;
    if (oldest == null || id < oldest) oldest = id;
  }
  return oldest;
}

async function fetchLoadedWindow(path, anchorId) {
  const items = [];
  let offset = 0;
  while (items.length < 5000) {
    const page = await fetchJson(`${path}?offset=${offset}&limit=${PAGE_SIZE}`);
    items.push(...page);
    if (page.length < PAGE_SIZE) {
      if (anchorId == null) return { items, hasMore: false };
      const anchorIndex = items.findIndex(item => item.telegram_id === anchorId);
      if (anchorIndex >= 0) return { items: items.slice(0, anchorIndex + 1), hasMore: false };
      return { items, hasMore: false };
    }
    if (anchorId == null) return { items, hasMore: true };
    const anchorIndex = items.findIndex(item => item.telegram_id === anchorId);
    if (anchorIndex >= 0) return { items: items.slice(0, anchorIndex + 1), hasMore: true };
    offset += page.length;
  }
  return { items, hasMore: true };
}

async function refreshCurrentMedia() {
  if (!state.chatId || state.isLoadingMedia) return;

  const chatId = state.chatId;
  const previousTop = dom.mediaPanelEl.scrollTop;
  const previousHeight = dom.mediaPanelEl.scrollHeight;
  const anchorId = oldestTelegramId(dom.mediaPanelEl);
  const { items, hasMore } = await fetchLoadedWindow(`/api/chats/${chatId}/media`, anchorId);
  if (state.chatId !== chatId || isMessageSearchActive()) return;

  state.mediaOffset = items.length;
  state.hasMoreMedia = hasMore;
  renderMediaPanel(items, { reset: true });
  renderMediaAvatars(state.avatars);
  dom.mediaPanelEl.scrollTop = dom.mediaPanelEl.scrollHeight - previousHeight + previousTop;
}

async function refreshCurrentChat() {
  if (!state.chatId || state.isLoadingMessages) return;

  const chatId = state.chatId;
  const keepBottom = isNearBottom();
  const previousTop = dom.messagesEl.scrollTop;
  const previousHeight = dom.messagesEl.scrollHeight;
  const anchorId = oldestTelegramId(dom.messagesEl);
  const { items: messages, hasMore } = await fetchLoadedWindow(`/api/chats/${chatId}/messages`, anchorId);
  if (state.chatId !== chatId || isMessageSearchActive()) return;

  state.offset = messages.length;
  state.hasMore = hasMore;
  renderMessages(messages, { reset: true });

  if (keepBottom) {
    dom.messagesEl.scrollTop = dom.messagesEl.scrollHeight;
    return;
  }

  dom.messagesEl.scrollTop = dom.messagesEl.scrollHeight - previousHeight + previousTop;
}

async function restoreChatHistory() {
  if (!state.chatId) return;

  const chatId = state.chatId;
  state.offset = 0;
  state.hasMore = false;
  state.isLoadingMessages = true;
  dom.messagesEl.innerHTML = '<div class="history-status">Загрузка...</div>';

  try {
    const messages = await fetchJson(`/api/chats/${chatId}/messages?limit=${state.limit}`);
    if (state.chatId !== chatId || isMessageSearchActive()) return;
    state.offset = messages.length;
    state.hasMore = messages.length === state.limit;
    renderMessages(messages, { reset: true });
    requestAnimationFrame(() => {
      dom.messagesEl.scrollTop = dom.messagesEl.scrollHeight;
    });
  } finally {
    state.isLoadingMessages = false;
  }
}

export async function searchChatMessages(query) {
  const trimmed = query.trim();
  updateMessageSearchClear();

  if (!trimmed) {
    await restoreChatHistory();
    return;
  }

  if (!state.chatId) return;

  const chatId = state.chatId;
  state.hasMore = false;
  dom.messagesEl.innerHTML = '<div class="history-status">Поиск...</div>';

  const results = await fetchJson(
    `/api/chats/${chatId}/search?q=${encodeURIComponent(trimmed)}&limit=${state.limit}`
  );
  if (state.chatId !== chatId || !isMessageSearchActive()) return;
  renderMessages(results, { reset: true, keepOrder: true, searchMode: true });
}

export function clearMessageSearch() {
  dom.messageSearchEl.value = "";
  updateMessageSearchClear();
  searchChatMessages("").catch(error => {
    renderHistoryStatus(error.message);
  });
}

export async function selectChat(chatId) {
  state.chatId = chatId;
  state.offset = 0;
  state.hasMore = false;
  state.mediaOffset = 0;
  state.hasMoreMedia = false;
  state.isLoadingMessages = true;
  state.isLoadingMedia = true;
  dom.messageSearchEl.value = "";
  updateMessageSearchClear();
  setMessageSearchEnabled(true);

  const chat = state.chats.find(item => item.id === chatId);
  setExportChat(chat || { id: chatId, title: "", username: "" });
  dom.titleEl.textContent = chat?.title || String(chatId);
  dom.subtitleEl.textContent = chat ? `${chat.message_count || 0} сообщений` : "";
  dom.contactButtonEl.disabled = !chat;
  renderChats();
  dom.messagesEl.innerHTML = '<div class="history-status">Загрузка...</div>';
  dom.mediaPanelEl.innerHTML = "";
  renderMediaStatus("Загрузка...");

  try {
    const [messages, media, avatars] = await Promise.all([
      fetchJson(`/api/chats/${chatId}/messages?limit=${state.limit}`),
      fetchJson(`/api/chats/${chatId}/media?limit=${state.mediaLimit}`),
      fetchJson(`/api/contacts/${chatId}/avatars`).catch(() => [])
    ]);
    if (state.chatId !== chatId) return;
    state.offset = messages.length;
    state.hasMore = messages.length === state.limit;
    state.mediaOffset = media.length;
    state.hasMoreMedia = media.length === state.mediaLimit;
    state.avatars = avatars || [];
    renderMessages(messages, { reset: true });
    renderMediaPanel(media, { reset: true });
    renderMediaAvatars(state.avatars);
    requestAnimationFrame(() => {
      dom.messagesEl.scrollTop = dom.messagesEl.scrollHeight;
    });
  } finally {
    state.isLoadingMessages = false;
    state.isLoadingMedia = false;
  }
}

export async function syncCurrentContactAvatars() {
  if (!state.chatId || state.isLoadingAvatars) return;
  state.isLoadingAvatars = true;
  dom.syncAvatarsButtonEl.disabled = true;
  dom.syncAvatarsButtonEl.classList.add("loading");
  const text = dom.syncAvatarsButtonEl.querySelector(".sync-text");
  if (text) text.textContent = "Загрузка...";

  try {
    const avatars = await fetchJson(`/api/contacts/${state.chatId}/avatars/sync`, {
      method: "POST"
    });
    renderContactAvatars(avatars);
    renderMediaAvatars(avatars);
    const contact = await fetchJson(`/api/contacts/${state.chatId}`);
    renderContactCard(contact);
    await loadChats();
  } catch (error) {
    alert("Ошибка загрузки аватаров: " + error.message);
  } finally {
    state.isLoadingAvatars = false;
    dom.syncAvatarsButtonEl.disabled = false;
    dom.syncAvatarsButtonEl.classList.remove("loading");
    if (text) text.textContent = "Загрузить с Telegram";
  }
}

export async function deleteSidebarMedia({ kind, id }) {
  if (!id || state.isDeletingMedia) return;
  const prompt = kind === "avatar"
    ? "Удалить этот аватар с диска? Он больше не скачается и пропадёт из интерфейса."
    : "Удалить этот файл с диска? Он больше не скачается и пропадёт из интерфейса.";
  if (!window.confirm(prompt)) return;

  state.isDeletingMedia = true;
  try {
    const url = kind === "avatar"
      ? `/api/avatars/${id}`
      : `/api/messages/${id}/media`;
    await fetchJson(url, { method: "DELETE" });
    await reloadAfterMediaDelete(kind === "message" ? id : null);
  } catch (error) {
    window.alert(error.message);
  } finally {
    state.isDeletingMedia = false;
  }
}

async function reloadAfterMediaDelete(skipMessageId) {
  const chatId = state.chatId;
  if (!chatId) return;

  const anchorId = oldestTelegramId(dom.mediaPanelEl, skipMessageId);
  const [{ items, hasMore }, avatars] = await Promise.all([
    fetchLoadedWindow(`/api/chats/${chatId}/media`, anchorId),
    fetchJson(`/api/contacts/${chatId}/avatars`).catch(() => []),
    loadChats()
  ]);
  if (state.chatId !== chatId) return;

  state.avatars = avatars || [];
  state.mediaOffset = items.length;
  state.hasMoreMedia = hasMore;
  renderMediaPanel(items, { reset: true });
  renderMediaAvatars(state.avatars);

  if (dom.contactModalEl.classList.contains("open")) {
    const contact = await fetchJson(`/api/contacts/${chatId}`);
    if (state.chatId !== chatId) return;
    renderContactCard(contact);
    renderContactAvatars(state.avatars);
  }

  if (isMessageSearchActive()) {
    await searchChatMessages(dom.messageSearchEl.value);
    return;
  }
  await refreshCurrentChat();
}

export async function loadMore() {
  if (!state.chatId || !state.hasMore || state.isLoadingMessages || isMessageSearchActive()) return;
  state.isLoadingMessages = true;
  renderHistoryStatus("Загрузка истории...");

  const previousHeight = dom.messagesEl.scrollHeight;
  const previousTop = dom.messagesEl.scrollTop;

  try {
    const messages = await fetchJson(
      `/api/chats/${state.chatId}/messages?offset=${state.offset}&limit=${state.limit}`
    );
    state.offset += messages.length;
    state.hasMore = messages.length === state.limit;
    renderMessages(messages, { prepend: true });
    dom.messagesEl.scrollTop = dom.messagesEl.scrollHeight - previousHeight + previousTop;
  } finally {
    state.isLoadingMessages = false;
  }
}

export async function loadMoreMedia() {
  if (!state.chatId || !state.hasMoreMedia || state.isLoadingMedia) return;
  state.isLoadingMedia = true;
  renderMediaStatus("Загрузка...");

  try {
    const items = await fetchJson(
      `/api/chats/${state.chatId}/media?offset=${state.mediaOffset}&limit=${state.mediaLimit}`
    );
    state.mediaOffset += items.length;
    state.hasMoreMedia = items.length === state.mediaLimit;
    renderMediaPanel(items, { reset: false });
  } finally {
    state.isLoadingMedia = false;
    dom.mediaPanelEl.querySelector(".media-panel-status")?.remove();
  }
}
