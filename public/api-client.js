export class SmartTableApiError extends Error {
  constructor(message, options = {}) {
    super(message || "Request failed.");
    this.name = "SmartTableApiError";
    this.status = options.status || 0;
    this.payload = options.payload || null;
  }
}

export function sessionAuthHeaders(session = null) {
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export async function requestJson(path, options = {}, sessionProvider = () => null) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...sessionAuthHeaders(sessionProvider()),
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new SmartTableApiError(payload.error || payload.message || "Request failed.", {
      status: response.status,
      payload
    });
  }
  return payload;
}
