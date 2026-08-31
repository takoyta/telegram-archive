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

export function openLightbox(url, caption = "", gallery = [], index = -1) {
  state.lightboxGallery = gallery;
  state.lightboxIndex = index;
  dom.lightboxImageEl.src = url;
  dom.lightboxCaptionEl.textContent = caption;
  updateLightboxNav();
  dom.lightboxEl.classList.add("open");
}

export function updateLightboxNav() {
  const hasMultiple = state.lightboxGallery && state.lightboxGallery.length > 1;
  dom.lightboxPrevEl.classList.toggle("hidden", !hasMultiple || state.lightboxIndex <= 0);
  dom.lightboxNextEl.classList.toggle("hidden", !hasMultiple || state.lightboxIndex >= state.lightboxGallery.length - 1);
}

export function showLightboxIndex(index) {
  if (!state.lightboxGallery || index < 0 || index >= state.lightboxGallery.length) return;
  state.lightboxIndex = index;
  const item = state.lightboxGallery[index];
  dom.lightboxImageEl.src = item.url;
  dom.lightboxCaptionEl.textContent = item.caption || "";
  updateLightboxNav();
}

export function prevLightbox() {
  if (state.lightboxIndex > 0) {
    showLightboxIndex(state.lightboxIndex - 1);
  }
}

export function nextLightbox() {
  if (state.lightboxGallery && state.lightboxIndex < state.lightboxGallery.length - 1) {
    showLightboxIndex(state.lightboxIndex + 1);
  }
}

export function closeLightbox() {
  dom.lightboxEl.classList.remove("open");
  dom.lightboxImageEl.removeAttribute("src");
  dom.lightboxCaptionEl.textContent = "";
  state.lightboxGallery = [];
  state.lightboxIndex = -1;
}

export function closeContactCard() {
  dom.contactModalEl.classList.remove("open");
  delete dom.contactModalEl.dataset.taContactId;
  delete dom.contactModalEl.dataset.taUsername;
  delete dom.contactTitleEl.dataset.taContactId;
}

export function renderContactAvatars(avatars) {
  state.avatars = avatars || [];
  dom.contactAvatarsCountEl.textContent = state.avatars.length;
  dom.contactAvatarsGalleryEl.innerHTML = "";

  if (state.avatars.length === 0) {
    const empty = document.createElement("div");
    empty.className = "avatars-empty";
    empty.textContent = "Аватары не найдены. Нажмите кнопку выше для загрузки.";
    dom.contactAvatarsGalleryEl.append(empty);
    return;
  }

  const gallery = state.avatars.map((av, idx) => {
    const dateStr = av.date ? formatDateTime(av.date) : "";
    const isCur = av.is_current ? " (Текущий)" : "";
    const caption = `Аватар ${idx + 1} из ${state.avatars.length}${isCur}${dateStr ? ` · ${dateStr}` : ""}`;
    return {
      url: mediaUrl(av.path),
      caption
    };
  });

  state.avatars.forEach((avatar, index) => {
    const item = document.createElement("div");
    item.className = `avatar-card${avatar.is_current ? " is-current" : ""}`;
    item.dataset.taRole = "avatar";
    if (avatar.id != null) item.dataset.taAvatarId = String(avatar.id);
    if (avatar.photo_id != null) item.dataset.taPhotoId = String(avatar.photo_id);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "avatar-card-image";
    const img = document.createElement("img");
    img.src = mediaUrl(avatar.path);
    img.alt = "";
    img.loading = "lazy";
    button.append(img);

    button.addEventListener("click", () => {
      openLightbox(gallery[index].url, gallery[index].caption, gallery, index);
    });

    item.append(button);

    if (avatar.is_current) {
      const badge = document.createElement("div");
      badge.className = "avatar-badge";
      badge.textContent = "Текущий";
      item.append(badge);
    }

    if (avatar.date) {
      const dateEl = document.createElement("div");
      dateEl.className = "avatar-date";
      dateEl.textContent = formatDateTime(avatar.date);
      item.append(dateEl);
    }

    dom.contactAvatarsGalleryEl.append(item);
  });
}

