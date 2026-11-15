# PharmaDesk Phase 12 — Deployment & Operations Runbook (`asia-south1`)

This runbook documents the controlled deployment, IAM baseline, monitoring, Firestore backup/PITR configuration, budget controls, and rollback procedures for PharmaDesk on **Firebase + Google Cloud Run (`asia-south1`, Mumbai)**.

---

## 1. Environment Separation

| Environment | Frontend Hosting | Backend Cloud Run | Database / Auth / Storage | App Check Enforcement |
| :--- | :--- | :--- | :--- | :--- |
| **Local Dev** | Vite Dev Server (`:3000`, `/api` proxied to `:3001`) | Express + `tsx` (`:3001`) | Firebase Emulator Suite (`:8080`, `:9099`, `:9199`) or dev Firebase config | `FIREBASE_APP_CHECK_REQUIRED=false` |
| **Staging** | Firebase Hosting preview channel `staging` (`pharmadesk-cloud--staging-*.web.app`) | `pharmadesk-api-staging` (`asia-south1`) | Staging/isolated Firebase configuration or non-prod pilot project | Test `false` -> enable `true` once reCAPTCHA key is verified |
| **Production** | Firebase Hosting (`pharmadesk-cloud.web.app`) | `pharmadesk-api` (`asia-south1`) | Cloud Firestore + Firebase Auth + Firebase Storage (`pharmadesk-cloud`) | `FIREBASE_APP_CHECK_REQUIRED=true` after staging sign-off |

> **Rule**: Never use `VITE_API_BASE_URL=http://localhost...` or `CORS_ALLOWED_ORIGINS=*` / `localhost` when `NODE_ENV=production`. Both frontend (`src/lib/apiConfig.ts`) and backend (`server/src/config/env.ts`) enforce fail-closed guards.

---

## 2. IAM Least-Privilege & Secret Manager Setup (Owner Execution Required)

Create a dedicated Cloud Run runtime service account instead of using the default Compute Engine service account:

```bash
export PROJECT_ID="pharmadesk-cloud"
export REGION="asia-south1"
export RUNTIME_SA="pharmadesk-api-runtime@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts create pharmadesk-api-runtime \
  --project="${PROJECT_ID}" \
  --display-name="PharmaDesk Cloud Run API Runtime"

# Minimal runtime roles: Firestore, Storage object access, Auth verification/revocation, Logging
for ROLE in \
  "roles/datastore.user" \
  "roles/storage.objectAdmin" \
  "roles/firebaseauth.admin" \
  "roles/logging.logWriter" \
  "roles/monitoring.metricWriter" \
  "roles/cloudtrace.agent"; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="${ROLE}"
done
```

If optional server-side secrets (such as `GEMINI_API_KEY`) are enabled later, store them in Secret Manager and grant `roles/secretmanager.secretAccessor` only to `${RUNTIME_SA}`:

```bash
printf "%s" "$GEMINI_API_KEY" | gcloud secrets create GEMINI_API_KEY --project="${PROJECT_ID}" --data-file=-
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --project="${PROJECT_ID}" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/secretmanager.secretAccessor"
```

---

## 3. Cloud Run & Firebase Production Deployment Commands

### 3.1 Cloud Run API (`pharmadesk-api` in `asia-south1`)

Because Firebase Hosting rewrites `/api/**` to Cloud Run service `pharmadesk-api` (`firebase.json`), the Cloud Run edge accepts HTTPS traffic from Firebase Hosting (`--allow-unauthenticated`), while the Express backend enforces Firebase Auth ID token verification (`firebaseAuthMiddleware`), tenant/branch scoping, CORS allowlisting, helmet security headers, rate limiting, and optional App Check (`FIREBASE_APP_CHECK_REQUIRED=true`).

```bash
gcloud run deploy pharmadesk-api \
  --project="${PROJECT_ID}" \
  --source=. \
  --region="${REGION}" \
  --service-account="${RUNTIME_SA}" \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=10 \
  --concurrency=80 \
  --cpu=1 \
  --memory=512Mi \
  --timeout=60 \
  --set-env-vars="NODE_ENV=production,TRUST_PROXY=1,FIREBASE_PROJECT_ID=${PROJECT_ID},FIREBASE_STORAGE_BUCKET=${PROJECT_ID}.appspot.com,CORS_ALLOWED_ORIGINS=https://${PROJECT_ID}.web.app,https://${PROJECT_ID}.firebaseapp.com,FIREBASE_APP_CHECK_REQUIRED=false,BACKUP_BUCKET_NAME=gs://${PROJECT_ID}-firestore-backups/${REGION}"
```

### 3.2 Firebase Hosting, Firestore Rules, Indexes & Storage Rules

```bash
bun run build:frontend
firebase deploy \
  --project="${PROJECT_ID}" \
  --only firestore:rules,firestore:indexes,storage,hosting \
  --non-interactive
```

### 3.3 Firebase Auth & App Check Console Checklist

