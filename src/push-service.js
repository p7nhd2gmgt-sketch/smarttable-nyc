import webPush from "web-push";

const pushProviders = new Set(["disabled", "webpush", "firebase", "apns"]);
const nativePushProviders = new Set(["disabled", "expo"]);
const expoPushTokenPattern = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/;

function clean(value = "") {
  return String(value ?? "").trim();
}

function base64UrlToBuffer(value = "") {
  const normalized = clean(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}

function safeErrorMessage(value = "") {
  return clean(value).replace(/[\r\n\t]+/g, " ").slice(0, 240);
}

function vapidKeysFromConfig(publicKey = "", privateKey = "") {
  const publicBytes = base64UrlToBuffer(publicKey);
  const privateBytes = base64UrlToBuffer(privateKey);
  if (publicBytes.length !== 65 || publicBytes[0] !== 4 || privateBytes.length !== 32) {
    return null;
  }
  return { publicBytes, privateBytes };
}


export function normalizePushProvider(value) {
  const provider = String(value || "disabled").trim().toLowerCase();
  return pushProviders.has(provider) ? provider : "disabled";
}

export function normalizeNativePushProvider(value) {
  const provider = String(value || "disabled").trim().toLowerCase();
  return nativePushProviders.has(provider) ? provider : "disabled";
}

export function isExpoPushToken(value) {
  return expoPushTokenPattern.test(clean(value));
}

export class DisabledPushProvider {
  constructor(options = {}) {
    this.provider = normalizePushProvider(options.provider);
    this.enabled = false;
  }

  getStatus() {
    return {
      provider: this.provider,
      enabled: false,
      status: "disabled",
      reason: "No push notification provider is configured."
    };
  }

  async upsertSubscription() {
    return {
      provider: this.provider,
      status: "disabled",
      subscription: null,
      message: "Push notifications are disabled until a provider is configured."
    };
  }

  async revokeSubscription() {
    return {
      provider: this.provider,
      status: "disabled",
      revoked: false
    };
  }

  async sendNotification() {
    return {
      provider: this.provider,
      status: "skipped",
      sent: false,
      reason: "Push notifications are disabled."
    };
  }
}

export class WebPushProvider {
  constructor(options = {}) {
    this.provider = "webpush";
    this.publicKey = clean(options.vapidPublicKey || process.env.VAPID_PUBLIC_KEY || "");
    this.privateKey = clean(options.vapidPrivateKey || process.env.VAPID_PRIVATE_KEY || "");
    this.subject = clean(options.vapidSubject || process.env.VAPID_SUBJECT || "mailto:support@smarttablenyc.com");
    this.enabled = Boolean(vapidKeysFromConfig(this.publicKey, this.privateKey));
  }

  getStatus() {
    return {
      provider: this.provider,
      enabled: this.enabled,
      status: this.enabled ? "configured" : "missing_vapid_keys",
      has_public_key: Boolean(this.publicKey),
      has_private_key: Boolean(this.privateKey),
      has_subject: Boolean(this.subject),
      vapid_public_key: this.publicKey || ""
    };
  }

  async upsertSubscription(subscription = {}) {
    if (!this.enabled) {
      return {
        provider: this.provider,
        status: "disabled",
        subscription: null,
        message: "Web Push is disabled until valid VAPID keys are configured."
      };
    }
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return {
        provider: this.provider,
        status: "failed",
        subscription: null,
        message: "Push subscription endpoint and keys are required."
      };
    }
    return {
      provider: this.provider,
      status: "active",
      subscription
    };
  }

  async revokeSubscription() {
    return {
      provider: this.provider,
      status: "revoked",
      revoked: true
    };
  }

  async sendNotification({ subscription, title, body, data = {}, tag = "", ttl = 300 } = {}) {
    if (!this.enabled) {
      return {
        provider: this.provider,
        status: "skipped",
        sent: false,
        errorCode: "PUSH_PROVIDER_NOT_CONFIGURED",
        errorMessage: "Web Push provider is not configured."
      };
    }
    const endpoint = clean(subscription?.endpoint || "");
    if (!endpoint) {
      return {
        provider: this.provider,
        status: "failed",
        sent: false,
        errorCode: "PUSH_ENDPOINT_MISSING",
        errorMessage: "Push subscription endpoint is missing."
      };
    }
    const payload = {
      title: clean(title || "SmartTable"),
      body: clean(body || ""),
      tag: clean(tag || data?.reservation_id || "smarttable-reservation-alert"),
      data: data && typeof data === "object" ? data : {}
    };
    try {
      const response = await webPush.sendNotification(subscription, JSON.stringify(payload), {
        vapidDetails: {
          subject: this.subject,
          publicKey: this.publicKey,
          privateKey: this.privateKey
        },
        TTL: Math.max(0, Number(ttl) || 300),
        urgency: "high",
        contentEncoding: "aes128gcm"
      });
      return {
        provider: this.provider,
        status: "sent",
        sent: true,
        httpStatus: response?.statusCode || 201
      };
    } catch (error) {
      const httpStatus = Number(error?.statusCode || 0) || null;
      const expired = httpStatus === 404 || httpStatus === 410;
      return {
        provider: this.provider,
        status: expired ? "expired" : "failed",
        sent: false,
        httpStatus,
        errorCode: expired
          ? "PUSH_SUBSCRIPTION_EXPIRED"
          : httpStatus
            ? "PUSH_PROVIDER_REJECTED"
            : "PUSH_PROVIDER_UNAVAILABLE",
        errorMessage: safeErrorMessage(error.message || "Push provider is unavailable.")
      };
    }
  }
}

