# Teacher App Release Workflow

This project now ships with two build targets:

- `dist/dev`: readable files for local testing and QA
- `dist/prod`: minified, bundled, hashed, and obfuscated files for release

The production output is designed to make the shipped code harder to read, reuse, or reverse-engineer. It does this by:

- bundling each page's local JavaScript into a single file
- minifying HTML, CSS, and JavaScript
- obfuscating the JavaScript with control-flow flattening, string array encoding, dead-code injection, and self-defending output
- emitting hashed asset names under `dist/prod/assets`

## Install

Run this once before building:

```bash
npm install
```

## Development Workflow

Edit the source files in the project root:

- `index.html`
- `analytics.html`
- `report.html`
- `test-results.html`
- `style.css`
- `utils.js`
- `app.js`
- `analytics.js`
- `report.js`
- `test-results.js`

Build a readable development copy:

```bash
npm run build:dev
```

This creates `dist/dev` with the original HTML, CSS, and JS files copied as-is.

To run the app locally from the source folder:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/index.html
```

To run the built development copy instead:

```bash
cd dist/dev
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/index.html
```

## Production Release Workflow

Build the hardened release:

```bash
npm run build:prod
```

This generates:

- `dist/prod/*.html`
- `dist/prod/assets/*.css`
- `dist/prod/assets/*.js`

Production HTML is rewritten to reference hashed asset files, and the local page scripts are bundled and obfuscated per page.

To smoke-test the release build locally:

```bash
cd dist/prod
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/index.html
```

## Recommended Release Steps

1. Make and verify your source changes in the project root.
2. Run `npm run build:dev` and test the readable build if needed.
3. Run `npm run build:prod`.
4. Open the app from `dist/prod` and confirm login, dashboard, analytics, test results, and report pages all work.
5. Deploy only the contents of `dist/prod`.

## Commands

```bash
npm run build:dev   # readable build in dist/dev
npm run build:prod  # hardened release build in dist/prod
npm run build       # same as build:prod
npm run clean       # remove dist
```

## Notes

- Do not deploy the root source files if you want the hardened release behavior.
- Obfuscation raises the cost of inspection, but it does not make frontend code impossible to reverse-engineer.
- Firebase keys in client-side apps are still visible to browsers at runtime, so real protection must come from Firebase Auth rules, Firestore rules, and backend-side access control.
