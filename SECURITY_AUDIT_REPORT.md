# SMARTTABLE SECURITY AUDIT

**Date:** 2026-08-29  
**Commit:** `39a8c87` (`feature/guest-website-view-counter`, audit közben módosított munkafa)  
**Environment:** helyi izolált demo + `smarttable-staging` közvetlen RBAC/RLS és több-instance rate-limit QA  
**Production write/deployment a security audit során:** NEM  
**Adatbázis-migráció alkalmazva:** IGEN, kizárólag stagingen: `0069_security_hardening.sql`, `0070_distributed_api_rate_limits.sql`

## SUMMARY

| Súlyosság | Talált | Kódban javított | Nyitott release blocker |
|---|---:|---:|---:|
| P0 CRITICAL | 0 | 0 | 0 |
| P1 HIGH | 7 | 7 | 0 stagingen |
| P2 MEDIUM | 9 | 8 | 1 elfogadott upstream kockázat |
| P3 LOW | 3 | 1 | 2 dokumentált |

A webalkalmazás kódoldali authentication, authorization, input validation,
error handling, CSP és session hardeningje elkészült. A teljes helyi webes
regresszió, a 64 Playwright E2E teszt, a mobil tesztek és mind a négy mobil
export sikeres.

A staging security release gate teljesült. A `0069_security_hardening.sql` és
`0070_distributed_api_rate_limits.sql` kizárólag az ellenőrzött staging
projektre került alkalmazásra. Az anon/guest/partner/admin közvetlen API
próbák, a cross-tenant tiltások és két külön alkalmazáspéldány közös tartós
limitje sikeres. Production rollout továbbra is külön, explicit jóváhagyást és
megismételt ellenőrzést igényel; productionhöz ez a munka nem nyúlt.

## ISSUES

### SEC-001

**Severity:** P1 HIGH  
**Component:** Supabase SECURITY DEFINER RPC / RBAC  
**Description:** Az `admin_dashboard_stats()` és a
`restaurant_intelligence_summary(uuid)` végrehajtási felülete túl széles volt.
Az admin aggregáló függvény saját törzsében sem végzett minden esetben
jogosultság-ellenőrzést.  
**Exploit scenario:** Egy hitelesített, de nem admin felhasználó közvetlen
PostgREST RPC hívással aggregált platformadatot vagy tetszőleges étteremhez
kapcsolódó intelligencia-adatot kérhetett volna.  
**Fix:** A 0069 migráció visszavonja a PUBLIC/anon/authenticated EXECUTE
jogokat, csak `service_role` hozzáférést hagy, és az admin RPC törzsében is
`is_admin()` ellenőrzést végez. Az új függvények default PUBLIC EXECUTE joga is
vissza lett vonva.  
**Files changed:** `supabase/migrations/0069_security_hardening.sql`  
**Test:** `npm run check:security-hardening-0069`  
**Status:** STAGINGEN ALKALMAZVA ÉS KÖZVETLEN API PRÓBÁVAL IGAZOLVA; PRODUCTION DEPLOYMENT REQUIRED

### SEC-002

**Severity:** P1 HIGH  
**Component:** Supabase view grants / PII  
**Description:** A `reservation_overview`,
`restaurant_reviews_overview` és `admin_notifications_overview` érzékeny
vendég- vagy partneradatot tartalmaz, miközben az authenticated szerepkör
közvetlen SELECT joggal rendelkezhetett. Egy view tulajdonosi végrehajtási
szemantikája RLS megkerüléshez is vezethet.  
**Exploit scenario:** Egy alacsonyabb jogosultságú token közvetlen REST lekéréssel
más tenant vendégnevét, emailjét, foglalását vagy admin értesítését olvashatta
volna.  
**Fix:** A 0069 minden érzékeny táblát és view-t server-only kapcsolatra állít;
csak explicit, nem PII-t tartalmazó public read modellek maradnak publikusak.  
**Files changed:** `supabase/migrations/0069_security_hardening.sql`  
**Test:** 102/102 migrációban létrehozott tábla RLS audit; érzékeny relation
grant regression.  
**Status:** STAGINGEN ALKALMAZVA ÉS IGAZOLVA; PRODUCTION DEPLOYMENT REQUIRED

### SEC-003

