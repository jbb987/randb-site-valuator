# HANDOFF — 2026-05-19

> SBAR-style summary of the most recent meaningful session. CLAUDE.md
> instructs every new session to read this file first, so it's the canonical
> starting point for the next Claude Code session in this repo. Replace this
> content (don't append) at the end of any non-trivial session.

## Situation

End of a long iterative session that built the **Pre-Construction tool** end-to-end (v1.43.0 → v1.43.25) on top of the folder system shipped 2026-05-14. Code is on `main` at **v1.43.25** and pushed; Cloudflare Pages has auto-deployed. The new Cloud Function `onPreConSiteWrite` is also deployed and feeding the audit log.

The tool is functionally complete and live. Remaining work is deferred items (see Recommendation), not blocking bugs.

## Background — what shipped

In rough order:

1. **v1.43.0** — Initial Pre-Construction tool. New `preconstruction-sites` collection. Detail page with header, status card (merged grade + engineer), site analysis section checklist, LOA timeline, and `FolderBrowser` for documents. Auto-provisions `cust_{companyId}_precon-root` + `precon_{siteId}_root` system folders and a `Project(type='pre-con')` record. Index page with search + grade filter. New routes `/precon`, `/precon/new`, `/precon/:siteId`. Dashboard tile in the **Pre-Construction** section. Pre-Con sites section added to the customer profile.
2. **v1.43.1–v1.43.5** — UX iterations on the new-site form (dropped MW + $/acre from creation; come from engineer review / Site Analyzer later), engineer-MW auto-sync to `sites-registry.mwCapacity` on approve, breadcrumb branch for `/precon` paths + generic `?returnTo=…` override for cross-tool back-navigation.
3. **v1.43.6–v1.43.9** — LOA timeline rebuilt as a clickable to-do list. Removed utility picker (kept code structure for future per-utility templates). Removed step notes. Bidirectional clicks, red connector spine matching the construction-tracker task aesthetic. "Mark as rejected" affordance removed — the grade (NO GO) is now the single source of "deal stopped."
4. **v1.43.10–v1.43.12** — Site evaluation card gains a locked verified-by view once the engineer signs off; **Re-review** button opens edit mode. Title moved above the grade pill.
5. **v1.43.13–v1.43.15** — Card-level CTA polish: collapsed cards now lead with a **Review** / **Re-review** primary button. Shared `<Button>` component (`primary` / `secondary` / `ghost`) lives in `src/components/ui/Button.tsx`; every PreCon button migrated to it.
6. **v1.43.16–v1.43.18** — Header edit mode shipped (name + utility-platform URL; coordinates locked). Archive moved into edit mode. Grade pill dropped from the header (lives only on the Site evaluation card now). Index card grade pill moved to a small row under company/coords/MW. **+ Add a link** affordance for utility URL when none is set.
7. **v1.43.19–v1.43.24** — Site analysis section trimmed to the 8-row checklist (no metric cards). LOA step "Packet sent to ERCOT" → "Packet sent to grid operator" (utility-agnostic). FolderBrowser title → "Pre-Construction documents", subtitle suppressed via conditional render. Index card: button renamed "New site"; verified MW + "✓ Verified by engineer" tag inline with company line.
8. **v1.43.25 — code-review fix pass.** Two review agents + my own audit produced a punch list; all Critical/High/Medium/Low items fixed except a few logged TODOs. Highlights:
   - **C1 (critical)** — `saveSiteStatus` was writing literal `undefined` to Firestore when clearing engineer / MW / grade. Now uses `deleteField()`; `updatePreConSite` accepts `FieldValue`.
   - **C2 (critical)** — Customer field in header edit mode is now LOCKED. Full company-change cascade (Project record + folder skeleton migration) deferred.
   - **H1** — Customer profile dedup: `SitesSection` filters out registry entries already wrapped by a `PreConSite`.
   - **H2** — `onPreConSiteWrite` Cloud Function trigger added + deployed. Audit log now sees PreCon writes.
   - **H3** — `docs/firestore-rules.md` created (the rule for `preconstruction-sites` was previously published manually in Firebase Console; doc captures the requirement for staging / restores).
   - **H4** — Stale-LOA-status warning banner (legacy timeline keys from pre-v1.43.8 surface a yellow notice instead of silent empty timeline).
   - **M1** — Dropped dead fields: `gradeNotes`, `engineerNotes`, `loaUtility`, `loaUtilityName`, `loaSteps[].notes`. `PreConUtility` type + `LOA_TIMELINES` kept for future use.
   - **M3** — Defense-in-depth URL sanitizer on render (`safeExternalHref` in `PreConHeader`) parses + checks `http(s):` scheme before rendering the anchor.
   - **L1/L2** — Removed `nextLoaStatuses` (unused) and the `canView: true` permission stub (route guard owns view access).

Console-side: Firestore rule for `preconstruction-sites` published manually earlier in the session.

## Assessment — known limitations / risks

Logged in `TODO.md` under "Pre-Construction tool":

- **Customer reassignment is locked in the UI** until a full cascade migration ships (would need to update the linked `customer-projects` Project record + rewrite folder `companyId` / `ancestorFolderIds` on every descendant). PR-worthy, not started.
- **Coordinate drift (M2)** — `PreConSite.coordinates` is cached separately from the linked `SiteRegistryEntry.coordinates`. If a user edits coords in Site Analyzer the two diverge. Real fix: drop the cache, read from registry. Not fixed because the list page currently doesn't fetch per-row registry entries.
- **Engineer assignment dropdown** still shows ALL platform users, not engineers specifically (no `engineer` role flag yet on the user model).
- **Per-utility LOA templates** — `LOA_TIMELINES` is keyed by utility but every utility points to the same generic timeline today. Drop-in slot ready.
- **No "Promote to Construction Job"** handoff button on PreCon detail page once a site reaches Letter of Allocation.
- **No engineer-assignment notifications** (email/Slack).
- **No bulk actions** on the index page (bulk grade, bulk archive).
- **No archived-site restore UI** — `restorePreConSite` helper exists in `src/lib/preConSites.ts` but no surface.
- **Zero unit tests** — particular gap on `preConWorkflow.ts` pure helpers (`suggestGradeFromAppraisal`, `appendLoaStep`), `appraisal.ts`, and `saveSiteStatus`'s engineer-status derivation.

## Recommendation — what next

Open product decisions raised but not made:

1. **Customer profile section merge** — H1 deduplicated the visible lists, but the bigger question of unifying "Sites" + "Pre-Construction sites" into one section (with badges) vs keeping them separate is open.
2. **PreCon index card polish ideas** floated but not chosen: color-tinted card border by grade, "Updated X ago" timestamp, filter chips ("Verified only" / "GO only"), card grouping by status, engineer name on each card.

Highest-leverage next pieces of actual work:

1. **Engineer role tagging on users** + filter the assignment dropdown (small, immediately useful).
2. **"Promote to Construction Job"** handoff button — this is the bridge to existing Construction Tracker, completes the lifecycle story.
3. **Full company-change cascade** — proper fix for C2; non-trivial migration helper.
4. Activity-trigger smoke test — open `/admin/activity` after the next PreCon edit and confirm entries land (the deploy just happened; not verified live yet).

Everything else in the TODO list is iteration polish.

## Key file map (Pre-Construction)

- `src/types/index.ts` — `PreConSite`, `PreConGrade`, `PreConLoaStatus`, `PreConEngineerStatus` types (~line 1100+).
- `src/lib/preConSites.ts` — CRUD + `saveSiteStatus` + `advanceLoaStatus`.
- `src/lib/preConWorkflow.ts` — `suggestGradeFromAppraisal`, `LOA_TIMELINES`, `appendLoaStep`.
- `src/lib/projectProvisioning.ts` — `provisionPreConFolders` (and the existing construction one).
- `src/lib/appraisal.ts` — shared `computeAppraisal` (used by both PreCon + Site Analyzer).
- `src/hooks/usePreConSites.ts`, `src/hooks/usePreConPermissions.ts`.
- `src/tools/PreConIndex.tsx`, `PreConNew.tsx`, `PreConDetail.tsx`.
- `src/components/precon/PreConGradePill.tsx`, `PreConHeader.tsx`, `PreConAppraisalSummary.tsx`, `PreConStatusCard.tsx`, `PreConLoaTimeline.tsx`.
- `src/components/ui/Button.tsx` — shared CTA component.
- `src/components/Breadcrumb.tsx` — PreCon branch + `returnTo` override.
- `functions/src/activity/triggers.ts` — `onPreConSiteWrite`.
- `docs/firestore-rules.md` — required rule per new collection.
