const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value) {
  return String(value ?? "").trim();
}

function safeErrorMessage(error) {
  return clean(error?.message || error) || "Email delivery failed.";
}

function redactProviderPayload(payload) {
  if (!payload || typeof payload !== "object") return {};
  const safe = {};
  for (const key of ["id", "name", "message", "statusCode", "error", "code"]) {
    if (payload[key] !== undefined) safe[key] = payload[key];
  }
  return safe;
}

export function isEmailAccepted(result) {
  return Boolean(result?.accepted === true && ["queued", "sent", "delivered"].includes(result.status));
}

export function createEmailService({
  provider = "resend",
  resendApiKey = "",
  defaultFrom = "",
  defaultReplyTo = "",
  fetchImpl = globalThis.fetch
} = {}) {
  const normalizedProvider = clean(provider || "resend").toLowerCase();
  const from = clean(defaultFrom);
  const replyTo = clean(defaultReplyTo);
  const apiKey = clean(resendApiKey);

  function baseResult(message = {}, overrides = {}) {
    const result = {
      to: clean(message.to),
      from: clean(message.from || from),
      subject: clean(message.subject),
      text: message.text || "",
      html: message.html || "",
      accepted: false,
      provider: normalizedProvider,
      messageId: null,
      status: "failed",
      errorCode: null,
      errorMessage: null,
      providerResponse: null,
      delivery: "failed",
      provider_id: null,
      created_at: new Date().toISOString(),
      ...overrides
    };
    result.provider_id = result.messageId || result.provider_id || null;
    result.delivery = result.status;
    return result;
  }

  function validate(message = {}) {
    if (!EMAIL_RE.test(clean(message.to))) return "INVALID_RECIPIENT";
    if (!clean(message.subject)) return "MISSING_SUBJECT";
    if (!clean(message.text) && !clean(message.html)) return "MISSING_BODY";
    if (!clean(message.from || from)) return "MISSING_SENDER";
    return "";
  }

  async function sendEmail(message = {}) {
    const validationError = validate(message);
    if (validationError) {
      return baseResult(message, {
        errorCode: validationError,
        errorMessage: "Email message is missing required delivery fields."
      });
    }

    if (normalizedProvider !== "resend") {
      return baseResult(message, {
        errorCode: "EMAIL_PROVIDER_UNSUPPORTED",
        errorMessage: `Email provider '${normalizedProvider}' is not supported by this build.`
      });
    }

    if (!apiKey) {
      return baseResult(message, {
        errorCode: "EMAIL_PROVIDER_NOT_CONFIGURED",
        errorMessage: "RESEND_API_KEY is not configured. No email was sent."
      });
    }

    if (typeof fetchImpl !== "function") {
      return baseResult(message, {
        errorCode: "EMAIL_FETCH_UNAVAILABLE",
        errorMessage: "The runtime fetch API is unavailable for email delivery."
      });
    }

    try {
      const response = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          from: clean(message.from || from),
          to: [clean(message.to)],
          subject: clean(message.subject),
          reply_to: clean(message.replyTo || message.reply_to || replyTo) || undefined,
          html: message.html || undefined,
          text: message.text || undefined
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return baseResult(message, {
          errorCode: `RESEND_${response.status}`,
          errorMessage: clean(payload.message || payload.error) || `Resend rejected the message with HTTP ${response.status}.`,
          providerResponse: redactProviderPayload(payload)
        });
      }
      const messageId = clean(payload.id);
      return baseResult(message, {
        accepted: true,
        messageId,
        provider_id: messageId,
        status: "sent",
        delivery: "sent",
        providerResponse: redactProviderPayload(payload)
      });
    } catch (error) {
      return baseResult(message, {
        errorCode: "EMAIL_PROVIDER_REQUEST_FAILED",
        errorMessage: safeErrorMessage(error)
      });
    }
  }

  async function sendTemplatedEmail(templateRecord = {}, context = {}) {
    const replace = (value) => clean(value).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => clean(context[key]));
    return sendEmail({
      to: templateRecord.to,
      from: templateRecord.from,
      subject: replace(templateRecord.subject),
      text: replace(templateRecord.text),
      html: replace(templateRecord.html)
    });
  }

  return {
    provider: normalizedProvider,
    configured: Boolean(normalizedProvider === "resend" && apiKey),
    sendEmail,
    sendTemplatedEmail
  };
}
