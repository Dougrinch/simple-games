# Repository Guidelines

## Project Structure & Module Organization

The React/Vite app lives in `src/`: orchestration in `app/`, features in `features/`, games in `games/`, and integrations in `platform/`. Colocate unit and component tests as `*.test.{ts,tsx}`. Firebase tests live in `tests/firebase/`, assets in `public/`, utilities in `scripts/`, and seed data in `firebase-data/`. Push delivery is implemented in `push-worker/`: code in `src/`, Workerd tests in `test/`, and configuration in `wrangler.jsonc`. It belongs to the root npm workspace; use root commands, never its `package.json` directly.

## Requirements

Use Node.js 24 (`.nvmrc`), npm 11+, and Java 21 for the Firebase Emulator Suite used by checks and coverage.

## Build, Test, and Development Commands

- `npm ci` installs exactly the locked dependencies.
- `npm run check` runs Oxlint, strict TypeScript checks, seed validation, unit and Firebase tests, and all push-worker checks.
- `npm run coverage` runs every test suite and writes the merged HTML and JSON reports to `coverage/all/`.
- `npm run production:wrangler:types:generate` regenerates `push-worker/worker-configuration.d.ts`. Run it after changing Worker variables, secrets, bindings, compatibility settings, or `push-worker/wrangler.jsonc`, then commit the generated file.

## Coding Style & Naming Conventions

Use two-space indentation, single quotes, and no semicolons. Keep TypeScript strict, prefer type-only imports, and avoid unused values. Use PascalCase for React components and files, camelCase for functions and variables, and name tests after their modules. Keep domain logic independent of UI and Firebase access behind platform or repository modules.

## Testing Guidelines

Vitest runs app tests in jsdom, Firebase integration tests against the Realtime Database Emulator, and Worker tests in Workerd. Add regression coverage with behavior changes and keep tests deterministic; unexpected network access should fail. No numeric coverage threshold is configured, so review the merged report for meaningful gaps.

## Commits, Pull Requests & Release Notes

Write focused commits with short imperative subjects, following history such as `Prevent page overscroll throughout the app`. Pull requests should explain the behavior change, link relevant issues, list validation performed, and include screenshots for visible UI changes.

**All user-visible changes—features, bug fixes, UI updates, or other observable behavior—must have an entry in `release-notes.json`.** Internal changes need no entry. Append the next sequential `id`; keep `text` to one line and at most 80 characters. Never edit, reorder, or remove existing entries.

## Security & Configuration

Never commit local environment files, Firebase credentials, VAPID private keys, or Worker secrets. Keep real values in ignored local files or deployment secret stores.
