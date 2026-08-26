from __future__ import annotations

import datetime as dt
import json
import os
import re
import textwrap
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
DOCS_DIR = ROOT / "docs"
MD_PATH = DOCS_DIR / "SmartTable-Documentation.md"
PDF_PATH = DOCS_DIR / "SmartTable-Documentation.pdf"

PAGE_W, PAGE_H = A4
MARGIN_X = 46
MARGIN_TOP = 58
MARGIN_BOTTOM = 52
CONTENT_W = PAGE_W - (MARGIN_X * 2)
TODAY = dt.date.today().isoformat()


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def register_fonts() -> tuple[str, str, str]:
    regular = "Helvetica"
    bold = "Helvetica-Bold"
    mono = "Courier"
    candidates = [
        (
            Path("C:/Windows/Fonts/arial.ttf"),
            Path("C:/Windows/Fonts/arialbd.ttf"),
            Path("C:/Windows/Fonts/consola.ttf"),
        ),
        (
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"),
        ),
    ]
    for reg, bd, mono_path in candidates:
        if reg.exists() and bd.exists():
            pdfmetrics.registerFont(TTFont("SmartDoc", str(reg)))
            pdfmetrics.registerFont(TTFont("SmartDoc-Bold", str(bd)))
            regular = "SmartDoc"
            bold = "SmartDoc-Bold"
            if mono_path.exists():
                pdfmetrics.registerFont(TTFont("SmartDoc-Mono", str(mono_path)))
                mono = "SmartDoc-Mono"
            break
    return regular, bold, mono


FONT, FONT_BOLD, FONT_MONO = register_fonts()


def clean_space(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip())


def parse_package() -> dict:
    return json.loads(read_text(ROOT / "package.json"))


def parse_env_vars() -> list[str]:
    names: list[str] = []
    for line in read_text(ROOT / ".env.example").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        names.append(line.split("=", 1)[0])
    return names


def parse_endpoints() -> list[dict]:
    src = read_text(ROOT / "src" / "app-core.js")
    rows: list[dict] = []
    for line in src.splitlines():
        if "pathname ===" not in line and "pathname ===" not in line:
            continue
        match = re.search(r'pathname === "([^"]+)"', line)
        if not match:
            continue
        route = match.group(1)
        methods = []
        for method in ["GET", "POST", "PATCH", "DELETE"]:
            if f'method === "{method}"' in line:
                methods.append(method)
        if "pathname ===" in line and not methods:
            methods.append("ANY")
        rows.append(
            {
                "route": route,
                "methods": ", ".join(methods),
                "audience": route_audience(route),
                "status": route_status(route),
            }
        )
    seen = {}
    for row in rows:
        key = row["route"]
        if key not in seen:
            seen[key] = row
        else:
            current = set(seen[key]["methods"].split(", "))
            current.update(row["methods"].split(", "))
            seen[key]["methods"] = ", ".join(sorted(current))
    return sorted(seen.values(), key=lambda item: item["route"])


def route_audience(route: str) -> str:
    if route.startswith("/admin"):
        return "Admin / Super Admin"
    if route.startswith("/partner") or route.startswith("/restaurant"):
        return "Partner / Admin"
    if route.startswith("/ai"):
        return "Guest / Partner / Admin, depending on endpoint"
    if route.startswith("/auth"):
        return "Public / authenticated"
    if route.startswith("/public"):
        return "Public"
    if route.startswith("/guest"):
        return "Guest"
    if route.startswith("/integrations"):
        return "Partner / Admin"
    if route.startswith("/privacy"):
        return "Public / Admin"
    return "System / Public"


def route_status(route: str) -> str:
    if route.startswith("/ai"):
        if route in ["/ai/calendar"]:
            return "Disabled"
        return "Beta / demo-aware"
    if route.startswith("/admin/billing") or route.startswith("/admin/integrations"):
        return "Beta / requires integration"
    if route.startswith("/public") or route == "/reservations":
        return "Working"
    if route.startswith("/partner") or route.startswith("/admin"):
        return "Working / beta"
    if route.startswith("/system"):
        return "Working"
    return "Working"


def parse_feature_registry() -> list[dict]:
    src = read_text(ROOT / "src" / "app-core.js")
    block_match = re.search(
        r"const platformFeatureRegistry = \{([\s\S]*?)\n\};\n\nfunction normalizeLanguage",
        src,
    )
    if not block_match:
        return []
    block = block_match.group(1)
    entries = []
    for match in re.finditer(r'"([^"]+)": \{([\s\S]*?)\n  \}', block):
        key = match.group(1)
        body = match.group(2)
        label = re.search(r'label: "([^"]+)"', body)
        status = re.search(r'status: "([^"]+)"', body)
        modes = re.search(r"modes: \[([^\]]+)\]", body)
        audiences = re.search(r"audiences: \[([^\]]+)\]", body)
        entries.append(
            {
                "key": key,
                "label": label.group(1) if label else key,
                "status": status.group(1) if status else "unknown",
                "modes": parse_array_literal(modes.group(1) if modes else ""),
                "audiences": parse_array_literal(audiences.group(1) if audiences else ""),
            }
        )
    return entries


def parse_array_literal(value: str) -> str:
    items = re.findall(r'"([^"]+)"', value)
    return ", ".join(items)


def parse_database() -> dict:
    migrations = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
    tables: dict[str, str] = {}
    views: dict[str, str] = {}
    indexes: set[str] = set()
    policies: set[str] = set()
    types: dict[str, str] = {}
    for path in migrations:
        text = read_text(path)
        for table in re.findall(r"create table if not exists public\.([a-zA-Z0-9_]+)", text, flags=re.I):
            tables.setdefault(table, path.name)
        for view in re.findall(r"create or replace view public\.([a-zA-Z0-9_]+)", text, flags=re.I):
            views.setdefault(view, path.name)
        for index in re.findall(r"create index if not exists ([a-zA-Z0-9_]+)", text, flags=re.I):
            indexes.add(index)
        for policy in re.findall(r"create policy ([a-zA-Z0-9_]+)", text, flags=re.I):
            policies.add(policy)
        for type_name in re.findall(r"create type public\.([a-zA-Z0-9_]+)", text, flags=re.I):
            types.setdefault(type_name, path.name)
    return {
        "migrations": [path.name for path in migrations],
        "tables": dict(sorted(tables.items())),
        "views": dict(sorted(views.items())),
        "indexes": len(indexes),
        "policies": len(policies),
        "types": dict(sorted(types.items())),
    }


def parse_locale_stats() -> list[dict]:
    rows = []
    for lang in ["en", "es", "hu"]:
        data = json.loads(read_text(ROOT / "public" / "locales" / f"{lang}.json"))
        rows.append(
            {
                "language": lang,
                "top_level_keys": len(data),
                "literal_overrides": len(data.get("_literals", {})),
                "phrase_overrides": len(data.get("_phrases", {})),
            }
        )
    return rows


def parse_current_settings() -> dict:
    path = ROOT / "data" / "app-settings.json"
    if not path.exists():
        return {}
    data = json.loads(read_text(path))
    return {
        "platform_mode": data.get("platform_mode"),
        "ai_demo_visibility": data.get("ai_demo_visibility"),
        "show_ai_mode_badge": data.get("show_ai_mode_badge"),
    }


def collect_repo_facts() -> dict:
    package = parse_package()
    database = parse_database()
    return {
        "package": package,
        "scripts": package.get("scripts", {}),
        "env_vars": parse_env_vars(),
        "endpoints": parse_endpoints(),
        "features": parse_feature_registry(),
        "database": database,
        "locale_stats": parse_locale_stats(),
        "settings": parse_current_settings(),
        "migration_count": len(database["migrations"]),
        "source_files": [
            "server.js",
            "api/index.js",
            "api/[...path].js",
            "src/app-core.js",
            "src/reservation-providers.js",
            "public/app.js",
            "public/partner-ai-mock-data.js",
            "public/locales/en.json",
            "public/locales/es.json",
            "public/locales/hu.json",
            "supabase/migrations/*.sql",
        ],
    }


