import { fetchJson } from "./api.js";
import { dom } from "./dom.js";
import {
  editsLabel,
  formatBool,
  formatDateTime,
  formatTime,
  fullName,
  initials,
  mediaUrl,
  senderName
} from "./format.js";
import { state } from "./state.js";

let onSelectChat = () => {};

export function setOnSelectChat(fn) {
  onSelectChat = fn;
}

export function renderAvatar(element, title, avatarPath) {
  element.innerHTML = "";
  if (avatarPath) {
    const image = document.createElement("img");
    image.src = mediaUrl(avatarPath);
    image.alt = "";
    element.append(image);
    return;
  }
  element.textContent = initials(title);
}

export function openLightbox(url) {
  dom.lightboxImageEl.src = url;
  dom.lightboxEl.classList.add("open");
}

export function closeLightbox() {
  dom.lightboxEl.classList.remove("open");
  dom.lightboxImageEl.removeAttribute("src");
}

export function closeContactCard() {
  dom.contactModalEl.classList.remove("open");
}

function contactRows(contact) {
  return [
    ["ID", contact.id],
    ["Username", contact.username ? `@${contact.username}` : ""],
    ["Телефон", contact.phone],
    ["Bio", contact.about],
    ["Аватар", contact.avatar_path],
    ["Photo ID", contact.avatar_photo_id],
    ["Access hash", contact.access_hash],
    ["Контакт", formatBool(contact.is_contact)],
    ["Взаимный контакт", formatBool(contact.is_mutual_contact)],
    ["Premium", formatBool(contact.is_premium)],
    ["Verified", formatBool(contact.is_verified)],
    ["Scam", formatBool(contact.is_scam)],
    ["Fake", formatBool(contact.is_fake)],
    ["Deleted", formatBool(contact.is_deleted)],
    ["Restricted", formatBool(contact.is_restricted)],
    ["Язык", contact.lang_code],
    ["Статус", contact.status],
    ["Был онлайн", formatDateTime(contact.last_seen_at)],
    ["Сообщений", contact.message_count],
    ["Медиа в чате", contact.photo_count],
    ["Первое сообщение", formatDateTime(contact.first_message_at)],
    ["Последнее сообщение", formatDateTime(contact.last_message_at)],
    ["Синхронизация", formatDateTime(contact.synced_at)],
    ["Обновлен", formatDateTime(contact.updated_at)]
  ];
}

export function renderContactCard(contact) {
  const title = fullName(contact);
  dom.contactTitleEl.textContent = title;
  dom.contactSubtitleEl.textContent = contact.username ? `@${contact.username}` : `ID ${contact.id}`;
  renderAvatar(dom.contactAvatarEl, title, contact.avatar_path);
  dom.contactBodyEl.innerHTML = "";

  for (const [label, value] of contactRows(contact)) {
    if (value === null || value === undefined || value === "") continue;
    const row = document.createElement("div");
    const labelEl = document.createElement("div");
    const valueEl = document.createElement("div");
    row.className = "profile-row";
    labelEl.className = "profile-label";
    valueEl.className = "profile-value";
    labelEl.textContent = label;
    valueEl.textContent = value;
    row.append(labelEl, valueEl);
    dom.contactBodyEl.append(row);
  }
}

export async function openContactCard() {
  if (!state.chatId) return;
  dom.contactButtonEl.disabled = true;
  try {
    const contact = await fetchJson(`/api/contacts/${state.chatId}`);
    renderContactCard(contact);
    dom.contactModalEl.classList.add("open");
  } finally {
    dom.contactButtonEl.disabled = !state.chatId;
  }
}

export function renderChats() {
  dom.chatsEl.innerHTML = "";
  for (const chat of state.chats) {
    const button = document.createElement("button");
    const preview = `${chat.message_count || 0} сообщений, ${chat.photo_count || 0} медиа`;
    button.className = `chat${chat.id === state.chatId ? " active" : ""}`;
    button.innerHTML = `
      <div class="avatar"></div>
      <div class="chat-body">
        <div class="chat-title"></div>
        <div class="chat-preview"></div>
      </div>
    `;
    renderAvatar(button.querySelector(".avatar"), chat.title, chat.avatar_path);
    button.querySelector(".chat-title").textContent = chat.title;
    button.querySelector(".chat-preview").textContent = preview;
    button.addEventListener("click", () => onSelectChat(chat.id));
    dom.chatsEl.append(button);
  }
  dom.statusEl.textContent = `${state.chats.length} чатов`;
}

