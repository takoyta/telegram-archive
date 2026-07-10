import { checkAuth, sendCode, sendPassword, showAuth, signIn } from "./auth.js";
import { clearMessageSearch, loadMore, loadMoreMedia, searchChatMessages, selectChat } from "./chat.js";
import { dom } from "./dom.js";
import {
  closeContactCard,
  closeLightbox,
  openContactCard,
  renderHistoryStatus,
  renderMediaStatus,
  setOnSelectChat
} from "./render.js";
import { state } from "./state.js";

setOnSelectChat(selectChat);

dom.messagesEl.addEventListener("scroll", () => {
  if (dom.messagesEl.scrollTop < 120) {
    loadMore().catch(error => {
      renderHistoryStatus(error.message);
    });
  }
});

dom.mediaPanelEl.addEventListener("scroll", () => {
  const distance = dom.mediaPanelEl.scrollHeight - dom.mediaPanelEl.scrollTop - dom.mediaPanelEl.clientHeight;
  if (distance < 120) {
    loadMoreMedia().catch(error => {
      renderMediaStatus(error.message);
    });
  }
});

dom.lightboxCloseEl.addEventListener("click", closeLightbox);
dom.lightboxEl.addEventListener("click", event => {
  if (event.target === dom.lightboxEl) {
    closeLightbox();
  }
});

dom.contactButtonEl.addEventListener("click", () => {
  openContactCard().catch(error => {
    dom.subtitleEl.textContent = error.message;
  });
});

dom.contactCloseEl.addEventListener("click", closeContactCard);
dom.contactModalEl.addEventListener("click", event => {
  if (event.target === dom.contactModalEl) {
    closeContactCard();
  }
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeLightbox();
    closeContactCard();
  }
});

dom.messageSearchEl.addEventListener("input", () => {
  clearTimeout(state.searchTimer);
  state.searchTimer = setTimeout(() => searchChatMessages(dom.messageSearchEl.value), 250);
});

dom.messageSearchClearEl.addEventListener("click", clearMessageSearch);

dom.messageSearchEl.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    clearMessageSearch();
  }
});

dom.authFormEl.addEventListener("submit", event => {
  event.preventDefault();
  if (!dom.passwordStepEl.classList.contains("hidden")) {
    sendPassword();
    return;
  }
  if (!dom.codeStepEl.classList.contains("hidden")) {
    signIn();
    return;
  }
  sendCode();
});

dom.sendCodeEl.addEventListener("click", () => {
  sendCode();
});

dom.signInEl.addEventListener("click", () => {
  signIn();
});

dom.sendPasswordEl.addEventListener("click", () => {
  sendPassword();
});

dom.phoneEl.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    sendCode();
  }
});

dom.codeEl.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    signIn();
  }
});

dom.passwordEl.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    sendPassword();
  }
});

checkAuth().catch(error => {
  showAuth(error.message);
});
