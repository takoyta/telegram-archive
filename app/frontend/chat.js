import { fetchJson } from "./api.js";
import { dom } from "./dom.js";
import {
  clearMediaPanel,
  closeContactCard,
  renderChats,
  renderHistoryStatus,
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

async function refreshCurrentMedia() {
  if (!state.chatId || state.isLoadingMedia) return;

  const chatId = state.chatId;
  const previousTop = dom.mediaPanelEl.scrollTop;
  const previousHeight = dom.mediaPanelEl.scrollHeight;
  const limit = Math.min(Math.max(state.mediaOffset, state.mediaLimit), 200);
  const items = await fetchJson(`/api/chats/${chatId}/media?limit=${limit}`);
  if (state.chatId !== chatId || isMessageSearchActive()) return;

  state.mediaOffset = items.length;
  state.hasMoreMedia = items.length === limit;
  renderMediaPanel(items, { reset: true });
  dom.mediaPanelEl.scrollTop = dom.mediaPanelEl.scrollHeight - previousHeight + previousTop;
}

async function refreshCurrentChat() {
  if (!state.chatId || state.isLoadingMessages) return;

  const chatId = state.chatId;
  const keepBottom = isNearBottom();
  const previousTop = dom.messagesEl.scrollTop;
  const previousHeight = dom.messagesEl.scrollHeight;
  const limit = Math.min(Math.max(state.offset, state.limit), 200);
  const messages = await fetchJson(`/api/chats/${chatId}/messages?limit=${limit}`);
  if (state.chatId !== chatId || isMessageSearchActive()) return;

  state.offset = messages.length;
  state.hasMore = messages.length === limit;
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
  dom.titleEl.textContent = chat?.title || String(chatId);
  dom.subtitleEl.textContent = chat ? `${chat.message_count || 0} сообщений` : "";
  dom.contactButtonEl.disabled = !chat;
  renderChats();
  dom.messagesEl.innerHTML = '<div class="history-status">Загрузка...</div>';
  dom.mediaPanelEl.innerHTML = "";
  renderMediaStatus("Загрузка...");

  try {
    const [messages, media] = await Promise.all([
      fetchJson(`/api/chats/${chatId}/messages?limit=${state.limit}`),
      fetchJson(`/api/chats/${chatId}/media?limit=${state.mediaLimit}`)
    ]);
    if (state.chatId !== chatId) return;
    state.offset = messages.length;
    state.hasMore = messages.length === state.limit;
    state.mediaOffset = media.length;
    state.hasMoreMedia = media.length === state.mediaLimit;
    renderMessages(messages, { reset: true });
    renderMediaPanel(media, { reset: true });
    requestAnimationFrame(() => {
      dom.messagesEl.scrollTop = dom.messagesEl.scrollHeight;
    });
  } finally {
    state.isLoadingMessages = false;
    state.isLoadingMedia = false;
  }
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
