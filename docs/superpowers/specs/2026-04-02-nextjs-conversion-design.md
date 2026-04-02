# EPPS Demo: Vite+Express to Next.js Conversion

## Goal

Unify the frontend (Vite SPA) and backend (Express SOAP proxy) into a single Next.js App Router application. Keep the existing tab-based UI. Deploy to Vercel.

## Architecture

### Frontend

- `app/layout.jsx` — Root layout with MUI ThemeProvider, CssBaseline, Google Fonts
- `app/page.jsx` — Renders existing `App` component (sidebar + tab-based navigation)
- All existing React components move to `src/components/` unchanged, marked `'use client'`
- `src/hooks/`, `src/constants/`, `src/theme.js` remain unchanged

### API Routes (replacing `server.cjs`)

Each Express endpoint becomes a Next.js Route Handler:

| Express Endpoint | Next.js Route Handler |
|---|---|
| `POST /api/cardholders/find` | `app/api/cardholders/find/route.js` |
| `POST /api/cardholders/all` | `app/api/cardholders/all/route.js` |
| `POST /api/cardholders/efts` | `app/api/cardholders/efts/route.js` |
| `POST /api/cardholders/fees` | `app/api/cardholders/fees/route.js` |
| `POST /api/cardholders/fees-detailed` | `app/api/cardholders/fees-detailed/route.js` |
| `POST /api/eft/find` | `app/api/eft/find/route.js` |
| `POST /api/eft/status-date` | `app/api/eft/status-date/route.js` |
| `POST /api/eft/history` | `app/api/eft/history/route.js` |
| `POST /api/deposits/find-by-date` | `app/api/deposits/find-by-date/route.js` |
| `POST /api/fees/status-date` | `app/api/fees/status-date/route.js` |
| `POST /api/fees/find-by-date` | `app/api/fees/find-by-date/route.js` |

### Shared SOAP Utility: `lib/soap.js`

Extracted from `server.cjs`:
- `handleSoapRequest(method, params, responsePath?)` — builds SOAP XML, sends request, parses response, returns JSON
- SOAP concurrency limiter (max 3 simultaneous calls)
- XML parser configuration
- SOAP file logging for key methods
- Returns data directly (not Express `res.json()`) — route handlers wrap in `NextResponse.json()`

### Files Removed

- `server.cjs` — replaced by API routes + `lib/soap.js`
- `api/index.js` — Vercel serverless shim, no longer needed
- `vite.config.js` — replaced by `next.config.js`
- `index.html` — Next.js manages HTML rendering
- `vercel.json` — Next.js on Vercel needs no custom config

### Dependencies

**Added:** `next`

**Removed:** `@vitejs/plugin-react`, `vite` (rolldown-vite), `concurrently`, `express`, `cors`

**Kept:** `dotenv` (Next.js reads `.env` natively, but `process.env` works in API routes regardless), `easy-soap-request`, `xml2js`, all MUI/React/Recharts/Lucide deps

### Package Scripts

- `dev` → `next dev`
- `build` → `next build`
- `start` → `next start`
- `lint` → `next lint`

## Static Assets

- `public/csv/wire-payments-bulk-sandbox.csv` stays in `public/` (Next.js serves `public/` at root)

## Environment Variables

`EPPS_WSDL_URL`, `EPPS_USERNAME`, `EPPS_PASSWORD` — read via `process.env` in API routes. Set in Vercel dashboard for production.

## Testing

- Existing Jest tests updated to test `lib/soap.js` directly and/or use `next/test` patterns
- Test files remain in `tests/`

## Deployment

- Vercel auto-detects Next.js
- No `vercel.json` required
- Environment variables configured in Vercel dashboard
