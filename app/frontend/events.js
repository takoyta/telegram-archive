import { scheduleChatsRefresh, scheduleMessagesRefresh } from "./chat.js";
import { dom } from "./dom.js";
import { state } from "./state.js";

function eventChatId(event) {
  return Number(event.chat_id);
}

function eventMatchesCurrentChat(event) {
  return state.chatId !== null && eventChatId(event) === state.chatId;
}

function handleArchiveEvent(event) {
  if (event.type === "sync_started") {
    dom.statusEl.textContent = "Синхронизация запущена";
    scheduleChatsRefresh();
    return;
  }

  if (event.type === "sync_progress") {
    dom.statusEl.textContent = `Синхронизация: ${event.title}, ${event.messages} сообщений`;
    scheduleChatsRefresh(800);
    if (eventMatchesCurrentChat(event)) {
      scheduleMessagesRefresh(1000);
    }
    return;
  }

  if (event.type === "chat_synced") {
    dom.statusEl.textContent = `Синхронизирован чат: ${event.title}`;
    scheduleChatsRefresh();
    if (eventMatchesCurrentChat(event)) {
      scheduleMessagesRefresh();
    }
    return;
  }

  if (event.type === "sync_finished") {
    dom.statusEl.textContent = `Синхронизация завершена: ${event.messages} сообщений`;
    scheduleChatsRefresh();
    scheduleMessagesRefresh();
    return;
  }

  if (event.type === "message_new") {
    scheduleChatsRefresh();
    if (eventMatchesCurrentChat(event)) {
      scheduleMessagesRefresh(100);
    }
    return;
  }

  if (event.type === "message_edited" || event.type === "message_deleted") {
    scheduleChatsRefresh();
    if (eventMatchesCurrentChat(event)) {
      scheduleMessagesRefresh(100);
    }
  }
}

export function connectEvents() {
  if (state.eventsSource || !window.EventSource) return;

  state.eventsSource = new EventSource("/api/events");
  state.eventsSource.addEventListener("archive", event => {
    handleArchiveEvent(JSON.parse(event.data));
  });
  state.eventsSource.onerror = () => {
    dom.statusEl.textContent = "Переподключение к событиям...";
  };
}
