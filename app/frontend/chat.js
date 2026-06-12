import { fetchJson } from "./api.js";
import { dom } from "./dom.js";
import { closeContactCard, renderChats, renderHistoryStatus, renderMessages } from "./render.js";
import { state } from "./state.js";

export async function loadChats() {
  state.chats = await fetchJson("/api/chats");
  renderChats();
}

export function isSearchActive() {
  return dom.searchEl.value.trim() !== "";
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
  if (!state.chatId || isSearchActive()) return;
  clearTimeout(state.messagesRefreshTimer);
  state.messagesRefreshTimer = setTimeout(() => {
    refreshCurrentChat().catch(error => {
      renderHistoryStatus(error.message);
    });
  }, delay);
}

async function refreshCurrentChat() {
  if (!state.chatId || state.isLoadingMessages) return;

  const chatId = state.chatId;
  const keepBottom = isNearBottom();
  const previousTop = dom.messagesEl.scrollTop;
  const previousHeight = dom.messagesEl.scrollHeight;
  const limit = Math.min(Math.max(state.offset, state.limit), 200);
  const messages = await fetchJson(`/api/chats/${chatId}/messages?limit=${limit}`);
  if (state.chatId !== chatId || isSearchActive()) return;

  state.offset = messages.length;
  state.hasMore = messages.length === limit;
  renderMessages(messages, { reset: true });

  if (keepBottom) {
    dom.messagesEl.scrollTop = dom.messagesEl.scrollHeight;
    return;
  }

  dom.messagesEl.scrollTop = dom.messagesEl.scrollHeight - previousHeight + previousTop;
}

export async function selectChat(chatId) {
  state.chatId = chatId;
  state.searchReturnChatId = chatId;
  state.offset = 0;
  state.hasMore = false;
  state.isLoadingMessages = true;
  dom.searchEl.value = "";

  const chat = state.chats.find(item => item.id === chatId);
  dom.titleEl.textContent = chat?.title || String(chatId);
  dom.subtitleEl.textContent = chat ? `${chat.message_count || 0} сообщений` : "";
  dom.contactButtonEl.disabled = !chat;
  renderChats();
  dom.messagesEl.innerHTML = '<div class="history-status">Загрузка...</div>';

  try {
    const messages = await fetchJson(`/api/chats/${chatId}/messages?limit=${state.limit}`);
    if (state.chatId !== chatId) return;
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

export async function loadMore() {
  if (!state.chatId || !state.hasMore || state.isLoadingMessages) return;
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

export async function search(query) {
  const trimmed = query.trim();
  if (!trimmed) {
    if (state.searchReturnChatId) {
      await selectChat(state.searchReturnChatId);
    }
    return;
  }

  if (state.chatId) {
    state.searchReturnChatId = state.chatId;
  }
  state.chatId = null;
  state.hasMore = false;
  dom.titleEl.textContent = "Поиск";
  dom.subtitleEl.textContent = trimmed;
  dom.contactButtonEl.disabled = true;
  closeContactCard();
  renderChats();
  const results = await fetchJson(`/api/search?q=${encodeURIComponent(trimmed)}`);
  renderMessages(results, { reset: true, keepOrder: true });
}