def build_markdown(facts: dict) -> str:
    endpoints = facts["endpoints"]
    features = facts["features"]
    database = facts["database"]
    env_vars = facts["env_vars"]
    locale_stats = facts["locale_stats"]
    settings = facts["settings"]
    endpoint_rows = "\n".join(
        f"| `{item['methods']}` | `{item['route']}` | {item['audience']} | {item['status']} |"
        for item in endpoints
    )
    feature_rows = "\n".join(
        f"| `{item['key']}` | {item['label']} | {item['modes']} | {item['audiences']} | {item['status']} |"
        for item in features
    )
    table_rows = "\n".join(
        f"| `{name}` | {migration} | {database_table_purpose(name)} |"
        for name, migration in database["tables"].items()
    )
    locale_rows = "\n".join(
        f"| {row['language']} | {row['top_level_keys']} | {row['literal_overrides']} | {row['phrase_overrides']} |"
        for row in locale_stats
    )
    env_rows = "\n".join(f"| `{name}` | {env_purpose(name)} |" for name in env_vars)
    migration_rows = "\n".join(f"- `{name}`" for name in database["migrations"])
    md = f"""# SmartTable Documentation

Generated: {TODAY}

This document was generated from the current SmartTable repository. It separates working, partial, demo, disabled, and planned features, and intentionally omits passwords, API keys, tokens, private data, and production credentials.

## Table of Contents

1. [Project Overview](#project-overview)
2. [Feature Status Summary](#feature-status-summary)
3. [Platform Modes](#platform-modes)
4. [User Functions](#user-functions)
5. [Architecture](#architecture)
6. [Folder Structure](#folder-structure)
7. [Frontend Route Structure and Redirects](#frontend-route-structure-and-redirects)
8. [SEO, Mobile, and Security Cleanup](#seo-mobile-and-security-cleanup)
9. [Reservation Integration Boundaries and POS Ban](#reservation-integration-boundaries-and-pos-ban)
10. [Subdomain Configuration](#subdomain-configuration)
11. [Database](#database)
12. [API Routes](#api-routes)
13. [Authentication and Permissions](#authentication-and-permissions)
14. [Reservation Flow](#reservation-flow)
15. [Feature Registry](#feature-registry)
16. [Language Support](#language-support)
17. [Environment Variables](#environment-variables)
18. [Local Setup](#local-setup)
19. [Deployment](#deployment)
20. [Testing](#testing)
21. [Known Issues](#known-issues)
22. [Future Roadmap](#future-roadmap)
23. [Scale Architecture Readiness](#scale-architecture-readiness)

## Project Overview

SmartTable is a discounted restaurant reservation marketplace with a static browser UI, a Node HTTP/API layer, Supabase-ready PostgreSQL migrations, demo-mode fallback data, Resend-ready transactional emails, partner/admin dashboards, and an AI Concierge mode that is gated by a platform mode and feature registry.

The current project can run locally without Supabase. In that case it uses in-memory/demo data and local `data/app-settings.json` for platform settings. With Supabase environment variables configured, API calls use Supabase Auth, PostgreSQL, Storage, and RLS-backed tables.

SmartTable integrates with reservation systems only. It does not connect to restaurant POS systems or access restaurant payment and transaction data.

Current persisted platform setting:

| Setting | Current value |
| --- | --- |
| `platform_mode` | `{settings.get('platform_mode', 'unknown')}` |
| `ai_demo_visibility` | `{settings.get('ai_demo_visibility', 'unknown')}` |
| `show_ai_mode_badge` | `{settings.get('show_ai_mode_badge', 'unknown')}` |

## Feature Status Summary

| Status | What it means in this codebase |
| --- | --- |
| Working | Frontend, API route, and data flow exist. In local mode it may use demo storage; in production it expects Supabase/Resend where appropriate. |
| Partial / Beta | Tables and UI/API are present, but the feature needs more production hardening, volume, or operational workflow. |
| Demo only | Deterministic mock/demo UI or local data exists. It must not be presented as live intelligence. |
| Disabled | Feature is intentionally unavailable or hidden by feature registry status. |
| Planned / Requires integration | Schema or placeholders exist, but live provider/API access is not connected. |

### Working

- Public restaurant/offer listing using `/api/public/offers`.
- Guest reservation request creation using `/api/reservations`.
- Admin management routes for restaurants, offers, reservations, content, notifications, reviews, and stats.
- Partner profile, offer, reservation, storage-signing, stats, and feedback routes.
- Platform Mode settings with Super Admin-only write access.
- English, Spanish, and Hungarian locale files.

### Partial / Beta

- Restaurant onboarding/profile editing and partner dashboard.
- Review moderation, post-visit feedback, photo reward submissions, and loyalty points.
- Integration Hub, CSV/manual reservation import, billing foundation, monitoring/error logs, privacy request structures.
- AI recommendation/action history and demand score structures.

### Demo only

- AI Advisor-style deterministic responses and mock analytics in `public/partner-ai-mock-data.js`.
- AI Concierge and Partner AI Demand UI when `platform_mode=ai_concierge` and `ai_demo_visibility=true`.

### Disabled

- Calendar sync is registered as disabled in the feature registry.

### Planned / Requires integration

- OpenTable, Resy, SevenRooms, Tock, Google Reserve, approved reservation APIs, weather, local events, Stripe billing, OpenAI service layer, vector database, and live image recognition.

## Platform Modes

SmartTable has two global modes in `src/app-core.js` and `data/app-settings.json`:

- `basic`: default mode. Shows the non-AI discounted restaurant reservation marketplace.
- `ai_concierge`: allows AI Concierge navigation and AI sections when the feature registry permits them.

AI demo visibility is separate from platform mode. Demo features only appear when:

1. platform mode is `ai_concierge`;
2. `ai_demo_visibility` is true;
3. the feature has status `demo`;
4. the audience and permissions match.

The Super Admin can change mode through `/api/admin/settings/platform-mode`. Regular admins can read the mode but cannot change it.

## User Functions

### Guest

- Browse restaurant cards and active offers.
- Filter/sort offer listings in the browser UI.
- Open restaurant details and reservation modal.
- Submit reservation request with contact info, party size, date/time, and notes.
- Follow/favorite restaurants by email.
- Submit reviews and post-visit/photo reward feedback.
- Use Hungarian, English, or Spanish UI.
- Access AI Concierge only in AI mode and only when the feature is visible.

### Restaurant Partner

- Log in and view only linked restaurant data.
- Edit restaurant profile fields and media URLs.
- Create, edit, pause/expire/delete offers.
- View reservations/leads.
- Accept, reject, cancel, complete, no-show reservations and add notes.
- View stats, post-visit feedback, integrations/imports, and AI Demand entry when enabled.

### Admin

- Manage restaurants, partners, offers, reservations, reviews, public content, notifications, feature flags, integrations, billing foundation, monitoring, privacy requests, and statistics.
- View current platform mode.
- Regular admin cannot switch global platform mode.

### Super Admin

- Has `super_admin` role support in the app profile model.
- Can switch BASIC and AI_CONCIERGE mode.
- Can enable AI Demo Visibility and public AI mode badge.
- Can impersonate/view as partner through `/api/admin/impersonate-partner`.
- Can see AI preview controls when AI admin controls are visible.

## Architecture

```mermaid
flowchart LR
  Browser[Static browser app] --> API[Node API handler]
  API --> Demo[Demo in-memory store]
  API --> Supabase[Supabase Auth + PostgreSQL + Storage]
  API --> Resend[Resend email provider]
  API --> ProviderAdapters[Reservation provider adapters]
  Supabase --> RLS[Row Level Security]
```

Runtime pieces:

- `server.js` serves static files from `public/` and forwards `/api/*` requests to `handleApiRequest`.
- `api/index.js` is the Vercel serverless entry point.
- `src/app-core.js` contains route handling, demo fallback data, Supabase access, email sending, feature registry, permissions, and business logic.
- `src/reservation-providers.js` contains generic and provider-specific mock adapters for future reservation integrations.
- `public/app.js` contains the single-page browser UI.

## Folder Structure

| Path | Purpose |
| --- | --- |
| `api/` | Vercel API entry files. |
| `data/app-settings.json` | Local demo persistence for Platform Mode settings. |
| `public/` | Static frontend, styles, images, locale files, manifest, robots, sitemap. |
| `scripts/` | Project checks and documentation generation. |
| `src/` | Backend core and reservation provider abstraction. |
| `supabase/migrations/` | PostgreSQL schema, views, RLS policies, seeds, and platform settings. |
| `backups/` | Manual/autosave snapshots. Not part of runtime source. |

Active source files documented:

{chr(10).join(f"- `{item}`" for item in facts["source_files"])}

## Frontend Route Structure and Redirects

The browser app is a single-page application with shared backend, shared auth, shared API, shared database, shared translations, and shared platform settings. It does not create a second guest backend or a second guest auth system.

### Guest public routes

- `/`
- `/restaurants`
- `/restaurants/:slug`
- `/offers`
- `/signup`
- `/login`
- `/forgot-password`
- `/reset-password`
- `/terms`
- `/privacy`
- `/contact`
- `/help`

### Protected guest routes

- `/account`
- `/account/reservations`
- `/account/favorites`
- `/account/profile`
- `/account/preferences`
- `/account/notifications`
- `/account/reviews`
- `/account/security`

### Partner routes

- `/partner`
- `/partner/offers`
- `/partner/reservations`
- `/partner/profile`
- `/partner/analytics`
- `/partner/settings`
- `/partner/ai-demand` when AI_CONCIERGE visibility allows it

### Admin routes

- `/admin`
- `/admin/restaurants`
- `/admin/offers`
- `/admin/users`
- `/admin/notifications`
- `/admin/content`
- `/admin/platform-settings`
- `/admin/ai-controls` when AI_CONCIERGE visibility allows it

### Compatibility and redirects

Direct URL refreshes are supported by the server's SPA fallback. Existing hash routes such as `#guest-signup`, `#partner-ai-demand`, and `#admin-ai-controls` remain compatibility aliases for visible navigation. Old guest URLs should either keep working through the SPA fallback or route to the closest current section; do not remove a public route without a redirect/alias.

## SEO, Mobile, and Security Cleanup

Public guest pages now have route-aware SEO metadata in the server and client:

- unique titles and meta descriptions for home, restaurants, offers, restaurant detail, signup, terms, privacy, and contact/help routes;
- canonical URL updates;
- Open Graph title, description, and URL updates;
- dynamic `robots.txt` and `sitemap.xml` support;
- static `public/robots.txt` and `public/sitemap.xml` fallback files;
- noindex handling for partner, admin, restaurant dashboard, private account, login/reset, and post-visit upload routes.

Responsive cleanup covers narrow phone widths, modal containment, signup option grids, account/dashboard cards, filter rows, and touch-friendly 44px controls. The public API response for offers removes private/internal fields such as restaurant email, owner IDs, partner notes, admin notes, roles, permissions, tokens, and secrets.

Security headers are applied by the local Node server:

- `x-content-type-options: nosniff`
- `x-frame-options: DENY`
- `referrer-policy: strict-origin-when-cross-origin`
- `permissions-policy: camera=(), microphone=(), payment=()`

## Reservation Integration Boundaries and POS Ban

SmartTable integrates with reservation systems only. It does not connect to restaurant POS systems or access restaurant payment and transaction data.

Supported future integration boundary:

- Resy
- OpenTable
- SevenRooms
- Tock
- Google Reserve
- approved restaurant reservation APIs
- CSV/manual reservation import when provider API access is unavailable

Explicitly not supported:

- Toast POS
- Square POS
- Clover
- Lightspeed
- Oracle MICROS
- TouchBistro
- restaurant payment, card, order, item-level sales, inventory, cash register, employee sales, tip, refund, or settlement data

AI and analytics may use SmartTable and approved reservation-platform data only: reservation count, available times, table availability, party size, accepted/declined/cancelled/no-show status when supplied, historical booking patterns, capacity supplied by partner, active offers, conversions, searches, clicks, favorites, ratings, feedback, events, weather, and traffic when separately integrated.

## Subdomain Configuration

The current app can be deployed as one shared application behind different domains or subdomains. The frontend surfaces stay separate in routing, but all surfaces use the same backend/API/database/auth.

Recommended deployment mapping:

| Host | Route target |
| --- | --- |
| `smarttable.com` | Guest marketplace `/` |
| `www.smarttable.com` | Guest marketplace `/` |
| `partners.smarttable.com` | `/partner` or a rewrite to `/partner` |
| `admin.smarttable.com` | `/admin` or a rewrite to `/admin` |

Set `PUBLIC_BASE_URL` to the primary public guest URL used in emails and canonical links. Keep partner/admin subdomain access protected by server-side auth and role checks.

## Database

The repository contains {facts["migration_count"]} Supabase migrations, {len(database["tables"])} unique tables, {len(database["views"])} unique views, {database["indexes"]} indexes, and {database["policies"]} unique policies.

### Tables

| Table | First migration | Purpose |
| --- | --- | --- |
{table_rows}

### Views

{chr(10).join(f"- `{name}` - first defined in `{migration}`" for name, migration in database["views"].items())}

### Enum types

{chr(10).join(f"- `{name}` - first defined in `{migration}`" for name, migration in database["types"].items())}

### Migration files

{migration_rows}

## API Routes

The app exposes {len(endpoints)} distinct backend route paths through `/api/*`.

| Methods | Route | Audience | Status |
| --- | --- | --- | --- |
{endpoint_rows}

## Authentication and Permissions

Authentication uses Supabase Auth when configured. In local/demo mode, the app uses seeded demo users in memory; this documentation intentionally omits demo passwords.

Implemented role concepts:

- `super_admin`: can switch platform mode and impersonate partners.
- `admin`: can manage platform data but cannot switch platform mode.
- `partner` / `restaurant`: manages only the linked restaurant and its offers/reservations.
- `guest`: optional authenticated guest; anonymous reservations are also supported.

Permission checks are centralized through `requireProfile(headers, roles)` in `src/app-core.js`. Partner-scoped reads/writes use the linked `restaurant_id` or `owner_user_id`. Supabase migrations enable RLS and define scoped policies for core and expansion tables.

## Reservation Flow

```mermaid
sequenceDiagram
  participant Guest
  participant API
  participant Restaurant
  participant Email
  Guest->>API: POST /api/reservations
  API->>API: validate offer and capacity
  API->>API: create pending reservation
  API->>Email: guest request email
  API->>Email: restaurant notification
  Restaurant->>API: PATCH partner/admin reservation status
  API->>Email: accepted/rejected/completed follow-up
```

Supported reservation statuses in code:

- `pending`
- `accepted`
- `rejected`
- `cancelled`
- `completed`
- `requested`
- `confirmed`
- `no_show`

When Resend is configured, transactional emails are sent through Resend. Without `RESEND_API_KEY`, emails are stored as demo/log records.

## Feature Registry

The central feature registry lives in `src/app-core.js`. The frontend mirrors and consumes it through `canShowFeature(featureKey, options)`.

| Feature key | Label | Modes | Audiences | Status |
| --- | --- | --- | --- | --- |
{feature_rows}

## Language Support

The frontend supports three languages:

- English (`en`)
- Spanish (`es`)
- Hungarian (`hu`)

Language files live in `public/locales/`. Hungarian adds broader literal/phrase overrides to fill older hardcoded visible text.

| Language | Top-level keys | Literal overrides | Phrase overrides |
| --- | ---: | ---: | ---: |
{locale_rows}

Language selection is stored in browser localStorage and can be saved to the user profile via `/api/auth/language`.

## Environment Variables

The repository documents environment variable names in `.env.example`. Secret values are intentionally not included here.

| Variable | Purpose |
| --- | --- |
{env_rows}

## Local Setup

1. Install/use Node 18 or newer.
2. From the project root, run `node server.js` or `npm run dev`.
3. Open `http://localhost:4173`.
4. Without Supabase variables, the app runs in demo mode.
5. For this Windows workspace, `start-local-server.ps1` starts the local server on port `4173`.

Useful commands:

```powershell
npm run check
npm run check:platform-mode
npm run docs:pdf
```

## Deployment

The deployment target is Vercel plus Supabase:

- Static frontend from `public/`.
- Serverless API through `api/index.js`.
- Rewrites in `vercel.json` route `/api/:path*` to the serverless API and SPA routes back to `/`.
- Supabase migrations create database structures, views, RLS policies, storage policies, and seed/status records.
- Resend sends transactional email when configured.

Production deployment must keep service-role keys, email keys, integration secrets, and impersonation secrets server-side only.

## Testing

Implemented checks:

- `npm run check` runs Node syntax checks for `server.js`, `src/app-core.js`, `api/index.js`, and `public/app.js`.
- `npm run check:platform-mode` verifies Platform Mode behavior, Super Admin write access, regular-admin denial, basic reservation flow, feature visibility, persistence, notification/audit logging, and language keys.
- `npm run docs:pdf` regenerates this Markdown and PDF documentation.

This repository does not currently include a full browser/E2E test suite or unit test runner.

## Known Issues

- Many AI modules are demo, beta, or integration-dependent and must remain labeled accordingly.
- OpenTable, Resy, SevenRooms, Tock, Google Reserve, approved reservation APIs, weather, events, Stripe, OpenAI, and vector database integrations are not live.
- Some production-readiness areas are schema-ready but need background jobs, provider credentials, OAuth/API approvals, or webhook workers.
- Local mode uses in-memory data for most records; restarting the process resets those records except the app settings JSON.
- `npm run docs:pdf` requires Python with `reportlab`, `pypdf`, and `pdfplumber` available.
- The app is a large single-page frontend in `public/app.js`; future maintainability would benefit from modularization.

## Future Roadmap

1. Connect approved reservation provider APIs and webhooks through the adapter layer.
2. Complete restaurant team invite UI backed by `restaurant_users`.
3. Add background jobs for post-visit emails, AI action attribution, sync runs, and imports.
4. Connect Stripe checkout, customer portal, and webhooks to the billing foundation.
5. Replace deterministic AI/demo responses with a secure AI service layer and audit logging.
6. Add provider-backed reservation APIs plus separate weather, event, and traffic feeds.
7. Add automated browser/E2E tests for guest, partner, admin, and Super Admin workflows.
8. Split the large frontend file into maintainable modules or a modern framework build.

## Scale Architecture Readiness

The scale-readiness audit and safe refactor order are documented in `docs/SmartTable-Scale-Architecture.md`. It covers central feature flags, generalized booking metadata, structured offer conditions, review integrity, disabled-by-default push architecture, SEO, performance, security, component-library targets, and the safe implementation order for future growth.
"""
    return md