**Severity:** P1 HIGH  
**Component:** Profile privilege escalation / tenant binding  
**Description:** A self-update policy önmagában nem tiltotta elég erősen a
`role`, `restaurant_id`, `status` és `is_test_data` mezők módosítását.  
**Exploit scenario:** Manipulált közvetlen update requesttel egy felhasználó
megpróbálhatta magát magasabb szerepkörhöz vagy más étteremhez kötni.  
**Fix:** `protect_profile_security_fields` BEFORE UPDATE trigger blokkolja a
biztonsági mezők változtatását; a backend service-role admin útvonalai továbbra
is a saját centralizált jogosultság- és audit-ellenőrzéseik után működnek.  
**Files changed:** `supabase/migrations/0069_security_hardening.sql`  
**Test:** self-promotion statikus regression + staging szerepkör/tenant
izolációs API próba.  
**Status:** STAGINGEN ALKALMAZVA ÉS SELF-ESCALATION PRÓBÁVAL IGAZOLVA; PRODUCTION DEPLOYMENT REQUIRED

### SEC-004

**Severity:** P1 HIGH  
**Component:** Privileged authentication/session  
**Description:** Az admin/superadmin session túl tartós lehetett a böngészőben,
az impersonation aláírás újrahasznosíthatta a Supabase service-role secretet,
és fejlesztői fallback secret létezett.  
**Exploit scenario:** Ellopott tartós browser storage vagy újrahasznosított
secret több érzékeny jogosultsági határt veszélyeztethetett.  
**Fix:** Admin/superadmin session kizárólag `sessionStorage`; régi privileged
localStorage törlés; külön, minimum 32 karakteres `IMPERSONATION_SECRET`;
productionben nincs hardcoded fallback; privileged token max-age és
konfigurálható AAL2/MFA kényszerítés. Demo token productionben fail-closed.  
**Files changed:** `src/app-core.js`, `public/app.js`, `.env.example`,
`e2e/smarttable-basic.spec.js`  
**Test:** production hardening/auth-flow checks, 64/64 E2E, négy szerepkörös
staging login/refresh/logout E2E.  
**Status:** FIXED; MFA éles bekapcsolása MANUAL ACTION REQUIRED

### SEC-005

**Severity:** P1 HIGH  
**Component:** Multi-instance rate limiting  
**Description:** A route-specifikus IP és identity limiterek process-memory
Map tárolót használnak. Ez helyben és egyetlen példányon működik, de serverless
horizontal scalingnél nem globális.  
**Exploit scenario:** A támadó több cold instance között elosztva nagyobb login,
password reset vagy booking forgalmat érhet el, mint az egy példányra számolt
limit.  
**Fix:** A kódban külön login/signup/recovery/booking/email/admin limitek,
identity-hash és IP kulcsok készültek. A `0070` staging migráció service-only,
atomikus, tartós fixed-window limitert és RLS-védett tárolót hozott létre. A
nyers IP nem kerül adatbázisba, csak SHA-256 bucket hash. A recovery útvonalak
megtartják az enumeration-safe, route-specifikus válaszaikat.  
**Files changed:** `src/app-core.js`, `.env.example`,
`supabase/migrations/0070_distributed_api_rate_limits.sql`,
`scripts/check-distributed-rate-limiting.js`,
`scripts/apply-staging-distributed-rate-limit-0070.mjs`,
`scripts/check-staging-distributed-rate-limit.mjs`  
**Test:** service sequence `allowed, allowed, denied`; két külön app instance
sequence `404, 404, 429`; resend-verification több instance-on az első három
kérést elfogadja, a negyediket `VERIFICATION_RESEND_RATE_LIMITED` 429-cel
elutasítja; anon/guest direct table és RPC hozzáférés DENIED.  
**Status:** STAGINGEN FIXED ÉS MULTI-INSTANCE PRÓBÁVAL IGAZOLVA; PRODUCTION ROLLOUT REQUIRED

### SEC-006

**Severity:** P1 HIGH  
**Component:** Direct data mutation boundary  
**Description:** Az authenticated közvetlen table write/RPC grantok lehetővé
tehették az API input validation, tenant authorization, rate limit és audit log
réteg megkerülését.  
**Exploit scenario:** Egy kliens közvetlen Supabase REST/RPC kéréssel manipulált
`restaurant_id`, `user_id` vagy státusz értéket küld.  
**Fix:** A 0069 server-only mutation boundaryt hoz létre, a public katalógus
modelleken csak SELECT marad.  
**Files changed:** `supabase/migrations/0069_security_hardening.sql`  
**Test:** grant list regression, staging tenant isolation read probe.  
**Status:** STAGINGEN ALKALMAZVA ÉS CROSS-TENANT PRÓBÁVAL IGAZOLVA; PRODUCTION DEPLOYMENT REQUIRED

