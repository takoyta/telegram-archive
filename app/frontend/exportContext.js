import { dom } from "./dom.js";
import { fullName } from "./format.js";

const emptyUser = {
  id: "",
  first_name: "",
  last_name: "",
  username: "",
  phone: "",
  display_name: ""
};

const context = {
  app: "telegram-archiver",
  ready: false,
  authorized: false,
  origin: location.origin,
  api_base: `${location.origin}/api`,
  version: "",
  sync_running: false,
  user: { ...emptyUser },
  chat: { id: "", title: "", username: "" }
};

function setAttr(element, name, value) {
  if (value === null || value === undefined || value === "") {
    element.removeAttribute(name);
    return;
  }
  element.setAttribute(name, String(value));
}

function write() {
  const root = dom.exportEl;
  const jsonEl = dom.exportJsonEl;
  if (!root) return;

  const user = context.user;
  const chat = context.chat;
  const attrs = {
    "data-ta-ready": context.ready ? "1" : "0",
    "data-ta-authorized": context.authorized ? "1" : "0",
    "data-ta-origin": context.origin,
    "data-ta-api-base": context.api_base,
    "data-ta-version": context.version,
    "data-ta-sync-running": context.sync_running ? "1" : "0",
    "data-ta-user-id": user.id,
    "data-ta-username": user.username,
    "data-ta-first-name": user.first_name,
    "data-ta-last-name": user.last_name,
    "data-ta-phone": user.phone,
    "data-ta-display-name": user.display_name,
    "data-ta-chat-id": chat.id,
    "data-ta-chat-title": chat.title,
    "data-ta-chat-username": chat.username
  };

  for (const [name, value] of Object.entries(attrs)) {
    setAttr(root, name, value);
    setAttr(document.documentElement, name, value);
  }
  setAttr(document.documentElement, "data-ta-app", "telegram-archiver");

  if (dom.appEl) setAttr(dom.appEl, "data-ta-chat-id", chat.id);
  if (dom.contactButtonEl) setAttr(dom.contactButtonEl, "data-ta-chat-id", chat.id);
  if (jsonEl) jsonEl.textContent = JSON.stringify(context);

  if (dom.accountEl) {
    if (context.authorized && user.id) {
      setAttr(dom.accountEl, "data-ta-user-id", user.id);
      setAttr(dom.accountEl, "data-ta-username", user.username);
      setAttr(dom.accountEl, "data-ta-display-name", user.display_name);
      setAttr(dom.accountEl, "data-ta-phone", user.phone);
      dom.accountEl.hidden = false;
      dom.accountEl.textContent = [
        user.display_name,
        user.username ? `@${user.username}` : "",
        user.id ? `ID ${user.id}` : ""
      ].filter(Boolean).join(" · ");
    } else {
      dom.accountEl.hidden = true;
      dom.accountEl.textContent = "";
      ["data-ta-user-id", "data-ta-username", "data-ta-display-name", "data-ta-phone"].forEach(name => {
        dom.accountEl.removeAttribute(name);
      });
    }
  }

  document.dispatchEvent(new CustomEvent("ta:export-context", { detail: context }));
}

export function setExportAuth(auth) {
  context.ready = true;
  context.authorized = Boolean(auth?.authorized);
  context.version = auth?.version || context.version;
  context.sync_running = Boolean(auth?.sync_running);
  if (auth?.user) {
    context.user = {
      id: auth.user.id ?? "",
      first_name: auth.user.first_name || "",
      last_name: auth.user.last_name || "",
      username: auth.user.username || "",
      phone: auth.user.phone || "",
      display_name: fullName(auth.user)
    };
  } else {
    context.user = { ...emptyUser };
    context.chat = { id: "", title: "", username: "" };
  }
  write();
}

export function setExportChat(chat) {
  if (!chat) {
    context.chat = { id: "", title: "", username: "" };
  } else {
    context.chat = {
      id: chat.id ?? "",
      title: chat.title || "",
      username: chat.username || ""
    };
  }
  write();
}

export function setExportSyncRunning(running) {
  context.sync_running = Boolean(running);
  write();
}
