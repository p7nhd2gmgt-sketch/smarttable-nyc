self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

const RESERVATION_ALERT_VIBRATION_PATTERN = [250, 100, 250, 100, 500];

function safeReservationAlertPayload(event) {
  if (!event.data) {
    return {
      title: "New reservation request",
      body: "Open SmartTable Partner to review the reservation.",
      url: "/partner#partner-reservations"
    };
  }
  try {
    const payload = event.data.json();
    return {
      title: payload.title || "New reservation request",
      body: payload.body || "Open SmartTable Partner to review the reservation.",
      url: payload.url || payload.deep_link || payload.data?.url || "/partner#partner-reservations",
      tag: payload.tag || payload.reservation_reference || "smarttable-reservation-alert",
      data: payload.data || payload
    };
  } catch {
    return {
      title: "New reservation request",
      body: event.data.text() || "Open SmartTable Partner to review the reservation.",
      url: "/partner#partner-reservations",
      tag: "smarttable-reservation-alert"
    };
  }
}

self.addEventListener("push", (event) => {
  const payload = safeReservationAlertPayload(event);
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
    clients.forEach((client) => {
      client.postMessage({ type: "reservation_alert", payload: payload.data || {} });
    });
    await self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      renotify: true,
      requireInteraction: true,
      vibrate: RESERVATION_ALERT_VIBRATION_PATTERN,
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      data: { url: payload.url }
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/partner#partner-reservations";
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
    const target = new URL(url, self.location.origin).href;
    for (const client of windows) {
      if ("focus" in client && new URL(client.url).origin === self.location.origin) {
        if ("navigate" in client) {
          await client.navigate(target);
        }
        await client.focus();
        client.postMessage({ type: "reservation_alert", payload: { url: target } });
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
