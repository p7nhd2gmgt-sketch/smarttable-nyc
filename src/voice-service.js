function clean(value = "") {
  return String(value ?? "").trim();
}

function safeErrorMessage(value = "") {
  return clean(value)
    .replace(/https?:\/\/[^\s]+/gi, "[url]")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, "[phone]")
    .slice(0, 240);
}

export function createVoiceService({
  provider = "disabled",
  twilioAccountSid = "",
  twilioAuthToken = "",
  twilioFromNumber = "",
  statusCallbackUrl = "",
  environment = "development",
  fetchImpl = fetch
} = {}) {
  const normalizedProvider = clean(provider).toLowerCase();
  const configured = normalizedProvider === "twilio"
    && Boolean(clean(twilioAccountSid) && clean(twilioAuthToken) && clean(twilioFromNumber));

  return {
    diagnostics() {
      return {
        provider: normalizedProvider || "disabled",
        configured,
        environment: clean(environment) || "development",
        status_callback_configured: Boolean(clean(statusCallbackUrl))
      };
    },

    async call({ to = "", twiml = "", idempotencyKey = "" } = {}) {
      if (!configured) {
        return { ok: false, skipped: true, code: "VOICE_PROVIDER_NOT_CONFIGURED" };
      }
      if (!/^\+[1-9]\d{7,14}$/.test(clean(to))) {
        return { ok: false, skipped: true, code: "VOICE_RECIPIENT_INVALID" };
      }
      if (!clean(twiml)) {
        return { ok: false, skipped: true, code: "VOICE_MESSAGE_MISSING" };
      }

      const body = new URLSearchParams({
        To: clean(to),
        From: clean(twilioFromNumber),
        Twiml: clean(twiml)
      });
      if (clean(statusCallbackUrl)) {
        body.set("StatusCallback", clean(statusCallbackUrl));
        body.set("StatusCallbackMethod", "POST");
        for (const event of ["initiated", "ringing", "answered", "completed"]) {
          body.append("StatusCallbackEvent", event);
        }
      }

      try {
        const response = await fetchImpl(
          `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(clean(twilioAccountSid))}/Calls.json`,
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${Buffer.from(`${clean(twilioAccountSid)}:${clean(twilioAuthToken)}`).toString("base64")}`,
              "Content-Type": "application/x-www-form-urlencoded",
              ...(clean(idempotencyKey) ? { "Idempotency-Key": clean(idempotencyKey).slice(0, 160) } : {})
            },
            body
          }
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          return {
            ok: false,
            code: clean(payload?.code || `HTTP_${response.status}`).slice(0, 80),
            message: safeErrorMessage(payload?.message || "Voice provider request failed.")
          };
        }
        return {
          ok: true,
          provider: "twilio",
          providerMessageId: clean(payload?.sid).slice(0, 120),
          status: clean(payload?.status || "queued").slice(0, 40)
        };
      } catch (error) {
        return {
          ok: false,
          code: "VOICE_PROVIDER_UNAVAILABLE",
          message: safeErrorMessage(error?.message || "Voice provider is unavailable.")
        };
      }
    }
  };
}