export class DisabledNativePushProvider {
  constructor(options = {}) {
    this.provider = normalizeNativePushProvider(options.provider);
    this.enabled = false;
    this.reason = clean(options.reason || "No native push notification provider is configured.");
  }

  getStatus() {
    return {
      provider: this.provider,
      enabled: false,
      status: "disabled",
      reason: this.reason,
      accepts_native_tokens: false,
      native_token_endpoint: "/api/mobile/push-devices"
    };
  }

  async sendNotification() {
    return {
      provider: this.provider,
      status: "skipped",
      sent: false,
      errorCode: "NATIVE_PUSH_PROVIDER_NOT_CONFIGURED",
      errorMessage: this.reason
    };
  }
}

/** Expo Push Service adapter used only for native iOS/Android notifications. */
export class ExpoPushProvider {
  constructor(options = {}) {
    this.provider = "expo";
    this.endpoint = clean(options.endpoint || "https://exp.host/--/api/v2/push/send");
    this.receiptsEndpoint = clean(options.receiptsEndpoint || "https://exp.host/--/api/v2/push/getReceipts");
    this.accessToken = clean(options.accessToken || "");
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.enabled = options.enabled !== false && Boolean(this.fetchImpl);
  }

  getStatus() {
    return {
      provider: this.provider,
      enabled: this.enabled,
      status: this.enabled ? "configured" : "disabled",
      accepts_native_tokens: this.enabled,
      native_token_endpoint: "/api/mobile/push-devices"
    };
  }

  async sendNotification({ token, title, body, data = {}, channelId = "smarttable-updates", ttl = 300 } = {}) {
    if (!this.enabled) return new DisabledNativePushProvider({ provider: "expo" }).sendNotification();
    if (!isExpoPushToken(token)) {
      return {
        provider: this.provider,
        status: "failed",
        sent: false,
        errorCode: "INVALID_EXPO_PUSH_TOKEN",
        errorMessage: "The native push token is invalid."
      };
    }
    const headers = { accept: "application/json", "content-type": "application/json" };
    if (this.accessToken) headers.authorization = `Bearer ${this.accessToken}`;
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          to: clean(token),
          title: clean(title || "SmartTable").slice(0, 120),
          body: clean(body || "").slice(0, 240),
          data: data && typeof data === "object" && !Array.isArray(data) ? data : {},
          sound: "default",
          priority: "high",
          channelId: clean(channelId || "smarttable-updates"),
          ttl: Math.max(0, Math.min(86_400, Number(ttl) || 300))
        })
      });
      const payload = await response.json().catch(() => ({}));
      const ticket = Array.isArray(payload?.data) ? payload.data[0] : payload?.data;
      const errorCode = clean(ticket?.details?.error || payload?.errors?.[0]?.code || "");
      const expired = errorCode === "DeviceNotRegistered";
      if (!response.ok || ticket?.status !== "ok") {
        return {
          provider: this.provider,
          status: expired ? "expired" : "failed",
          sent: false,
          httpStatus: response.status,
          errorCode: expired ? "PUSH_DEVICE_NOT_REGISTERED" : errorCode || "EXPO_PUSH_REJECTED",
          errorMessage: safeErrorMessage(ticket?.message || payload?.errors?.[0]?.message || "Expo Push Service rejected the notification.")
        };
      }
      return {
        provider: this.provider,
        status: "sent",
        sent: true,
        httpStatus: response.status,
        provider_message_id: clean(ticket.id).slice(0, 160) || null
      };
    } catch (error) {
      return {
        provider: this.provider,
        status: "failed",
        sent: false,
        errorCode: "EXPO_PUSH_UNAVAILABLE",
        errorMessage: safeErrorMessage(error?.message || "Expo Push Service is unavailable.")
      };
    }
  }

  async getReceipts(ids = []) {
    const receiptIds = [...new Set((ids || []).map(clean).filter(Boolean))].slice(0, 1000);
    if (!this.enabled || !receiptIds.length) return { provider: this.provider, receipts: {} };
    const headers = { accept: "application/json", "content-type": "application/json" };
    if (this.accessToken) headers.authorization = `Bearer ${this.accessToken}`;
    try {
      const response = await this.fetchImpl(this.receiptsEndpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ ids: receiptIds })
      });
      const payload = await response.json().catch(() => ({}));
      return { provider: this.provider, receipts: response.ok && payload?.data ? payload.data : {} };
    } catch {
      return { provider: this.provider, receipts: {} };
    }
  }
}

export function createPushService(options = {}) {
  const provider = normalizePushProvider(options.provider || process.env.PUSH_PROVIDER);
  if (provider === "webpush") {
    const service = new WebPushProvider(options);
    if (service.enabled) return service;
    return new DisabledPushProvider({ provider });
  }
  return new DisabledPushProvider({ provider });
}

export function createMobilePushService(options = {}) {
  const provider = normalizeNativePushProvider(options.provider || process.env.MOBILE_PUSH_PROVIDER);
  if (provider === "expo" && options.enabled !== false) return new ExpoPushProvider(options);
  return new DisabledNativePushProvider({ provider, reason: options.reason });
}