def database_table_purpose(name: str) -> str:
    purpose = {
        "profiles": "User profiles and roles.",
        "restaurants": "Restaurant profile, location, billing, and operating data.",
        "offers": "Discounted table availability and offer rules.",
        "reservations": "SmartTable reservation leads and status tracking.",
        "email_events": "Legacy/demo email event logging.",
        "site_content": "Admin-editable public content keys.",
        "restaurant_view_events": "Restaurant view tracking.",
        "restaurant_followers": "Email-based restaurant follow/favorite subscriptions.",
        "restaurant_reviews": "Food/service/ambience reviews and moderation status.",
        "admin_notifications": "Admin notification center.",
        "ai_preference_profiles": "Guest AI preference profiles.",
        "ai_interaction_events": "AI learning/interactions event log.",
        "ai_demand_forecasts": "Demand forecast storage.",
        "restaurant_integrations": "Legacy restaurant integration settings.",
        "calendar_connections": "Future calendar connection records.",
        "ai_service_time_observations": "Service duration observations.",
        "ai_route_plans": "Route planning estimates.",
        "dining_consumption_uploads": "Dining photo/review intelligence submissions.",
        "loyalty_accounts": "Guest loyalty point/badge records.",
        "ai_processing_jobs": "Future async AI job queue records.",
        "analytics_events": "Generic analytics events.",
        "audit_logs": "Audit/activity log.",
        "restaurant_users": "Restaurant team-member/account relationships.",
        "guests": "Guest identity records.",
        "guest_profiles": "Extended guest preferences/profile data.",
        "reservation_sources": "External/manual reservation source catalog.",
        "ai_recommendations": "AI recommendation records.",
        "ai_actions": "AI recommendation approval/action records.",
        "ai_action_results": "Measured AI action results.",
        "marketing_campaigns": "Campaign records generated manually or by AI approval.",
        "email_logs": "Transactional/campaign email logs.",
        "notification_logs": "Guest notification logs.",
        "guest_feedback": "Post-visit guest feedback and moderation.",
        "integrations": "Integration provider catalog.",
        "integration_connections": "Restaurant integration connections/status.",
        "imported_reservations": "Imported reservation history.",
        "imported_guests": "Imported guest records.",
        "demand_snapshots": "Demand score/history snapshots.",
        "revenue_snapshots": "Revenue/value snapshots.",
        "feature_status": "Feature status registry in database.",
        "integration_sync_runs": "Integration sync run logs.",
        "integration_error_logs": "Integration error logs.",
        "data_import_jobs": "CSV/manual import jobs.",
        "manual_performance_uploads": "Manual weekly performance uploads.",
        "guest_consents": "Consent records.",
        "email_unsubscribes": "Unsubscribe records.",
        "privacy_requests": "Data/privacy request records.",
        "legal_documents": "Terms/privacy document records.",
        "feature_flags": "Admin-managed feature flags.",
        "billing_plans": "Billing plan foundation.",
        "subscriptions": "Restaurant subscription foundation.",
        "invoices": "Invoice foundation.",
        "payment_events": "Payment event foundation.",
        "app_error_logs": "Application error and audit-like log storage.",
        "admin_alerts": "Admin alert records.",
        "app_settings": "Persistent platform settings including Platform Mode.",
    }
    return purpose.get(name, "Structured table defined by migrations.")