export function renderMediaAvatars(avatars) {
  let section = findMediaSection("Аватары");
  if (!avatars || avatars.length === 0) {
    if (section) section.remove();
    return;
  }

  const gallery = avatars.map((av, idx) => {
    const dateStr = av.date ? formatDateTime(av.date) : "";
    const isCur = av.is_current ? " (Текущий)" : "";
    return {
      url: mediaUrl(av.path),
      caption: `Аватар ${idx + 1} из ${avatars.length}${isCur}${dateStr ? ` · ${dateStr}` : ""}`
    };
  });

  if (!section) {
    section = document.createElement("section");
    section.className = "media-section";
    const heading = document.createElement("div");
    heading.className = "media-section-title";
    const body = document.createElement("div");
    body.className = "media-grid";
    section.append(heading, body);
    dom.mediaPanelEl.prepend(section);
  }

  const heading = section.querySelector(".media-section-title");
  if (heading) heading.textContent = `Аватары · ${avatars.length}`;

  const body = section.querySelector(".media-grid");
  body.innerHTML = "";

  avatars.forEach((avatar, index) => {
    const article = document.createElement("article");
    article.className = "media-item media-item-avatar";
    article.dataset.taRole = "avatar";
    if (avatar.id != null) article.dataset.taAvatarId = String(avatar.id);
    if (avatar.contact_id != null) article.dataset.taContactId = String(avatar.contact_id);
    if (avatar.photo_id != null) article.dataset.taPhotoId = String(avatar.photo_id);
    if (avatar.is_current) article.dataset.taCurrent = "1";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "media-gallery-image";
    const img = document.createElement("img");
    img.src = mediaUrl(avatar.path);
    img.alt = "";
    img.loading = "lazy";
    button.append(img);

    button.addEventListener("click", () => {
      openLightbox(gallery[index].url, gallery[index].caption, gallery, index);
    });

    const caption = document.createElement("div");
    caption.className = "media-item-caption";
    caption.textContent = avatar.is_current ? "Текущий" : (avatar.date ? formatDateTime(avatar.date) : "");

    article.append(button, caption);
    body.append(article);
  });
}

