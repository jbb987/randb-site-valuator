# CLAUDE.md — R&B Power Platform

## Project Overview

Internal tool suite for R&B Power. Currently has one tool (Site Valuator) with plans to add more.
Evaluates renewable energy site value based on power capacity, acreage, and land comparables.

## Tech Stack

- **Framework:** React 19 + TypeScript
- **Build:** Vite
- **Styling:** Tailwind CSS v4
- **Routing:** React Router DOM v7
- **Backend:** Firebase (Firestore)
- **Animation:** Framer Motion
- **Deploy:** GitHub Pages via GitHub Actions (pushes to `main`)

## Project Structure

```
src/
  App.tsx              # Root routes
  main.tsx             # Entry point
  components/
    Layout.tsx          # Shared page wrapper (Navbar + Breadcrumb + content)
    Breadcrumb.tsx      # Route-aware breadcrumb navigation
    navbar/             # Navbar, NavLinks, UserMenu, MobileMenu, navConfig
    ProtectedRoute.tsx  # Auth gate
    ErrorBoundary.tsx   # Error boundary
    ...                 # Tool-specific UI components (SetupPanel, PowerSlider, etc.)
  pages/
    Dashboard.tsx       # Tool grid (root page "/")
    LoginPage.tsx       # Firebase auth login
  tools/
    ValuatorTool.tsx    # Site Valuator tool ("/valuator")
  hooks/                # useAuth, useSites, useValuation, useAnimatedNumber
  lib/
    firebase.ts         # Firebase config
  types/
    index.ts            # SiteInputs, ValuationResult, SavedSite
  utils/
    format.ts           # Formatting helpers
```

## Design System

- **Brand red:** `#C1121F`
- **Background:** `#E8E6E3`
- **Text primary:** `#201F1E`
- **Text muted:** `#7A756E`
- **Border:** `#D8D5D0`
- Cards use `bg-white rounded-xl shadow-sm border border-[#D8D5D0]`
- Font heading class: `font-heading`

## Key Patterns & Conventions

### Adding a New Tool/Page

When adding a new route, you MUST update these files:

1. **`src/App.tsx`** — Add the route inside `<Routes>`, wrapped in `<ProtectedRoute>`
2. **`src/components/Breadcrumb.tsx`** — Add the path and label to `routeLabels` map
3. **`src/pages/Dashboard.tsx`** — Add the tool card to the `tools` array

### Breadcrumb Navigation

- Lives in `src/components/Breadcrumb.tsx`
- Rendered automatically by `Layout.tsx` on every page
- Hidden on the root dashboard page (`/`)
- Uses a `routeLabels` record to map paths to display names
- **Always update `routeLabels` when adding or renaming a route**

### Layout

All protected pages must be wrapped in `<Layout>` which provides:
- Sticky navbar
- Breadcrumb navigation
- Centered content container (`max-w-5xl`)

### Auth

- Firebase auth via `useAuth` hook
- Protected routes use `<ProtectedRoute>` wrapper
- Login page is at `/login`

### Navigation Config

- `src/components/navbar/navConfig.ts` holds the `navLinks` array for navbar items
- Currently only has `Tools` linking to `/`

## Commands

```bash
npm install      # Install dependencies
npm run dev      # Start dev server
npm run build    # Production build
npx tsc --noEmit # Type-check without emitting
```