### SEC-007

**Severity:** P1 HIGH  
**Component:** Admin MFA and re-authentication  
**Description:** Nem volt egységes, kikényszeríthető MFA és rövidebb privileged
session policy.  
**Exploit scenario:** Ellopott admin access token a normál session teljes
élettartamáig felhasználható.  
**Fix:** `ADMIN_ACCESS_TOKEN_MAX_AGE_SECONDS`,
`PRIVILEGED_REAUTH_REQUIRED`, `ADMIN_MFA_REQUIRED` és AAL2 ellenőrzés készült.  
**Files changed:** `src/app-core.js`, `.env.example`  
**Test:** production auth-flow és hardening statikus/dinamikus regresszió.  
**Status:** FIXED IN CODE / ENROLLMENT AND ENABLEMENT REQUIRED

### SEC-008

**Severity:** P2 MEDIUM  
**Component:** API validation  
**Description:** A reservation input túl sok extra mezőt és több hibás formátumot
engedhetett át.  
**Exploit scenario:** Manipulált role/user/restaurant mező, invalid UUID,
negatív party size, túl hosszú szöveg, hibás dátum/idő vagy injection payload.  
**Fix:** strict allowlist, UUID/email/date/time/length/range ellenőrzés, party
size 1-50, ismeretlen mezők elutasítása és biztonságos hibakódok.  
**Files changed:** `src/app-core.js`  
**Test:** invalid UUID, extra role, oversized notes, XSS és SQL-injection-style
payload regression.  
**Status:** FIXED

### SEC-009

**Severity:** P2 MEDIUM  
**Component:** JSON parsing / error disclosure  
**Description:** A Vercel adapter a malformed JSON-t üres objektummá alakíthatta,
a helyi szerver pedig internal exception szöveget adhatott vissza.  
**Exploit scenario:** Validation megkerülési kísérlet vagy stack/internal path,
SQL/env információ kiszivárgása.  
**Fix:** malformed JSON -> 400, oversized body -> 413, production válaszban
generic error; részletek csak strukturált szerverlogban.  
**Files changed:** `api/index.js`, `server.js`  
**Test:** syntax check + security hardening regression.  
**Status:** FIXED

### SEC-010

**Severity:** P2 MEDIUM  
**Component:** CSP / browser service boundary  
**Description:** A CSP `script-src 'unsafe-inline'` értéket és közvetlen browser
Supabase/Resend connect célokat engedett.  
**Exploit scenario:** HTML injection esetén inline script futás, illetve egy
frontend hibából közvetlen szolgáltatáshívás.  
**Fix:** inline executable script eltávolítva külső bootstrap fájlokba;
`script-src` hash-alapú JSON-LD kivétel; Supabase/Resend browser connect törölve;
HSTS, nosniff, referrer, permissions, frame-ancestors és COOP megmaradt.  
**Files changed:** `public/index.html`, `public/theme-bootstrap.js`,
`public/analytics-bootstrap.js`, `src/security-headers.js`, `vercel.json`  
**Test:** CSP exact regression + 64/64 browser E2E.  
**Status:** FIXED

### SEC-011

**Severity:** P2 MEDIUM  
**Component:** Auth enumeration and abuse  
**Description:** Login és recovery válasz/limiter nem mindenhol biztosított
egyenértékű identity-alapú védelmet.  
**Exploit scenario:** Ismert és ismeretlen email válaszának összehasonlítása,
majd automatizált brute force vagy password-reset flood.  
**Fix:** azonos status/copy, normalizált hash identity limiter, IP limiter,
endpoint-specifikus limitek és generic 429.  
**Files changed:** `src/app-core.js`, `.env.example`  
**Test:** ismert/ismeretlen hibás login válaszazonosság és 429 regression.  
**Status:** FIXED; STAGINGEN A TARTÓS LIMITERREL IGAZOLVA

### SEC-012

