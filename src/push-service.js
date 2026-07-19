const pushProviders = new Set(["disabled", "webpush", "firebase", "apns"]);

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

export function createPushService(options = {}) {
  const provider = normalizePushProvider(options.provider || process.env.PUSH_PROVIDER);
  if (provider === "disabled") return new DisabledPushProvider({ provider });

  const hasCredentials = Boolean(options.apiKey || process.env.PUSH_API_KEY || process.env.VAPID_PRIVATE_KEY);
  if (!hasCredentials) return new DisabledPushProvider({ provider });

  return new DisabledPushProvider({ provider });
}
