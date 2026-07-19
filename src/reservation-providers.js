const requiredReservationLabels = [
  "Requires provider API access",
  "Requires restaurant authorization",
  "Requires approved integration partnership"
];

export const reservationProviderCatalog = [
  {
    provider: "opentable",
    display_name: "OpenTable",
    category: "reservation",
    status: "requires_integration",
    labels: requiredReservationLabels,
    capabilities: ["reservations", "guests", "availability", "webhooks"],
    api_access_status: "not_connected"
  },
  {
    provider: "resy",
    display_name: "Resy",
    category: "reservation",
    status: "requires_integration",
    labels: requiredReservationLabels,
    capabilities: ["reservations", "guests", "availability", "webhooks"],
    api_access_status: "not_connected"
  },
  {
    provider: "sevenrooms",
    display_name: "SevenRooms",
    category: "reservation",
    status: "requires_integration",
    labels: requiredReservationLabels,
    capabilities: ["reservations", "guests", "availability", "webhooks"],
    api_access_status: "not_connected"
  },
  {
    provider: "tock",
    display_name: "Tock",
    category: "reservation",
    status: "requires_integration",
    labels: requiredReservationLabels,
    capabilities: ["reservations", "guests", "availability", "webhooks"],
    api_access_status: "not_connected"
  },
  {
    provider: "google_reserve",
    display_name: "Google Reserve",
    category: "reservation",
    status: "requires_integration",
    labels: requiredReservationLabels,
    capabilities: ["reservations", "availability"],
    api_access_status: "not_connected"
  },
  {
    provider: "weather_api",
    display_name: "Weather API",
    category: "weather",
    status: "requires_integration",
    labels: ["Requires weather provider API key"],
    capabilities: ["forecast", "rain", "temperature", "severe_weather"],
    api_access_status: "not_connected"
  },
  {
    provider: "local_events_api",
    display_name: "Local events API",
    category: "events",
    status: "requires_integration",
    labels: ["Requires events provider API key"],
    capabilities: ["events", "venues", "attendance_estimates"],
    api_access_status: "not_connected"
  }
];

function providerMeta(provider) {
  const key = String(provider || "generic").toLowerCase().replace(/\s+/g, "_");
  return reservationProviderCatalog.find((item) => item.provider === key)
    || {
      provider: key,
      display_name: key.replaceAll("_", " "),
      category: "reservation",
      status: "requires_integration",
      labels: requiredReservationLabels,
      capabilities: ["reservations", "guests", "availability"],
      api_access_status: "not_connected"
    };
}

function reservationIdFrom(row = {}) {
  return row.external_reservation_id
    || row.id
    || row.reservation_id
    || row.confirmation_number
    || `manual-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function dateTimeFrom(row = {}) {
  const date = row.reservation_date || row.date || row.visit_date || "";
  const time = row.reservation_time || row.time || row.start_time || "";
  if (!date && !time) return null;
  const value = `${date}T${time || "00:00"}`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function cleanStatus(value) {
  const status = String(value || "confirmed").trim().toLowerCase().replace(/\s+/g, "_");
  if (["pending", "confirmed", "declined", "cancelled", "canceled", "no_show", "completed"].includes(status)) {
    return status === "canceled" ? "cancelled" : status;
  }
  return "confirmed";
}

export class GenericReservationAdapter {
  constructor(options = {}) {
    this.meta = providerMeta(options.provider || "generic_reservation");
    this.connection = options.connection || {};
  }

  connectProvider(input = {}) {
    return {
      provider: this.meta.provider,
      status: "requires_integration",
      connection_status: "not_connected",
      restaurant_id: input.restaurant_id || null,
      labels: this.meta.labels,
      message: "Mock adapter only. Store OAuth/API secrets in encrypted secret storage before enabling live sync."
    };
  }

  disconnectProvider() {
    return {
      provider: this.meta.provider,
      status: "disconnected",
      sync_status: "disabled"
    };
  }

  syncReservations() {
    return {
      provider: this.meta.provider,
      sync_status: "requires_provider_api_access",
      imported_count: 0,
      labels: this.meta.labels
    };
  }

  syncGuests() {
    return {
      provider: this.meta.provider,
      sync_status: "requires_provider_api_access",
      imported_count: 0,
      labels: this.meta.labels
    };
  }

  syncAvailability() {
    return {
      provider: this.meta.provider,
      sync_status: "requires_provider_api_access",
      imported_count: 0,
      labels: this.meta.labels
    };
  }

  importReservation(row = {}) {
    return this.mapExternalReservation(row);
  }

  mapExternalReservation(row = {}) {
    const provider = this.meta.provider;
    return {
      provider,
      external_reservation_id: String(reservationIdFrom(row)),
      guest_external_id: row.guest_external_id || row.guest_id || null,
      guest_name: row.guest_name || row.name || row.customer_name || "",
      guest_email: row.guest_email || row.email || "",
      guest_phone: row.guest_phone || row.phone || "",
      party_size: Number(row.party_size || row.guests || row.covers || 0) || null,
      reservation_start: dateTimeFrom(row),
      reservation_end: row.reservation_end || null,
      status: cleanStatus(row.status),
      notes: row.notes || row.special_requests || "",
      source: provider,
      raw_payload: row
    };
  }

  handleWebhook(event = {}) {
    return {
      provider: this.meta.provider,
      accepted: false,
      status: "requires_live_webhook_secret",
      event_type: event.type || "unknown"
    };
  }

  getSyncStatus() {
    return {
      provider: this.meta.provider,
      status: this.connection.status || "not_connected",
      sync_status: "requires_provider_api_access",
      last_sync_at: this.connection.last_sync_at || null,
      imported_summary: this.connection.imported_summary || {}
    };
  }

  getProviderErrors() {
    return this.connection.errors || [];
  }
}

export class ResyAdapter extends GenericReservationAdapter {
  constructor(options = {}) {
    super({ ...options, provider: "resy" });
  }
}

export class OpenTableAdapter extends GenericReservationAdapter {
  constructor(options = {}) {
    super({ ...options, provider: "opentable" });
  }
}

export class SevenRoomsAdapter extends GenericReservationAdapter {
  constructor(options = {}) {
    super({ ...options, provider: "sevenrooms" });
  }
}

export class TockAdapter extends GenericReservationAdapter {
  constructor(options = {}) {
    super({ ...options, provider: "tock" });
  }
}

export function createReservationProvider(provider, options = {}) {
  const key = String(provider || "generic").toLowerCase().replace(/\s+/g, "_");
  if (key === "resy") return new ResyAdapter(options);
  if (key === "opentable") return new OpenTableAdapter(options);
  if (key === "sevenrooms") return new SevenRoomsAdapter(options);
  if (key === "tock") return new TockAdapter(options);
  return new GenericReservationAdapter({ ...options, provider: key });
}
