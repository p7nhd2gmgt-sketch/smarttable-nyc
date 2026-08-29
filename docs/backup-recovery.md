# SmartTable backup and recovery

This runbook is the release-gate summary for SmartTable backups. The detailed canonical procedure is in [`production/SMARTTABLE_BACKUP_AND_RECOVERY.md`](production/SMARTTABLE_BACKUP_AND_RECOVERY.md).

## Required production policy

- Verify in the Supabase dashboard that automated daily database backups are enabled, record the retention period, and name an accountable owner.
- Export Storage objects separately; a database backup does not include restaurant, food-feed, or review media.
- Take an approved manual snapshot before every production schema rollout.
- Never test restore against production. Restore the selected backup into an isolated recovery/staging project.
- Encrypt exported backups, restrict access to release operators, and record creation, expiry, restore-test result, and deletion.

## Restore procedure

1. Declare the incident, stop non-essential writes through the application, and record the recovery point objective.
2. Select the most recent verified backup before the incident.
3. Restore it into a separate Supabase recovery project.
4. Apply only the migration chain known to match the target application commit.
5. Verify row counts, foreign keys, RLS, roles, restaurant tenant isolation, reservations, offers, reviews, subscriptions, audit logs, and Storage references.
6. Run the SmartTable release audit and security/RBAC probes against the recovery project.
7. Obtain explicit production approval before changing production traffic or data.
8. After recovery, monitor auth failures, API errors, reservation writes, email/webhook delivery, and audit-log continuity.

## Release checklist

- [ ] Automated backup status and retention verified in Supabase.
- [ ] Latest successful backup timestamp recorded.
- [ ] Storage backup/export covered.
- [ ] Restore tested in a non-production project in the last quarter.
- [ ] Recovery owner and escalation contacts recorded outside the repository.
- [ ] Recovery test proved RLS and tenant isolation, not only row counts.

**MANUAL ACTION REQUIRED:** repository code cannot prove the active Supabase plan, backup schedule, retention, or latest successful restore. A project owner must verify and record these in the provider dashboard before release.
