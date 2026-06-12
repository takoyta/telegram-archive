export async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    ...options
  });
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const error = await response.json();
      detail = error.detail || detail;
    } catch {
    }
    throw new Error(detail);
  }
  return response.json();
}
