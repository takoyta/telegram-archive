export function formatTime(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

export function formatDateTime(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp * 1000).toLocaleString();
}

export function mediaUrl(path) {
  return "/" + path.split("/").map(encodeURIComponent).join("/");
}

export function senderName(message) {
  const parts = [message.sender_first_name, message.sender_last_name].filter(Boolean);
  return parts.join(" ") || message.sender_username || message.sender_id || "";
}

export function initials(title) {
  return String(title || "?").trim().slice(0, 1).toUpperCase() || "?";
}

export function fullName(contact) {
  const parts = [contact.first_name, contact.last_name].filter(Boolean);
  return parts.join(" ") || contact.username || contact.chat_title || contact.id;
}

export function formatBool(value) {
  if (value === null || value === undefined) return "";
  return Number(value) ? "Да" : "Нет";
}

export function editsLabel(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return `${count} правок`;
  if (mod10 === 1) return `${count} правка`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} правки`;
  return `${count} правок`;
}
