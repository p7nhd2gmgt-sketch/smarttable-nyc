import webPush from "web-push";

const pushProviders = new Set(["disabled", "webpush", "firebase", "apns"]);

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

export function createPushService(options = {}) {
  const provider = normalizePushProvider(options.provider || process.env.PUSH_PROVIDER);
  if (provider === "webpush") {
    const service = new WebPushProvider(options);
    if (service.enabled) return service;
    return new DisabledPushProvider({ provider });
  }
  return new DisabledPushProvider({ provider });
}