def env_purpose(name: str) -> str:
    descriptions = {
        "PORT": "Local HTTP server port.",
        "PUBLIC_BASE_URL": "Base URL used in links and email templates.",
        "SUPABASE_URL": "Supabase project URL.",
        "SUPABASE_ANON_KEY": "Public Supabase anon key for server-side Supabase calls.",
        "SUPABASE_SERVICE_ROLE_KEY": "Server-side Supabase service role key. Keep secret.",
        "EMAIL_FROM": "Verified sender address for transactional email.",
        "RESEND_API_KEY": "Resend API key for live email sending. Keep secret.",
        "ADMIN_NOTIFICATION_EMAIL": "Admin email recipient for notification copies.",
        "SUPABASE_STORAGE_BUCKET": "Storage bucket for uploaded media.",
        "VITE_GOOGLE_MAPS_API_KEY": "Public Google Maps browser key.",
        "IMPERSONATION_SECRET": "Server-side secret for Super Admin partner impersonation tokens.",
        "OPENAI_API_KEY": "Future AI service key. Keep secret.",
        "VECTOR_DATABASE_URL": "Future vector/semantic search database URL.",
        "STRIPE_SECRET_KEY": "Stripe secret key for server-created Checkout, Portal, and webhook reconciliation. Keep secret.",
        "STRIPE_PUBLISHABLE_KEY": "Stripe publishable key. This is the only Stripe key that may be public when a browser Stripe.js flow genuinely requires it.",
        "STRIPE_WEBHOOK_SECRET": "Stripe webhook signing secret. Keep secret.",
        "STRIPE_BASIC_MONTHLY_PRICE_ID": "Stripe test-mode monthly Price ID for the Basic restaurant subscription.",
        "STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID": "Stripe test-mode monthly Price ID for the Professional restaurant subscription.",
        "STRIPE_ENTERPRISE_MONTHLY_PRICE_ID": "Stripe test-mode monthly Price ID for the Enterprise restaurant subscription.",
        "STRIPE_PORTAL_CONFIGURATION_ID": "Optional Stripe Customer Portal configuration ID selected by the server.",
        "STRIPE_SELF_SERVICE_ENTERPRISE_ENABLED": "Enables self-service Stripe Checkout for Enterprise plans when true. Keep false unless approved.",
        "BILLING_DEFAULT_TRIAL_DAYS": "Optional server-side Stripe Checkout trial duration in days. The browser must not choose this value.",
        "BILLING_GRACE_PERIOD_DAYS": "Number of days partner access remains writable after a failed subscription payment.",
        "BILLING_OVERRIDE_MAX_DAYS": "Maximum duration for an admin-granted temporary billing access override.",
        "STRIPE_ENTERPRISE_SELF_SERVICE_ENABLED": "Legacy alias for STRIPE_SELF_SERVICE_ENTERPRISE_ENABLED.",
        "STRIPE_TRIAL_PERIOD_DAYS": "Legacy alias for BILLING_DEFAULT_TRIAL_DAYS.",
        "BILLING_PAYMENT_GRACE_PERIOD_DAYS": "Legacy alias for BILLING_GRACE_PERIOD_DAYS.",
        "INTEGRATION_SECRET_ENCRYPTION_KEY": "Future encryption key for integration secrets.",
    }
    if name.endswith("_CLIENT_SECRET") or name.endswith("_API_KEY"):
        return "Provider integration credential. Keep secret unless explicitly public/browser-scoped."
    if name.endswith("_CLIENT_ID"):
        return "Provider integration client identifier."
    return descriptions.get(name, "Configuration value documented by .env.example.")