function appendMessageMedia(bubble, message) {
  const path = message.media_path || message.photo_path;
  if (!path) return;

  const url = mediaUrl(path);
  const type = message.media_type || "image";

  if (type === "audio") {
    const audio = document.createElement("audio");
    audio.className = "media-audio";
    audio.controls = true;
    audio.preload = "metadata";
    audio.src = url;
    bubble.append(audio);
    return;
  }

  if (type === "video") {
    const video = document.createElement("video");
    video.className = "media-video";
    video.controls = true;
    video.preload = "metadata";
    video.src = url;
    bubble.append(video);
    return;
  }

  const link = document.createElement("a");
  const image = document.createElement("img");
  link.className = "media-link";
  link.href = url;
  link.addEventListener("click", event => {
    event.preventDefault();
    openLightbox(url);
  });
  image.className = "media-thumb";
  image.loading = "lazy";
  image.src = url;
  link.append(image);
  bubble.append(link);
}

function editMeta(message) {
  if (message.edit_history?.length) return "изм.";
  if (message.edit_date) return `изм. ${formatDateTime(message.edit_date)}`;
  if (message.is_edited) return "изм.";
  return "";
}

function deleteMeta(message) {
  if (message.deleted_at) return `удалено ${formatDateTime(message.deleted_at)}`;
  if (message.is_deleted) return "удалено";
  return "";
}

function appendEditHistory(bubble, message) {
  const history = message.edit_history || [];
  if (history.length === 0) return;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "edit-toggle";
  toggle.textContent = editsLabel(history.length);

  const panel = document.createElement("div");
  panel.className = "edit-history";

  const originalLabel = document.createElement("div");
  const originalText = document.createElement("div");
  originalLabel.className = "edit-version-label";
  originalLabel.textContent = "Оригинал";
  originalText.className = "edit-version-text";
  originalText.textContent = history[0].previous_text || "";
  panel.append(originalLabel, originalText);

  for (const edit of history) {
    const label = document.createElement("div");
    const text = document.createElement("div");
    label.className = "edit-version-label";
    label.textContent = edit.edited_at
      ? `Изменено ${formatDateTime(edit.edited_at)}`
      : "Изменено";
    text.className = "edit-version-text";
    text.textContent = edit.new_text || "";
    panel.append(label, text);
  }

  toggle.addEventListener("click", () => {
    const open = panel.classList.toggle("open");
    toggle.textContent = open ? "Скрыть правки" : editsLabel(history.length);
  });

  bubble.append(toggle, panel);
}

function createMessageElement(message) {
  const row = document.createElement("article");
  const direction = message.is_outgoing ? "outgoing" : "incoming";
  row.className = `message-row ${direction}${message.is_deleted ? " deleted" : ""}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  const sender = senderName(message);
  if (!message.is_outgoing && sender) {
    const senderEl = document.createElement("div");
    senderEl.className = "sender";
    senderEl.textContent = sender;
    bubble.append(senderEl);
  }

  appendMessageMedia(bubble, message);

  const text = document.createElement("div");
  text.className = "message-text";
  text.textContent = message.text || "";
  bubble.append(text);
  appendEditHistory(bubble, message);

  const meta = document.createElement("div");
  meta.className = "message-meta";
  meta.textContent = [
    message.chat_title,
    formatTime(message.date),
    editMeta(message),
    deleteMeta(message)
  ].filter(Boolean).join(" · ");
  bubble.append(meta);

  row.append(bubble);
  return row;
}

function historyText() {
  if (!state.chatId) return "";
  return state.hasMore ? "Прокрутите выше для истории" : "Начало истории";
}

export function renderHistoryStatus(text = historyText()) {
  dom.messagesEl.querySelector(".history-status")?.remove();
  if (!text) return;
  const status = document.createElement("div");
  status.className = "history-status";
  status.textContent = text;
  dom.messagesEl.prepend(status);
}

export function renderMessages(messages, options = {}) {
  if (options.reset) {
    dom.messagesEl.innerHTML = "";
  } else {
    dom.messagesEl.querySelector(".history-status")?.remove();
  }

  const fragment = document.createDocumentFragment();
  const ordered = options.keepOrder ? messages : messages.slice().reverse();

  for (const message of ordered) {
    fragment.append(createMessageElement(message));
  }

  if (options.prepend) {
    dom.messagesEl.prepend(fragment);
  } else {
    dom.messagesEl.append(fragment);
  }

  if (options.reset && messages.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Сообщений нет";
    dom.messagesEl.append(empty);
  }

  renderHistoryStatus();
}
