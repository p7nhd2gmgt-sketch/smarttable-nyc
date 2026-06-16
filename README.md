# Smarttable.com

Production-ready MVP for discounted restaurant reservations.

## What is included

- Admin login and dashboard
- Restaurant login and dashboard
- Optional guest accounts
- Anonymous guest reservation flow
- Supabase PostgreSQL schema and RLS migrations
- Restaurant approval workflow
- Discounted table offer inventory
- Real reservation persistence through Supabase
- Reservation status tracking
- Confirmation/status emails through Resend
- Vercel API entry point
- SEO files for `smarttable.com`

## Local start

```powershell
.\start.ps1
```

Local URL:

```text
http://localhost:4173
```

Without Supabase env vars, the app runs in demo mode with:

```text
admin@smarttable.com / admin123
owner@hudsonhearth.com / restaurant123
guest@smarttable.com / guest123
```

## Environment

Copy `.env.example` into your host environment:

```text
PORT=4173
PUBLIC_BASE_URL=https://smarttable.com
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
EMAIL_FROM=Smarttable.com <reservations@smarttable.com>
RESEND_API_KEY=
```

## Database

SQL migrations are in:

```text
supabase/migrations/
```

See [supabase/README.md](supabase/README.md).

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md).

## Backups

Manual snapshot:

```powershell
.\save-project.ps1
```

Continuous autosave:

```powershell
.\autosave-project.ps1
```

Stop autosave:

```powershell
.\stop-autosave.ps1
```