class PdfWriter:
    def __init__(self, sections: list[dict]):
        self.sections = sections
        self.section_pages: dict[str, int] = {}
        self.section_titles: dict[str, str] = {}
        self.page = 0
        self.y = PAGE_H - MARGIN_TOP
        self.c: canvas.Canvas | None = None

    def build(self, path: Path, collect_only: bool = False, toc_pages: dict[str, int] | None = None) -> dict[str, int]:
        tmp = path if not collect_only else path.with_suffix(".tmp.pdf")
        self.c = canvas.Canvas(str(tmp), pagesize=A4)
        self.page = 0
        self.y = PAGE_H - MARGIN_TOP
        self.cover()
        self.toc(toc_pages or {})
        self.new_page()
        for section in self.sections:
            self.section(section)
        self.c.save()
        if collect_only and tmp.exists():
            tmp.unlink()
        return self.section_pages

    def new_page(self, header: str = "SmartTable Documentation"):
        if self.page:
            self.c.showPage()
        self.page += 1
        self.y = PAGE_H - MARGIN_TOP
        if self.page > 1:
            self.c.setFont(FONT, 8)
            self.c.setFillColor(colors.HexColor("#5b6670"))
            self.c.drawString(MARGIN_X, PAGE_H - 28, header)
            self.c.drawRightString(PAGE_W - MARGIN_X, 28, f"Page {self.page}")
            self.c.setStrokeColor(colors.HexColor("#dce5df"))
            self.c.line(MARGIN_X, PAGE_H - 38, PAGE_W - MARGIN_X, PAGE_H - 38)
        self.c.setFillColor(colors.black)

    def ensure(self, height: float):
        if self.y - height < MARGIN_BOTTOM:
            self.new_page()

    def cover(self):
        self.new_page()
        c = self.c
        c.setFillColor(colors.HexColor("#0f735d"))
        c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
        c.setFillColor(colors.white)
        c.setFont(FONT_BOLD, 34)
        c.drawString(MARGIN_X, PAGE_H - 170, "SmartTable")
        c.setFont(FONT_BOLD, 19)
        c.drawString(MARGIN_X, PAGE_H - 202, "Codebase Documentation")
        c.setFont(FONT, 11)
        lines = [
            "Generated from the current repository",
            f"Generated date: {TODAY}",
            "Secrets, passwords, tokens, and production credentials are intentionally omitted.",
        ]
        y = PAGE_H - 255
        for line in lines:
            c.drawString(MARGIN_X, y, line)
            y -= 20
        c.setStrokeColor(colors.white)
        c.setLineWidth(1)
        c.roundRect(MARGIN_X, 92, CONTENT_W, 90, 12, fill=0, stroke=1)
        c.setFont(FONT_BOLD, 13)
        c.drawString(MARGIN_X + 18, 147, "Scope")
        c.setFont(FONT, 10)
        c.drawString(MARGIN_X + 18, 125, "Working, partial, demo, disabled, and planned features are separated.")
        c.drawString(MARGIN_X + 18, 108, "No admin-interface changes are made by this documentation generator.")

    def toc(self, pages: dict[str, int]):
        self.new_page()
        c = self.c
        c.setFont(FONT_BOLD, 22)
        c.setFillColor(colors.HexColor("#12312a"))
        c.drawString(MARGIN_X, self.y, "Table of Contents")
        self.y -= 32
        c.setFont(FONT, 9)
        c.setFillColor(colors.HexColor("#54615b"))
        c.drawString(MARGIN_X, self.y, "Entries are clickable in PDF viewers that support internal document links.")
        self.y -= 24
        for idx, section in enumerate(self.sections, 1):
            title = section["title"]
            sec_id = section["id"]
            page_num = pages.get(sec_id, "")
            self.ensure(18)
            y = self.y
            c.setFont(FONT, 10)
            c.setFillColor(colors.HexColor("#0f735d"))
            c.drawString(MARGIN_X, y, f"{idx}. {title}")
            c.drawRightString(PAGE_W - MARGIN_X, y, str(page_num))
            try:
                c.linkRect("", sec_id, (MARGIN_X, y - 3, PAGE_W - MARGIN_X, y + 12), relative=0, thickness=0)
            except Exception:
                pass
            self.y -= 18

    def section(self, section: dict):
        self.ensure(160)
        sec_id = section["id"]
        self.section_pages[sec_id] = self.page
        self.section_titles[sec_id] = section["title"]
        try:
            self.c.bookmarkPage(sec_id)
            self.c.addOutlineEntry(section["title"], sec_id, level=0, closed=False)
        except Exception:
            pass
        self.c.setFont(FONT_BOLD, 18)
        self.c.setFillColor(colors.HexColor("#12312a"))
        self.c.drawString(MARGIN_X, self.y, section["title"])
        self.y -= 26
        for block in section["blocks"]:
            kind = block["type"]
            if kind == "p":
                self.paragraph(block["text"])
            elif kind == "bullets":
                self.bullets(block["items"])
            elif kind == "table":
                self.table(block["headers"], block["rows"], block.get("widths"))
            elif kind == "code":
                self.code(block["text"])
            elif kind == "diagram":
                self.diagram(block["name"])
            elif kind == "spacer":
                self.y -= block.get("height", 10)
        self.y -= 12

    def text_lines(self, text: str, size: int = 9, width: float = CONTENT_W, font: str = FONT) -> list[str]:
        words = clean_space(text).split(" ")
        lines: list[str] = []
        line = ""
        for word in words:
            if pdfmetrics.stringWidth(word, font, size) > width:
                if line:
                    lines.append(line)
                    line = ""
                parts = self.split_long_token(word, width, size, font)
                lines.extend(parts[:-1])
                line = parts[-1] if parts else ""
                continue
            trial = f"{line} {word}".strip()
            if pdfmetrics.stringWidth(trial, font, size) <= width:
                line = trial
            else:
                if line:
                    lines.append(line)
                line = word
        if line:
            lines.append(line)
        return lines or [""]

    def split_long_token(self, token: str, width: float, size: int, font: str) -> list[str]:
        parts: list[str] = []
        current = ""
        for char in token:
            trial = current + char
            if current and pdfmetrics.stringWidth(trial, font, size) > width:
                parts.append(current)
                current = char
            else:
                current = trial
        if current:
            parts.append(current)
        return parts or [token]

    def paragraph(self, text: str):
        lines = self.text_lines(text, size=9.5, width=CONTENT_W)
        self.ensure(len(lines) * 13 + 8)
        self.c.setFont(FONT, 9.5)
        self.c.setFillColor(colors.HexColor("#27352f"))
        for line in lines:
            self.c.drawString(MARGIN_X, self.y, line)
            self.y -= 13
        self.y -= 6

    def bullets(self, items: list[str]):
        for item in items:
            lines = self.text_lines(item, size=9, width=CONTENT_W - 18)
            self.ensure(len(lines) * 12 + 4)
            self.c.setFont(FONT, 9)
            self.c.setFillColor(colors.HexColor("#27352f"))
            self.c.drawString(MARGIN_X + 2, self.y, "-")
            first = True
            for line in lines:
                self.c.drawString(MARGIN_X + 16, self.y, line)
                self.y -= 12
                first = False
            if first:
                self.y -= 12
        self.y -= 6

    def code(self, text: str):
        lines = []
        for raw in text.strip().splitlines():
            lines.extend(textwrap.wrap(raw, width=86, replace_whitespace=False) or [""])
        height = len(lines) * 11 + 14
        self.ensure(height)
        self.c.setFillColor(colors.HexColor("#f3f7f5"))
        self.c.roundRect(MARGIN_X, self.y - height + 8, CONTENT_W, height, 6, fill=1, stroke=0)
        self.c.setFont(FONT_MONO, 7.8)
        self.c.setFillColor(colors.HexColor("#23312b"))
        y = self.y - 8
        for line in lines:
            self.c.drawString(MARGIN_X + 9, y, line[:110])
            y -= 11
        self.y -= height + 6

    def table(self, headers: list[str], rows: list[list[str]], widths: list[float] | None = None):
        if not rows:
            return
        if widths is None:
            widths = [CONTENT_W / len(headers)] * len(headers)
        else:
            total = sum(widths)
            widths = [CONTENT_W * w / total for w in widths]
        header_h = 22
        self.ensure(header_h + 24)
        self.draw_table_row(headers, widths, header_h, header=True)
        for row in rows:
            wrapped = [self.wrap_cell(str(cell), widths[i] - 8) for i, cell in enumerate(row)]
            row_h = max(20, max(len(lines) for lines in wrapped) * 9 + 10)
            if self.y - row_h < MARGIN_BOTTOM:
                self.new_page()
                self.draw_table_row(headers, widths, header_h, header=True)
            self.draw_table_row(row, widths, row_h, header=False)
        self.y -= 10

    def wrap_cell(self, text: str, width: float) -> list[str]:
        return self.text_lines(text, size=7.2, width=width, font=FONT)

    def draw_table_row(self, cells: list[str], widths: list[float], height: float, header: bool):
        x = MARGIN_X
        y_top = self.y
        self.c.setStrokeColor(colors.HexColor("#d8e3dd"))
        self.c.setFillColor(colors.HexColor("#0f735d") if header else colors.white)
        self.c.rect(MARGIN_X, y_top - height, CONTENT_W, height, fill=1, stroke=0)
        self.c.setFont(FONT_BOLD if header else FONT, 7.2 if not header else 7.5)
        self.c.setFillColor(colors.white if header else colors.HexColor("#25342e"))
        for i, cell in enumerate(cells):
            w = widths[i]
            lines = self.wrap_cell(str(cell), w - 8)
            ty = y_top - 10
            for line in lines[: max(1, int((height - 5) / 9))]:
                self.c.drawString(x + 4, ty, line)
                ty -= 9
            self.c.setStrokeColor(colors.HexColor("#d8e3dd"))
            self.c.rect(x, y_top - height, w, height, fill=0, stroke=1)
            x += w
        self.y -= height

    def diagram(self, name: str):
        self.ensure(140)
        if name == "architecture":
            labels = ["Browser UI", "Node API", "Demo store", "Supabase", "Resend", "Provider adapters"]
            positions = [
                (MARGIN_X, self.y - 48),
                (MARGIN_X + 145, self.y - 48),
                (MARGIN_X + 290, self.y - 18),
                (MARGIN_X + 290, self.y - 78),
                (MARGIN_X + 430, self.y - 18),
                (MARGIN_X + 430, self.y - 78),
            ]
            for label, (x, y) in zip(labels, positions):
                self.c.setFillColor(colors.HexColor("#edf7f3"))
                self.c.roundRect(x, y, 110, 32, 6, fill=1, stroke=0)
                self.c.setFillColor(colors.HexColor("#12312a"))
                self.c.setFont(FONT_BOLD, 8)
                self.c.drawCentredString(x + 55, y + 12, label)
            self.arrow(MARGIN_X + 110, self.y - 32, MARGIN_X + 145, self.y - 32)
            self.arrow(MARGIN_X + 255, self.y - 32, MARGIN_X + 290, self.y - 2)
            self.arrow(MARGIN_X + 255, self.y - 32, MARGIN_X + 290, self.y - 62)
            self.arrow(MARGIN_X + 400, self.y - 2, MARGIN_X + 430, self.y - 2)
            self.arrow(MARGIN_X + 400, self.y - 62, MARGIN_X + 430, self.y - 62)
            self.y -= 120
        elif name == "reservation":
            steps = ["Select offer", "Submit request", "Pending reservation", "Partner decision", "Email update"]
            x = MARGIN_X
            for idx, step in enumerate(steps):
                self.c.setFillColor(colors.HexColor("#f6f8f7"))
                self.c.roundRect(x, self.y - 44, 92, 34, 6, fill=1, stroke=0)
                self.c.setFillColor(colors.HexColor("#12312a"))
                self.c.setFont(FONT_BOLD, 7.5)
                self.c.drawCentredString(x + 46, self.y - 24, step)
                if idx < len(steps) - 1:
                    self.arrow(x + 92, self.y - 27, x + 112, self.y - 27)
                x += 112
            self.y -= 80

    def arrow(self, x1, y1, x2, y2):
        self.c.setStrokeColor(colors.HexColor("#0f735d"))
        self.c.line(x1, y1, x2, y2)
        self.c.line(x2, y2, x2 - 4, y2 + 3)
        self.c.line(x2, y2, x2 - 4, y2 - 3)