function contactRows(contact) {
  return [
    ["ID", contact.id],
    ["Username", contact.username ? `@${contact.username}` : ""],
    ["Телефон", contact.phone],
    ["День рождения", contact.birthday],
    ["Bio", contact.about],
    ["Аватары", contact.avatar_count !== undefined ? `${contact.avatar_count} фото` : null],
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
  if (contact.id != null) {
    dom.contactModalEl.dataset.taContactId = String(contact.id);
    dom.contactTitleEl.dataset.taContactId = String(contact.id);
  }
  if (contact.username) {
    dom.contactModalEl.dataset.taUsername = contact.username;
  } else {
    delete dom.contactModalEl.dataset.taUsername;
  }
  dom.contactTitleEl.textContent = title;
  dom.contactSubtitleEl.textContent = contact.username ? `@${contact.username}` : `ID ${contact.id}`;
  renderAvatar(dom.contactAvatarEl, title, contact.avatar_path);
  if (contact.avatar_path) {
    dom.contactAvatarEl.style.cursor = "pointer";
    dom.contactAvatarEl.onclick = () => {
      if (state.avatars && state.avatars.length > 0) {
        const gallery = state.avatars.map((av, idx) => {
          const dateStr = av.date ? formatDateTime(av.date) : "";
          const isCur = av.is_current ? " (Текущий)" : "";
          return {
            url: mediaUrl(av.path),
            caption: `Аватар ${idx + 1} из ${state.avatars.length}${isCur}${dateStr ? ` · ${dateStr}` : ""}`
          };
        });
        const curIdx = state.avatars.findIndex(a => a.path === contact.avatar_path);
        const idx = curIdx >= 0 ? curIdx : 0;
        openLightbox(gallery[idx].url, gallery[idx].caption, gallery, idx);
      } else {
        openLightbox(mediaUrl(contact.avatar_path), title);
      }
    };
  } else {
    dom.contactAvatarEl.style.cursor = "default";
    dom.contactAvatarEl.onclick = null;
  }
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
    const [contact, avatars] = await Promise.all([
      fetchJson(`/api/contacts/${state.chatId}`),
      fetchJson(`/api/contacts/${state.chatId}/avatars`).catch(() => [])
    ]);
    renderContactCard(contact);
    renderContactAvatars(avatars);
    renderMediaAvatars(avatars);
    dom.contactModalEl.classList.add("open");
  } finally {
    dom.contactButtonEl.disabled = !state.chatId;
  }
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

export function chatMatchesQuery(chat, query) {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const text = [chat.title, chat.username].filter(Boolean).join(" ").toLowerCase();
  const phoneDigits = digitsOnly(chat.phone);
  return tokens.every(token => {
    if (text.includes(token)) return true;
    const tokenDigits = digitsOnly(token);
    return tokenDigits.length > 0 && phoneDigits.includes(tokenDigits);
  });
}

export function renderChats() {
  const query = dom.chatSearchEl.value.trim();
  const chats = query ? state.chats.filter(chat => chatMatchesQuery(chat, query)) : state.chats;
  dom.chatSearchClearEl.classList.toggle("hidden", !query);
  dom.chatsEl.innerHTML = "";
  if (!chats.length) {
    const empty = document.createElement("div");
    empty.className = "chat-search-empty";
    empty.textContent = query ? "Ничего не найдено" : "Нет чатов";
    dom.chatsEl.append(empty);
    dom.statusEl.textContent = query
      ? `0 из ${state.chats.length} чатов`
      : "0 чатов";
    return;
  }
  for (const chat of chats) {
    const button = document.createElement("button");
    const preview = `${chat.message_count || 0} сообщений, ${chat.photo_count || 0} медиа`;
    button.type = "button";
    button.className = `chat${chat.id === state.chatId ? " active" : ""}`;
    button.dataset.taRole = "chat";
    button.dataset.taChatId = String(chat.id);
    if (chat.username) button.dataset.taUsername = chat.username;
    if (chat.title) button.dataset.taTitle = chat.title;
    if (chat.message_count != null) button.dataset.taMessageCount = String(chat.message_count);
    if (chat.photo_count != null) button.dataset.taPhotoCount = String(chat.photo_count);
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
  dom.statusEl.textContent = query
    ? `${chats.length} из ${state.chats.length} чатов`
    : `${state.chats.length} чатов`;
}

function appendMessageMedia(bubble, message) {
  const path = message.media_path || message.photo_path;
  if (!path) return;
  bubble.append(createInlineMedia(path, message.media_type || "image"));
}

function createInlineMedia(path, type) {
  const url = mediaUrl(path);

  if (type === "audio") {
    const audio = document.createElement("audio");
    audio.className = "media-audio";
    audio.controls = true;
    audio.preload = "metadata";
    audio.src = url;
    return audio;
  }

  if (type === "video") {
    const video = document.createElement("video");
    video.className = "media-video";
    video.controls = true;
    video.preload = "metadata";
    video.src = url;
    return video;
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
  return link;
}

function mediaCaption(item) {
  return [senderName(item), formatTime(item.date)].filter(Boolean).join(" · ");
}

function createGalleryItem(item) {
  const path = item.media_path;
  const type = item.media_type || "image";
  const url = mediaUrl(path);
  const element = document.createElement("article");
  element.className = `media-item media-item-${type}`;
  element.dataset.taRole = "media-item";
  if (item.id != null) element.dataset.taMessageId = String(item.id);
  if (item.telegram_id != null) element.dataset.taTelegramId = String(item.telegram_id);
  element.dataset.taMediaType = type;

  if (type === "audio") {
    const audio = document.createElement("audio");
    audio.className = "media-gallery-audio";
    audio.controls = true;
    audio.preload = "metadata";
    audio.src = url;
    element.append(audio);
  } else if (type === "video") {
    const video = document.createElement("video");
    video.className = "media-gallery-video";
    video.controls = true;
    video.preload = "metadata";
    video.src = url;
    element.append(video);
  } else {
    const button = document.createElement("button");
    const image = document.createElement("img");
    button.type = "button";
    button.className = "media-gallery-image";
    image.loading = "lazy";
    image.src = url;
    image.alt = "";
    button.addEventListener("click", () => openLightbox(url));
    button.append(image);
    element.append(button);
  }

  const caption = document.createElement("div");
  caption.className = "media-item-caption";
  caption.textContent = mediaCaption(item);
  element.append(caption);
  return element;
}

function mediaSectionMeta(type) {
  if (type === "video") return { title: "Видео", layout: "list" };
  if (type === "audio") return { title: "Аудио", layout: "list" };
  return { title: "Фото", layout: "grid" };
}

function findMediaSection(title) {
  return [...dom.mediaPanelEl.querySelectorAll(".media-section")].find(section => {
    return section.querySelector(".media-section-title")?.textContent?.startsWith(title);
  });
}

function updateMediaSectionTitle(section, title) {
  const count = section.querySelector(".media-grid, .media-list")?.childElementCount || 0;
  const heading = section.querySelector(".media-section-title");
  if (heading) heading.textContent = `${title} · ${count}`;
}

function appendMediaSection(type, items) {
  if (items.length === 0) return;

  const { title, layout } = mediaSectionMeta(type);
  let section = findMediaSection(title);

  if (!section) {
    section = document.createElement("section");
    section.className = "media-section";
    const heading = document.createElement("div");
    heading.className = "media-section-title";
    const body = document.createElement("div");
    body.className = layout === "grid" ? "media-grid" : "media-list";
    section.append(heading, body);
    dom.mediaPanelEl.append(section);
  }

  const body = section.querySelector(".media-grid, .media-list");
  for (const item of items) {
    body.append(createGalleryItem(item));
  }
  updateMediaSectionTitle(section, title);
}

export function renderMediaPanel(items, options = {}) {
  if (options.reset) {
    dom.mediaPanelEl.innerHTML = "";
  }

  dom.mediaPanelEl.querySelector(".media-panel-status")?.remove();
  dom.mediaPanelEl.querySelector(".media-panel-empty")?.remove();

  if (items.length === 0 && options.reset) {
    const empty = document.createElement("div");
    empty.className = "media-panel-empty";
    empty.textContent = "Медиа нет";
    dom.mediaPanelEl.append(empty);
    return;
  }

  const images = items.filter(item => (item.media_type || "image") === "image");
  const videos = items.filter(item => item.media_type === "video");
  const audios = items.filter(item => item.media_type === "audio");

  appendMediaSection("image", images);
  appendMediaSection("video", videos);
  appendMediaSection("audio", audios);
}

export function renderMediaStatus(text) {
  dom.mediaPanelEl.querySelector(".media-panel-status")?.remove();
  if (!text) return;
  const status = document.createElement("div");
  status.className = "media-panel-status";
  status.textContent = text;
  dom.mediaPanelEl.append(status);
}

export function clearMediaPanel(message = "Выберите чат") {
  dom.mediaPanelEl.innerHTML = "";
  if (!message) return;
  const empty = document.createElement("div");
  empty.className = "media-panel-empty";
  empty.textContent = message;
  dom.mediaPanelEl.append(empty);
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
  row.dataset.taRole = "message";
  if (message.id != null) row.dataset.taMessageId = String(message.id);
  if (message.telegram_id != null) row.dataset.taTelegramId = String(message.telegram_id);
  if (message.chat_id != null) row.dataset.taChatId = String(message.chat_id);
  if (message.sender_id != null) row.dataset.taSenderId = String(message.sender_id);
  if (message.date != null) row.dataset.taDate = String(message.date);
  row.dataset.taOutgoing = message.is_outgoing ? "1" : "0";
  if (message.is_deleted) row.dataset.taDeleted = "1";

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

function historyText(options = {}) {
  if (options.searchMode) return "";
  if (!state.chatId) return "";
  return state.hasMore ? "Прокрутите выше для истории" : "Начало истории";
}

export function renderHistoryStatus(text, options = {}) {
  if (text === undefined) {
    text = historyText(options);
  }
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
    empty.textContent = options.searchMode ? "Ничего не найдено" : "Сообщений нет";
    dom.messagesEl.append(empty);
  }

  renderHistoryStatus(undefined, options);
}