**Severity:** P2 MEDIUM  
**Component:** Dependency security  
**Description:** A web audit tiszta. A mobil audit 11 moderate tranzitív jelzést
ad az Expo SDK build-time `@expo/config-plugins -> xcode -> uuid@7.0.3`
láncára. Az npm ajánlott automatikus fix hibásan Expo 46-ra vagy inkompatibilis
major `expo-splash-screen` verzióra váltana.  
**Exploit scenario:** A konkrét `uuid` advisory csak a build-time v3/v5/v6
buffer paraméter használatát érinti; a csomag nincs az app futási auth/API
útvonalán, és az `xcode` csomagban a függőség nem kerül meghívásra.  
**Fix:** Expo SDK 57 csomagok a hivatalosan elvárt patch szintre frissítve;
21/21 Expo Doctor és minden export ellenőrizve. Inkompatibilis major fix nem
lett erőltetve.  
**Files changed:** mobil `package-lock.json`, Guest/Partner `package.json`  
**Test:** mobile full check, Expo Doctor, Android/iOS export.  
**Status:** UPSTREAM P2 RISK ACCEPTED UNTIL EXPO PATCH

### SEC-013

**Severity:** P2 MEDIUM  
**Component:** Upload security  
**Description:** A review és éttermi média feltöltés MIME/extension/size/name
határait regresszióval kellett bizonyítani.  
**Exploit scenario:** executable/polyglot fájl, path traversal vagy oversized
payload tárolása.  
**Fix:** meglévő media validation és server API boundary megtartva; executable
típusok tiltottak, random storage név és méretkorlát ellenőrzött.  
**Files changed:** nincs további runtime módosítás  
**Test:** consumption/upload security 13/13 PASS; mobile media validation PASS.  
**Status:** VERIFIED

### SEC-014

**Severity:** P2 MEDIUM  
**Component:** Stripe/payment  
**Description:** Ellenőrizni kellett, hogy nincs raw card storage, kliens által
választható tetszőleges price, aláírás nélküli vagy duplikált webhook elfogadás.  
**Exploit scenario:** hamis/replayed webhook vagy manipulált subscription price.  
**Fix:** meglévő server-side price allowlist, Stripe signature validation és
event/idempotency boundary megtartva.  
**Files changed:** nincs további payment runtime módosítás  
**Test:** Stripe billing és webhook regressions PASS.  
**Status:** VERIFIED

### SEC-015

**Severity:** P2 MEDIUM  
**Component:** Backup, recovery, privacy, retention  
**Description:** A recovery és adatminimalizálási eljárás nem volt egy helyen,
release-gate szinten dokumentálva.  
**Exploit scenario:** incidens után bizonytalan restore, túl hosszú PII/log
retention vagy hiányos account deletion/export folyamat.  
**Fix:** backup/restore runbook, recovery checklist, privacy-retention,
account deletion/export és PII logging szabályok dokumentálva.  
**Files changed:** `docs/backup-recovery.md`,
`docs/privacy-data-retention.md`, `docs/security-operations.md`  
**Test:** dokumentum és release-check jelenlét ellenőrzés.  
**Status:** FIXED IN DOCUMENTATION / PROVIDER DRILL REQUIRED

### SEC-016

**Severity:** P2 MEDIUM  
**Component:** Staging security readiness  
**Description:** A staging RBAC/RLS és több-instance abuse protection éles
adatbázis-szintű bizonyítása szükséges volt; a böngészőből elérhető, teljesen
izolált HTTPS staging app-origin továbbra sincs azonosítva.  
**Exploit scenario:** DB-hardening nélkül közvetlen grant kockázatok, közös
limiter nélkül serverless instance-szétosztásos limitmegkerülés maradhatott volna.  
**Fix:** a 0069 és 0070 migrációk kizárólag stagingre kerültek, fail-closed
beállítással. Az alkalmazás helyben a staging backend ellen, valamint közvetlen
PostgREST/RPC próbákkal lett ellenőrizve.  
**Files changed:** `scripts/check-staging-native-push-readiness.mjs`,
`supabase/migrations/0068_native_mobile_push.sql`,
`supabase/migrations/0069_security_hardening.sql`  
**Test:** anon profiles DENIED; guest partner/admin adatok DENIED; Partner A ->
Restaurant B update és booking read DENIED; partner/admin privileged RPC DENIED;
self role escalation DENIED; két app instance közös 429; raw IP storage nincs.  
**Status:** STAGING SECURITY PASS; ISOLATED HTTPS APP ORIGIN MANUAL ACTION REQUIRED A TELJES TÁVOLI BÖNGÉSZŐS QA-HOZ

### SEC-017

