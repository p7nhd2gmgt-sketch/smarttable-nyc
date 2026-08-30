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

export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export async function requestJson(path, options = {}, sessionProvider = () => null) {
  const {
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    signal: externalSignal,
    headers = {},
    ...fetchOptions
  } = options || {};
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortFromCaller();
  else externalSignal?.addEventListener?.("abort", abortFromCaller, { once: true });
  const timeout = Number(timeoutMs) > 0
    ? globalThis.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, Number(timeoutMs))
    : null;
  try {
    const response = await fetch(`/api${path}`, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...sessionAuthHeaders(sessionProvider()),
        ...headers
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
  } catch (error) {
    if (error?.name !== "AbortError") throw error;
    const code = timedOut ? "REQUEST_TIMEOUT" : "REQUEST_ABORTED";
    throw new SmartTableApiError(
      timedOut ? "SmartTable took too long to respond. Please retry." : "The request was cancelled.",
      { status: timedOut ? 504 : 0, payload: { code } }
    );
  } finally {
    if (timeout !== null) globalThis.clearTimeout(timeout);
    externalSignal?.removeEventListener?.("abort", abortFromCaller);
  }
}