1. Enable **Email/Password** provider in Firebase Authentication.
2. Add authorized domains (`localhost` only for dev/staging if needed, `pharmadesk-cloud.web.app`, `pharmadesk-cloud.firebaseapp.com`, and any custom production domain).
3. Configure Password Reset email template sender and authorized redirect URL.
4. Register the Web App in Firebase **App Check** with reCAPTCHA v3 / Enterprise, inject `VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY` at frontend build time, verify staging requests send `X-Firebase-AppCheck`, then flip `FIREBASE_APP_CHECK_REQUIRED=true` on Cloud Run.

---

## 4. Automated Backups, PITR & Disaster Recovery (`asia-south1`)

### 4.1 Enable Firestore Point-in-Time Recovery (PITR)

```bash
gcloud firestore databases update \
  --project="${PROJECT_ID}" \
  --database="(default)" \
  --enable-pitr
```

### 4.2 Daily Scheduled Firestore Export to Regional Coldline GCS Bucket

```bash
gsutil mb -p "${PROJECT_ID}" -l "${REGION}" -c COLDLINE "gs://${PROJECT_ID}-firestore-backups"
gsutil versioning set on "gs://${PROJECT_ID}-firestore-backups"

gcloud firestore backups schedules create \
  --project="${PROJECT_ID}" \
  --database="(default)" \
  --recurrence=daily \
  --retention=14w

gcloud scheduler jobs create http firestore-daily-export \
  --project="${PROJECT_ID}" \
  --location="${REGION}" \
  --schedule="30 20 * * *" \
  --time-zone="UTC" \
  --uri="https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default):exportDocuments" \
  --http-method=POST \
  --oauth-service-account-email="${RUNTIME_SA}" \
  --message-body="{\"outputUriPrefix\":\"gs://${PROJECT_ID}-firestore-backups/asia-south1\"}"
```

### 4.3 Restore Drill Procedure

Verify exports restore cleanly into an isolated staging database/project (`gcloud firestore databases import gs://...`), then execute `POST /api/v1/security/dr-drills` (`DR_DRILL_EXECUTED`) to confirm zero unbalanced accounting journals.

---

## 5. Monitoring, Alerts & Budget Protection

### 5.1 Cloud Monitoring Checks to Provision

- **Uptime Check**: HTTPS check against `https://${PROJECT_ID}.web.app/api/v1/health/live` every 1 minute from multiple probes, alerting on 2+ consecutive failures.
- **Cloud Run 5xx & Latency Alerts**: Alert when `run.googleapis.com/request_count` with `response_code_class="5xx"` exceeds threshold or p95 latency > 2000ms for 5 minutes.
- **Log-Based Metrics (from Express Pino JSON logs)**:
  - Auth brute-force / 401/403 spikes
  - `POST /api/v1/auth/logout` session revocations
  - Financial/journal mismatch errors (`500` on `/invoices` or `/accounting`)

### 5.2 Billing Alerts vs Hard Spending Caps

> **IMPORTANT**: Google Cloud **Billing Budgets & Alerts send email/PubSub notifications only — they do NOT automatically stop spending or shut down services**.
>
> To prevent runaway cost during pilot:
> 1. Set hard Cloud Run scaling ceilings (`--max-instances=10` production, `--max-instances=3` staging, `--min-instances=0`).
> 2. Enforce Express API rate limiting (`RATE_LIMIT_MAX_REQUESTS`, sensitive endpoint limiters) and Firebase Storage 15MB upload limits.
> 3. Optionally wire the Cloud Billing Budget Pub/Sub topic to a billing kill-switch Cloud Function for non-production/sandbox projects only (never auto-unlink billing on live medical store tenants without manual approval).

---

## 6. Post-Deploy Smoke & Pilot Verification Checklist

1. `GET /api/v1/health/live` returns `200 OK`.
2. `GET /api/v1/health/ready` returns `200 OK` (confirms Cloud Firestore Admin SDK connectivity).
3. Unauthenticated `GET /api/v1/customers` returns `401 Unauthorized`.
4. Firebase Email/Password sign-in populates live membership, branch assignment, and `Authorization: Bearer <token>`.
5. Verify POS checkout creates invoice + decrements FEFO batch stock + posts balanced accounting journal.
6. Verify cross-tenant / cross-branch access attempt returns `403 Forbidden`.
7. Verify file upload rejects disallowed extensions/SVG and enforces 15MB ceiling.
8. Verify `POST /api/v1/auth/logout` revokes refresh tokens and clears client session.

---

## 7. Rollback Procedure

### Rollback Backend (Cloud Run)

List revisions and immediately route 100% traffic back to the last known healthy revision:

```bash
gcloud run revisions list --service=pharmadesk-api --region="${REGION}" --project="${PROJECT_ID}"
gcloud run services update-traffic pharmadesk-api \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --to-revisions=<PREVIOUS_HEALTHY_REVISION>=100
```

### Rollback Frontend (Firebase Hosting)

Roll back via Firebase Console -> Hosting -> Release History -> Rollback on the target release, or re-deploy the verified git tag (`git checkout <GOOD_TAG> && bun run build:frontend && firebase deploy --only hosting --project ${PROJECT_ID}`).

### Rollback Security Rules / Indexes

Checkout the previous known-good commit and re-deploy rules only:

```bash
firebase deploy --only firestore:rules,storage --project="${PROJECT_ID}"
```