**Severity:** P3 LOW  
**Component:** Style CSP  
**Description:** `style-src 'unsafe-inline'` még szükséges, mert a BASIC UI-ban
sok meglévő inline style attribútum van.  
**Exploit scenario:** Kizárólag CSS injection felületet növel; script execution
nem engedélyezett, és a DOM inputok escaping/validation alatt állnak.  
**Fix:** executable inline JavaScript teljesen eltávolítva; style refaktor külön,
nem release-blocking feladatként dokumentálva.  
**Files changed:** `src/security-headers.js`, `vercel.json`  
**Test:** CSP regression.  
**Status:** OPEN P3 / DOCUMENTED

## AUTOMATIZÁLT TESZTEK ÉS BUILD EREDMÉNYEK

| Gate | Eredmény |
|---|---|
| Web `npm test` | PASS |
| Web syntax/check | PASS |
| Web lint | PASS |
| Web production build | PASS |
| Security hardening 0069 | PASS, 102/102 RLS tábla audit |
| Staging 0069 live RBAC/RLS | PASS, minden tiltott cross-role/cross-tenant próba DENIED |
| Distributed rate limiting 0070 | PASS, service-only + két app instance közös limit |
| Secret scan | PASS, credential-like találat nincs |
| Playwright teljes E2E | PASS, 64/64 |
| Staging test accounts + direct RBAC API | PASS, 4/4 szerepkör |
| Staging browser auth/route E2E | PASS, 4/4 szerepkör |
| Guest/Core mobile | PASS, 93/93 |
| Partner mobile | PASS, 42/42 |
| Mobile TypeScript | PASS, minden workspace |
| Guest Expo Doctor | PASS, 21/21 |
| Partner Expo Doctor | PASS, 21/21 |
| Guest Android/iOS export | PASS / PASS |
| Partner Android/iOS export | PASS / PASS |

## DEPENDENCY AUDIT

| Terület | Critical | High | Moderate | Action |
|---|---:|---:|---:|---|
| Web | 0 | 0 | 0 | nincs szükséges update |
| Mobile | 0 | 0 | 11 tranzitív lánctalálat | Expo SDK patch frissítve; inkompatibilis major fix elutasítva; upstream követés |

Az `npm audit fix --force` nincs engedélyezve és nem biztonságos: a javaslat az
aktuális Expo 57-ről régi vagy inkompatibilis major csomagra váltana. Ez működő
security kontrollt és buildet törhetne el.

## MANUAL ACTION REQUIRED

1. **Izolált staging app-origin:** állíts be explicit HTTPS SmartTable staging
   web/API origint a teljes távoli böngészős QA-hoz. Production nem használható
   fallbackként. A staging adatbázis és a helyi app -> staging ellenőrzés kész.
2. **Production DB rollout:** csak a staging bizonyítás után, külön explicit
   production jóváhagyással alkalmazható. Jelen audit nem alkalmazta.
3. **Production distributed limiter:** a 0070 migrációt és a fail-closed env
   kapcsolókat csak külön production jóváhagyással lehet élesíteni.
4. **Privileged secrets/MFA:** védett környezeti változóban külön legalább 32
   karakteres `IMPERSONATION_SECRET`; admin és superadmin AAL2 enrollment után
   `ADMIN_MFA_REQUIRED=true`.
5. **Email domain:** Resend/SmartTable küldő domain SPF, DKIM és DMARC státusz
   ellenőrzése; ez kódból nem bizonyítható teljesen.
6. **Backup provider:** Supabase automated backup gyakoriság és retention
   ellenőrzése, majd dokumentált staging restore drill.
7. **Native push staging:** `MOBILE_PUSH_PROVIDER=expo`, külön 32+ karakteres
   encryption key, explicit staging origin és a 0068 schema ellenőrzése. A
   readiness checker addig helyesen fail-closed.

## RELEASE GATE

**P0 nyitott:** 0  
**P1 nyitott stagingen:** 0

# STAGING SECURITY RELEASE STATUS: PASS

A 0069 RBAC/RLS hardening és a 0070 tartós, több példány között közös limiter
stagingen alkalmazva és közvetlen negatív/pozitív próbákkal igazolva.

# PRODUCTION SECURITY RELEASE STATUS: FAIL / MANUAL ACTION REQUIRED

Ez nem production rollout. A production adatbázis és környezeti konfiguráció
változatlan; ott a 0069/0070 csak külön explicit jóváhagyással alkalmazható.