def section_blocks(facts: dict) -> list[dict]:
    features = facts["features"]
    endpoints = facts["endpoints"]
    database = facts["database"]
    locale_stats = facts["locale_stats"]
    env_vars = facts["env_vars"]
    scripts = facts["scripts"]
    settings = facts["settings"]

    feature_rows = [[f["key"], f["label"], f["modes"], f["audiences"], f["status"]] for f in features]
    endpoint_rows = [[item["methods"], item["route"], item["audience"], item["status"]] for item in endpoints]
    table_rows = [[name, migration, database_table_purpose(name)] for name, migration in database["tables"].items()]
    env_rows = [[name, env_purpose(name)] for name in env_vars]
    locale_rows = [[r["language"], r["top_level_keys"], r["literal_overrides"], r["phrase_overrides"]] for r in locale_stats]
    script_rows = [[name, value] for name, value in scripts.items()]

    return [
        {
            "id": "project-overview",
            "title": "Project Overview",
            "blocks": [
                {"type": "p", "text": "SmartTable is a discounted restaurant reservation marketplace with a static browser UI, a Node API layer, Supabase-ready PostgreSQL migrations, demo-mode fallback data, Resend-ready transactional email, partner/admin dashboards, and a gated AI Concierge mode."},
                {"type": "p", "text": "SmartTable integrates with reservation systems only. It does not connect to restaurant POS systems or access restaurant payment and transaction data."},
                {"type": "p", "text": f"Current local platform settings: platform_mode={settings.get('platform_mode', 'unknown')}, ai_demo_visibility={settings.get('ai_demo_visibility', 'unknown')}, show_ai_mode_badge={settings.get('show_ai_mode_badge', 'unknown')}."},
                {"type": "table", "headers": ["Runtime item", "Location"], "rows": [[item, path] for item, path in [
                    ("Static frontend", "public/app.js, public/index.html, public/styles.css"),
                    ("Local server", "server.js"),
                    ("API core", "src/app-core.js"),
                    ("Vercel API", "api/index.js, api/[...path].js"),
                    ("Provider abstraction", "src/reservation-providers.js"),
                    ("Database migrations", "supabase/migrations/*.sql"),
                ]], "widths": [1, 2.5]},
            ],
        },
        {
            "id": "feature-status-summary",
            "title": "Feature Status Summary",
            "blocks": [
                {"type": "p", "text": "The current codebase intentionally separates working marketplace features from beta, demo, disabled, and integration-dependent AI modules."},
                {"type": "table", "headers": ["Status", "Meaning", "Examples"], "rows": [
                    ["Working", "Frontend, API, and data flow exist.", "Public offers, reservation requests, admin/partner basics, Platform Mode."],
                    ["Partial / Beta", "Structures and UI/API exist but need hardening or production workflows.", "AI recommendations, imports, monitoring, reviews, billing foundation."],
                    ["Demo only", "Mock or deterministic behavior only.", "Partner AI mock analytics, demo AI Concierge cards."],
                    ["Disabled", "Registered but unavailable.", "Calendar sync."],
                    ["Planned / Requires integration", "Schema/placeholders exist; provider access is not connected.", "OpenTable, Resy, Stripe, OpenAI, weather/events."],
                ], "widths": [1, 2, 2.4]},
            ],
        },
        {
            "id": "platform-modes",
            "title": "Basic and AI Concierge Modes",
            "blocks": [
                {"type": "p", "text": "Platform Mode is stored in local demo settings or Supabase app_settings. Default mode is basic. Super Admin can switch it through the admin platform settings API and UI."},
                {"type": "table", "headers": ["Mode", "Behavior"], "rows": [
                    ["basic", "Shows the non-AI discounted reservation marketplace and hides AI navigation/claims."],
                    ["ai_concierge", "Allows AI navigation and AI sections when feature registry rules and demo visibility allow them."],
                ], "widths": [1, 3]},
                {"type": "p", "text": "AI Demo Visibility is separate. Demo features remain hidden unless AI_CONCIERGE mode and ai_demo_visibility are both enabled."},
            ],
        },
        {
            "id": "user-functions",
            "title": "Guest, Partner, Admin, Super Admin Functions",
            "blocks": [
                {"type": "table", "headers": ["Audience", "Implemented functions"], "rows": [
                    ["Guest", "Browse offers, open restaurant detail/modal, request reservations, follow restaurants, submit reviews/feedback/photos, use EN/ES/HU, access visible AI Concierge when enabled."],
                    ["Partner", "Login, edit profile, manage offers, view/update reservations, view stats, integrations/imports, photo feedback, AI Demand entry when enabled."],
                    ["Admin", "Manage restaurants, partners, offers, reservations, content, notifications, reviews, integrations, feature flags, billing foundation, monitoring, privacy requests, stats."],
                    ["Super Admin", "All admin functions plus Platform Mode switching and partner impersonation/view-as flow."],
                ], "widths": [1, 4]},
            ],
        },
        {
            "id": "architecture",
            "title": "Architecture",
            "blocks": [
                {"type": "diagram", "name": "architecture"},
                {"type": "bullets", "items": [
                    "server.js serves static assets and delegates /api/* requests to handleApiRequest.",
                    "api/index.js provides the Vercel serverless API entry point.",
                    "src/app-core.js contains business logic, Supabase access, permissions, emails, demo fallback data, Platform Mode, and feature registry.",
                    "src/reservation-providers.js defines generic and mock OpenTable/Resy/SevenRooms/Tock provider adapters.",
                    "public/app.js contains the browser single-page app and feature-visibility logic.",
                ]},
            ],
        },
        {
            "id": "folder-structure",
            "title": "Folder Structure",
            "blocks": [
                {"type": "table", "headers": ["Path", "Purpose"], "rows": [
                    ["api/", "Vercel API entry files."],
                    ["data/app-settings.json", "Local demo persistence for Platform Mode settings."],
                    ["public/", "Frontend, styles, assets, language files, manifest, robots, sitemap."],
                    ["scripts/", "Checks, locale utilities, documentation generator."],
                    ["src/", "API core and integration/provider abstraction."],
                    ["supabase/migrations/", "PostgreSQL schema, views, RLS, seeds, settings."],
                    ["backups/", "Manual/autosave snapshots, not runtime source."],
                ], "widths": [1.4, 3]},
            ],
        },
        {
            "id": "frontend-route-structure-and-redirects",
            "title": "Frontend Route Structure and Redirects",
            "blocks": [
                {"type": "p", "text": "The browser app is a single-page application with shared backend, shared auth, shared API, shared database, shared translations, and shared platform settings."},
                {"type": "table", "headers": ["Area", "Routes"], "rows": [
                    ["Guest public", "/, /restaurants, /restaurants/:slug, /offers, /signup, /login, /forgot-password, /reset-password, /terms, /privacy, /contact, /help"],
                    ["Guest protected", "/account, /account/reservations, /account/favorites, /account/profile, /account/preferences, /account/notifications, /account/reviews, /account/security"],
                    ["Partner", "/partner, /partner/offers, /partner/reservations, /partner/profile, /partner/analytics, /partner/settings, /partner/ai-demand when allowed"],
                    ["Admin", "/admin, /admin/restaurants, /admin/offers, /admin/users, /admin/notifications, /admin/content, /admin/platform-settings, /admin/ai-controls when allowed"],
                    ["Compatibility", "Direct URL refresh uses SPA fallback. Hash aliases such as #guest-signup, #partner-ai-demand, and #admin-ai-controls remain supported."],
                ], "widths": [1.2, 4.2]},
            ],
        },
        {
            "id": "seo-mobile-and-security-cleanup",
            "title": "SEO, Mobile, and Security Cleanup",
            "blocks": [
                {"type": "bullets", "items": [
                    "Route-aware title, meta description, canonical, robots, and Open Graph updates exist in server.js and public/app.js.",
                    "robots.txt and sitemap.xml are served dynamically by server.js and have static fallbacks in public/.",
                    "Private admin, partner, account, login/reset, and post-visit upload routes are noindex.",
                    "Mobile cleanup covers narrow phones, modal containment, signup option grids, filters, account cards, and 44px touch targets.",
                    "Public offers are sanitized to avoid leaking restaurant email, owner IDs, partner/admin notes, roles, permissions, tokens, secrets, or private keys.",
                    "Security headers include nosniff, DENY frame policy, strict-origin referrer policy, and restricted permissions policy.",
                ]},
            ],
        },
        {
            "id": "reservation-integration-boundaries-and-pos-ban",
            "title": "Reservation Integration Boundaries and POS Ban",
            "blocks": [
                {"type": "p", "text": "SmartTable integrates with reservation systems only. It does not connect to restaurant POS systems or access restaurant payment and transaction data."},
                {"type": "table", "headers": ["Allowed", "Not allowed"], "rows": [
                    ["Resy, OpenTable, SevenRooms, Tock, Google Reserve, approved reservation APIs, CSV/manual reservation import.", "Toast POS, Square POS, Clover, Lightspeed, Oracle MICROS, TouchBistro, payment/card/order/sales/inventory/cash-register/tip/refund/settlement data."],
                    ["Reservation count, available times, table availability, party size, booking status, capacity, active offers, conversions, searches, clicks, favorites, ratings, feedback, weather/events/traffic when separately integrated.", "Individual bills, item-level POS sales, employee sales, payment settlements, and any POS-derived revenue estimate."],
                ], "widths": [2.5, 2.5]},
            ],
        },
        {
            "id": "subdomain-configuration",
            "title": "Subdomain Configuration",
            "blocks": [
                {"type": "p", "text": "The current app can run as one shared application behind different domains or subdomains while keeping one backend, one database, one auth system, and one set of platform settings."},
                {"type": "table", "headers": ["Host", "Route target"], "rows": [
                    ["smarttable.com", "Guest marketplace /"],
                    ["www.smarttable.com", "Guest marketplace /"],
                    ["partners.smarttable.com", "/partner or a rewrite to /partner"],
                    ["admin.smarttable.com", "/admin or a rewrite to /admin"],
                ], "widths": [1.7, 2.7]},
                {"type": "p", "text": "Set PUBLIC_BASE_URL to the primary public guest URL used in emails and canonical links. Partner/admin subdomains must remain protected by server-side auth and role checks."},
            ],
        },
        {
            "id": "database",
            "title": "Database",
            "blocks": [
                {"type": "p", "text": f"The repository currently has {facts['migration_count']} migrations, {len(database['tables'])} unique tables, {len(database['views'])} unique views, {database['indexes']} indexes, and {database['policies']} unique RLS policies."},
                {"type": "table", "headers": ["Table", "First migration", "Purpose"], "rows": table_rows, "widths": [1.15, 2.05, 3]},
                {"type": "p", "text": "Key views include public_available_offers, public_restaurant_cards, reservation_overview, restaurant_review_summary, restaurant_reviews_overview, and admin_notifications_overview."},
            ],
        },
        {
            "id": "api-routes",
            "title": "API Routes",
            "blocks": [
                {"type": "p", "text": f"The current API handler exposes {len(endpoints)} distinct backend route paths through /api/*."},
                {"type": "table", "headers": ["Methods", "Route", "Audience", "Status"], "rows": endpoint_rows, "widths": [0.7, 1.8, 1.55, 1.25]},
            ],
        },
        {
            "id": "authentication-and-permissions",
            "title": "Authentication and Permissions",
            "blocks": [
                {"type": "p", "text": "Supabase Auth is used when configured. Local/demo mode uses seeded in-memory users; passwords are intentionally omitted from this documentation."},
                {"type": "table", "headers": ["Role", "Permissions"], "rows": [
                    ["super_admin", "Can manage admin data, switch Platform Mode, control AI demo visibility, and impersonate/view as partners."],
                    ["admin", "Can manage platform data and see current mode but cannot switch Platform Mode."],
                    ["partner / restaurant", "Can manage the linked restaurant, offers, reservations, stats, and feedback only."],
                    ["guest", "Optional account role; anonymous reservation requests are also supported."],
                ], "widths": [1.1, 3.5]},
                {"type": "p", "text": "Server-side authorization is centralized in requireProfile(headers, roles). Supabase migrations enable RLS policies for scoped table access."},
            ],
        },
        {
            "id": "reservation-flow",
            "title": "Reservation Flow",
            "blocks": [
                {"type": "diagram", "name": "reservation"},
                {"type": "bullets", "items": [
                    "Guest selects a restaurant offer and submits the reservation modal.",
                    "POST /api/reservations validates contact info, offer, party size, date/time, and capacity.",
                    "A pending reservation is created.",
                    "Guest and restaurant notification emails are sent through Resend when configured; otherwise they are logged in demo mode.",
                    "Partner/Admin can accept, reject, cancel, complete, no-show, and add reservation notes.",
                    "Post-visit feedback email/notification support exists for completed reservations.",
                ]},
                {"type": "code", "text": "Supported statuses: pending, accepted, rejected, cancelled, completed, requested, confirmed, no_show"},
            ],
        },
        {
            "id": "feature-registry",
            "title": "Feature Registry",
            "blocks": [
                {"type": "p", "text": "The central feature registry controls visibility across guest, partner, and admin surfaces. The frontend calls canShowFeature(featureKey, options)."},
                {"type": "table", "headers": ["Feature key", "Label", "Modes", "Audiences", "Status"], "rows": feature_rows, "widths": [1.5, 1.5, 1.2, 1.1, 0.8]},
            ],
        },
        {
            "id": "language-support",
            "title": "English, Spanish, and Hungarian Language Support",
            "blocks": [
                {"type": "p", "text": "The language selector supports English, Spanish, and Hungarian. Language choice is stored in localStorage and can be saved to the authenticated profile through /api/auth/language."},
                {"type": "table", "headers": ["Language", "Top-level keys", "Literal overrides", "Phrase overrides"], "rows": locale_rows, "widths": [1.1, 1.2, 1.3, 1.3]},
                {"type": "p", "text": "Hungarian has broader literal and phrase overrides to cover older visible text while the app transitions toward key-only translations."},
            ],
        },
        {
            "id": "environment-variables",
            "title": "Environment Variables",
            "blocks": [
                {"type": "p", "text": "The following names come from .env.example. No secret values are included."},
                {"type": "table", "headers": ["Variable", "Purpose"], "rows": env_rows, "widths": [1.65, 3.2]},
            ],
        },
        {
            "id": "local-setup",
            "title": "Local Setup",
            "blocks": [
                {"type": "bullets", "items": [
                    "Use Node 18 or newer.",
                    "Run npm run dev or node server.js from the project root.",
                    "Open http://localhost:4173.",
                    "Without Supabase environment variables, the app runs in local demo mode.",
                    "On this Windows workspace, start-local-server.ps1 starts the local server on port 4173.",
                ]},
                {"type": "table", "headers": ["npm script", "Command"], "rows": script_rows, "widths": [1.3, 3.5]},
            ],
        },
        {
            "id": "deployment",
            "title": "Deployment",
            "blocks": [
                {"type": "bullets", "items": [
                    "Vercel serves the static frontend and serverless API.",
                    "Supabase migrations provide PostgreSQL schema, views, RLS, storage policies, app settings, and seed/status records.",
                    "Resend is used for live transactional email when configured.",
                    "Service-role keys, email provider keys, impersonation secret, Stripe keys, and integration secrets must remain server-side only.",
                    "vercel.json rewrites /api/:path* to /api/index and SPA routes back to /.",
                ]},
            ],
        },
        {
            "id": "testing",
            "title": "Testing",
            "blocks": [
                {"type": "table", "headers": ["Command", "Purpose"], "rows": [
                    ["npm run build", "Runs the project check command used as the production build gate."],
                    ["npm run lint", "Runs static safety checks."],
                    ["npm run typecheck", "Runs parser/type-shape checks through npm run check."],
                    ["npm test", "Runs signup, guest account, public experience, design system, route protection, route map, and architecture checks."],
                    ["npm run check", "Node syntax checks for server.js, src/app-core.js, api/index.js, public/app.js, shared contracts, layouts, and push service."],
                    ["npm run check:platform-mode", "Validates Platform Mode permissions, persistence, feature visibility, reservation flow, audit/notification logging, and language keys."],
                    ["npm run check:public-experience", "Validates public SEO/mobile/security wiring, public API sanitization, route compatibility, and guest-to-partner reservation flow."],
                    ["npm run docs:pdf", "Regenerates docs/SmartTable-Documentation.md and docs/SmartTable-Documentation.pdf."],
                ], "widths": [1.6, 3.2]},
                {"type": "p", "text": "There is no full browser screenshot/E2E runner in the current repository; current checks are API/static/route acceptance checks."},
            ],
        },
        {
            "id": "known-issues",
            "title": "Known Issues",
            "blocks": [
                {"type": "bullets", "items": [
                    "AI modules must stay labeled beta/demo/integration-dependent until backed by live data and measured results.",
                    "OpenTable, Resy, SevenRooms, Tock, Google Reserve, approved reservation APIs, weather, events, Stripe, OpenAI, and vector database integrations are not live.",
                    "Local mode uses in-memory data for most records; only app settings persist to data/app-settings.json.",
                    "Documentation PDF generation requires Python with reportlab, pypdf, and pdfplumber.",
                    "The browser app is concentrated in public/app.js and should eventually be modularized.",
                ]},
            ],
        },
        {
            "id": "future-roadmap",
            "title": "Future Roadmap",
            "blocks": [
                {"type": "bullets", "items": [
                    "Connect approved reservation provider APIs and webhooks.",
                    "Complete restaurant team invitation UI.",
                    "Add background jobs for post-visit email timing, syncs, imports, and AI result attribution.",
                    "Connect Stripe checkout, portal, and webhooks.",
                    "Replace deterministic AI/demo logic with a secure AI service layer.",
                    "Add approved reservation APIs plus separate weather, event, and traffic feeds.",
                    "Add automated browser/E2E tests for guest, partner, admin, and Super Admin workflows.",
                ]},
            ],
        },
        {
            "id": "scale-architecture-readiness",
            "title": "Scale Architecture Readiness",
            "blocks": [
                {"type": "p", "text": "docs/SmartTable-Scale-Architecture.md documents the scale-readiness audit and safe refactor order."},
                {"type": "bullets", "items": [
                    "Central feature flags separate from Platform Mode.",
                    "Generalized booking metadata with booking_source and booking_status.",
                    "Structured offer-condition fields.",
                    "Review integrity rules.",
                    "Disabled-by-default push architecture.",
                    "SEO, performance, security, and component-library targets.",
                    "Safe implementation order for future growth.",
                ]},
            ],
        },
    ]


def write_markdown(path: Path, facts: dict):
    path.write_text(build_markdown(facts), encoding="utf-8")


def write_pdf(path: Path, sections: list[dict]):
    writer = PdfWriter(sections)
    pages = writer.build(path, collect_only=True)
    writer = PdfWriter(sections)
    writer.build(path, collect_only=False, toc_pages=pages)


def main():
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    facts = collect_repo_facts()
    write_markdown(MD_PATH, facts)
    write_pdf(PDF_PATH, section_blocks(facts))
    print(f"Wrote {MD_PATH}")
    print(f"Wrote {PDF_PATH}")


if __name__ == "__main__":
    main()
