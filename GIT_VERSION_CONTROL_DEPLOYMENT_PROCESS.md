# Git, Version Control, and Deployment-Ready Process

## 1. What version control means

Version control is the system used to track source-code changes over time. In this project, the version control system is Git.

Git helps the team:

- track who changed what and when
- create safe feature branches
- review changes before merging
- recover older working versions
- prepare stable releases for deployment

## 2. Why Git matters for SME_LoanHub

This repository has multiple change-sensitive areas:

- React frontend in `src/`
- Express backend in `server/`
- Supabase SQL migrations in `supabase/migrations/`
- ML-related logic and artifacts
- deployment config for Railway/Heroku

Without disciplined Git usage, it is easy to break:

- auth and approval flows
- admin-only access
- ML prediction fallback logic
- document upload and OCR behavior
- deployment configuration

## 3. Recommended Git workflow

Use a simple branch-based workflow.

### Main branches

- `main`: production-ready code only
- `feature/<name>`: new feature work
- `fix/<name>`: bug fixes
- `hotfix/<name>`: urgent production fixes
- `release/<version>`: optional release stabilization branch

### Branch naming examples

- `feature/document-verification-rules`
- `feature/admin-ml-dashboard`
- `fix/loan-results-invalid-id`
- `hotfix/whatsapp-webhook-validation`

## 4. Daily Git usage process

### 4.1 Start new work

```bash
git checkout main
git pull origin main
git checkout -b feature/<short-name>
```

### 4.2 Check current changes

```bash
git status
git diff
git diff --staged
```

### 4.3 Stage only intended files

```bash
git add src/pages/LoanResults.tsx
git add src/test/loan-results.test.tsx
```

Avoid blindly using `git add .` unless you have already reviewed the whole worktree.

### 4.4 Commit with clear messages

Recommended format:

```text
type(scope): short summary
```

Examples:

- `feat(documents): support jpeg for required document uploads`
- `fix(results): fall back to first valid application id`
- `test(ml): cover bootstrap readiness restrictions`
- `docs(deploy): add railway release checklist`

### 4.5 Push branch

```bash
git push -u origin feature/<short-name>
```

## 5. Good Git management rules

### 5.1 What to commit

Commit:

- source code
- tests
- migration files
- deployment config
- documentation

Do not commit:

- `.env`
- secrets and tokens
- local caches
- temporary debug files unless intentionally shared

### 5.2 Keep commits small

One commit should ideally represent one logical change:

- one fix
- one feature slice
- one migration
- one documentation update

### 5.3 Always review before commit

Use:

```bash
git diff --cached
```

before every commit.

### 5.4 Tag release points

Use Git tags for deployable versions.

Example:

```bash
git tag v1.2.0
git push origin v1.2.0
```

## 6. Suggested versioning policy

Use semantic versioning:

- `MAJOR`: breaking change
- `MINOR`: backward-compatible feature
- `PATCH`: backward-compatible bug fix

Examples:

- `v1.0.0`: first stable production release
- `v1.1.0`: new admin capability added
- `v1.1.1`: production bug fix only

## 7. Pull request and merge management

Before merging to `main`, require:

- code review
- passing tests
- passing type checks
- successful build
- migration review for SQL changes
- deployment impact review for env/config changes

Preferred merge rule:

- squash merge for small feature branches
- regular merge if preserving commit history is important

## 8. Deployment-ready process for this repo

This project is deployment-ready only when all of the following are true.

### 8.1 Code readiness

- feature is complete
- no known blocker defects
- related tests added or updated
- no accidental debug code
- no secrets in tracked files

### 8.2 Validation readiness

Run these commands before release:

```bash
npm test
npm run lint
npm run typecheck:server
npx tsc -p tsconfig.app.json --noEmit
npm run build
```

For this workspace, the current practical baseline passed:

- `npm test`
- `npm run typecheck:server`
- `npx tsc -p tsconfig.app.json --noEmit`
- `npm run build`

`npm run lint` passed with warnings, not errors.

### 8.3 Database readiness

If database changes exist:

- verify new SQL migration order
- confirm migrations apply on a clean database
- confirm seed data still works
- verify RLS behavior is not weakened

### 8.4 Environment readiness

Confirm required environment variables are set for the target deployment.

Important variables include:

- `NODE_ENV`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_BASE_URL`
- `CORS_ORIGIN`
- `AGENT_WEBHOOK_SECRET`
- `ML_ASSETS_DIR`
- OCR, Telegram, WhatsApp, and Twilio variables as needed

## 9. Deployment process

### 9.1 Recommended production path: Railway

This repo is already structured as a single Railway web service:

- `npm run build` builds the frontend into `dist/`
- `npm start` runs the Express server
- the Express app serves both frontend and `/api/*`

### 9.2 Railway deployment steps

1. Merge approved code into `main`.
2. Push `main` to GitHub.
3. Ensure Railway service variables are configured.
4. Deploy from the repository root.
5. Verify `GET /api/health`.
6. Verify frontend root `/`.
7. Run smoke checks for login, dashboard, apply, and admin access.

### 9.3 Minimum post-deploy smoke checks

- homepage loads
- `GET /api/health` returns success
- login works
- approved user can reach dashboard
- admin can reach admin overview
- application evaluation works
- document upload route responds

## 10. Deployment checklist

Use this checklist before every production deployment.

| Area | Check |
| --- | --- |
| Git | branch is up to date with `main` |
| Git | working tree reviewed before merge |
| Git | release commit/tag created if needed |
| Code | feature complete and reviewed |
| Tests | `npm test` passed |
| Lint | `npm run lint` reviewed |
| Types | server and app type checks passed |
| Build | production build succeeded |
| DB | migrations reviewed and ready |
| Env | required variables configured |
| Deploy | Railway service points to correct repo/root |
| Verify | `/api/health` and core UI smoke checks pass |

## 11. Release management flow

Recommended release sequence:

1. Finish work on `feature/*` or `fix/*`.
2. Run local validation commands.
3. Open pull request.
4. Review code and test evidence.
5. Merge into `main`.
6. Tag release version if needed.
7. Deploy to Railway.
8. Run smoke checks.
9. Monitor logs and rollback if needed.

## 12. Hotfix process

For urgent production issues:

```bash
git checkout main
git pull origin main
git checkout -b hotfix/<issue-name>
```

Then:

1. make the minimum safe fix
2. run the critical validation commands
3. merge to `main`
4. deploy immediately
5. tag the hotfix release

Example tag:

```bash
git tag v1.1.2
git push origin v1.1.2
```

## 13. Rollback thinking

A deployment plan is incomplete without rollback thinking.

If deployment fails:

- identify whether the issue is code, environment, or migration related
- roll back to the last known good Git tag if the issue is application code
- avoid destructive rollback of database migrations unless a tested rollback path exists
- verify health endpoint and login again after rollback

## 14. Recommended team rules

- protect `main`
- do not push unreviewed work directly to `main`
- require at least one reviewer for production-impacting changes
- require test evidence for business logic changes
- require migration review for every SQL file
- require env review for deployment/config changes
- use tags for every production release

## 15. Short summary

Git is the control system that protects this project from uncontrolled change. Good Git usage means small branches, clear commits, reviewed merges, tagged releases, and validated deployments. A deployment-ready process for this repo means code is tested, typed, built, migration-safe, correctly configured, and verified after release.
