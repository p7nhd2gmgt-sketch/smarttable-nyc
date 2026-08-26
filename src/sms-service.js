function clean(value = "") {
  return String(value ?? "").trim();
}

function safeErrorMessage(value = "") {
  return clean(value).replace(/[\r\n\t]+/g, " ").slice(0, 240);
}

function providerStatusFromTwilio(status = "") {
  const normalized = clean(status).toLowerCase();
  if (["queued", "accepted", "scheduled"].includes(normalized)) return "queued";
  if (["sending", "sent"].includes(normalized)) return "sent";
  if (["delivered"].includes(normalized)) return "delivered";
  if (["undelivered", "failed"].includes(normalized)) return "failed";
  return normalized || "queued";
}

export function createSmsService({
  provider = "twilio",
  twilioAccountSid = "",
  twilioAuthToken = "",
  twilioMessagingServiceSid = "",
  twilioFromNumber = "",
  statusCallbackUrl = "",
  environment = "development",
  fetchImpl = fetch
} = {}) {
  const normalizedProvider = clean(provider || "twilio").toLowerCase();
  const accountSid = clean(twilioAccountSid);
  const authToken = clean(twilioAuthToken);
  const messagingServiceSid = clean(twilioMessagingServiceSid);
  const fromNumber = clean(twilioFromNumber);
  const configured = normalizedProvider === "twilio" && Boolean(accountSid && authToken && (messagingServiceSid || fromNumber));

  return {
    provider: normalizedProvider,
    environment,
    configured,
    diagnostics() {
      return {
        provider: normalizedProvider,
        configured,
        has_account_sid: Boolean(accountSid),
        has_auth_token: Boolean(authToken),
        has_messaging_service_sid: Boolean(messagingServiceSid),
        has_from_number: Boolean(fromNumber),
        has_status_callback_url: Boolean(clean(statusCallbackUrl))
      };
    },
    async sendSms({ to, body, idempotencyKey = "", statusCallback = "" } = {}) {
      const recipient = clean(to);
      const messageBody = clean(body);
      if (!configured) {
        return {
          accepted: false,
          provider: normalizedProvider,
          messageId: null,
          status: "failed",
          errorCode: "SMS_PROVIDER_NOT_CONFIGURED",
          errorMessage: "SMS provider is not configured."
        };
      }
      if (!recipient || !messageBody) {
        return {
          accepted: false,
          provider: normalizedProvider,
          messageId: null,
          status: "failed",
          errorCode: "SMS_INVALID_MESSAGE",
          errorMessage: "SMS recipient and body are required."
        };
      }

      const params = new URLSearchParams();
      params.set("To", recipient);
      params.set("Body", messageBody);
      if (messagingServiceSid) params.set("MessagingServiceSid", messagingServiceSid);
      else params.set("From", fromNumber);
      const callback = clean(statusCallback || statusCallbackUrl);
      if (callback) params.set("StatusCallback", callback);

      const authorization = Buffer.from(`${accountSid}:${authToken}`, "utf8").toString("base64");
      let response;
      let payload = {};
      try {
        response = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
          method: "POST",
          headers: {
            authorization: `Basic ${authorization}`,
            "content-type": "application/x-www-form-urlencoded"
          },
          body: params
        });
        payload = await response.json().catch(() => ({}));
      } catch (error) {
        return {
          accepted: false,
          provider: normalizedProvider,
          messageId: null,
          status: "failed",
          errorCode: "SMS_PROVIDER_UNAVAILABLE",
          errorMessage: safeErrorMessage(error.message || "SMS provider is unavailable.")
        };
      }

      if (!response.ok) {
        return {
          accepted: false,
          provider: normalizedProvider,
          messageId: payload.sid || null,
          status: "failed",
          errorCode: clean(payload.code || response.status || "SMS_PROVIDER_REJECTED"),
          errorMessage: safeErrorMessage(payload.message || "SMS provider rejected the message."),
          providerStatus: payload.status || null
        };
      }

      return {
        accepted: true,
        provider: normalizedProvider,
        messageId: payload.sid || null,
        status: providerStatusFromTwilio(payload.status),
        errorCode: null,
        errorMessage: null,
        providerStatus: payload.status || null,
        idempotencyKey
      };
    }
  };
}
