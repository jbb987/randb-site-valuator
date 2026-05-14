# HANDOFF — 2026-05-14

> SBAR-style summary of the most recent meaningful session. CLAUDE.md
> instructs every new session to read this file first, so it's the canonical
> starting point for the next Claude Code session in this repo. Replace this
> content (don't append) at the end of any non-trivial session.

## Situation

End of a massive build session. Folder & Document system shipped end-to-end
for its core promise (Phase 1 + Phase 2 + PR 3.1 + PR 4.1). 11 production
deploys, a real data migration, and a full local Firestore + Storage backup
to the user's iMac.

App is on `main` at **v1.42.0**. Cloudflare Pages auto-deploys from main.

## Background — what changed today

In rough order:

1. **v1.36.1** — Split the original Construction Tracker into two tools sharing one component tree via a `JobToolConfig` React context: **Bailey Project** (CEO's tool, kept on the original `construction-jobs` collection, moved to the Company dashboard section) and **Construction Projects** (team's tool, new `construction-projects-jobs` collection, in the Construction section). Cloud Functions cleanup + activity-log triggers duplicated for the new collection. CRM company panel surfaces linked jobs across both tools, tagged with origin.
2. **v1.36.2 / v1.36.3** — Added a new **Oil and Gas** dashboard section, moved Well Finder into it, repositioned the section right before Settings.
3. **v1.37.0** — Locked the role model to three tiers (admin/manager/labor). Renamed legacy `employee` → `manager`, `worker` → `labor` everywhere; `normalizeRole` translates legacy stored values on read so a missed user keeps working. Committed `docs/architecture/folder-system-plan.md` to the repo.
4. **v1.38.0** — Added `Folder`, `DocumentRecord`, `Project` types + 3 lib files (`folders.ts`, `documentRecords.ts`, `projects.ts`) + 3 hooks. New Firestore collections: `folders`, `documents`, `customer-projects` (named to avoid the legacy `projects` collection collision; can be renamed once AUDIT M-1 cleanup happens).
5. **Migration** — Ran `scripts/migrate-to-folder-system.mjs --confirm` against production. Created 44 folders + 10 Project records + 53 document records by walking the legacy `crm-documents` and `construction-jobs/*/documents` + `photos` subcollections. Zero errors, zero storage blob moves. Idempotent via deterministic ids.
6. **v1.39.0** — Read-only `FolderBrowser` component mounted on CRM customer profile (above the legacy chip view for side-by-side comparison).
7. **v1.39.1** — Same `FolderBrowser` mounted on the construction tracker detail page, scoped to a project's subtree via the `rootFolderId` prop. Works for both Bailey Project and Construction Projects.
8. **v1.40.0** — Mutations: create folder, multi-file upload, rename, archive. Modal-based UX; kebab menu on every folder/doc tile.
9. **v1.40.1** — Trash view (PR 2.3). Toggle on FolderBrowser header; flat list of archived items with original-parent labels and Restore buttons; scoped to project subtree when applicable.
10. **v1.41.0** — Auto-provisioning. New construction jobs now create their `cust_*_construction-root` + `proj_*_root` folders + Project record on create, so the FolderBrowser is functional immediately.
11. **v1.42.0** — Per-folder access lists (PR 4.1). Manage Access modal with two axes × three modes (inherit / admin-only / specific people). Admins always pass — they don't appear in the picker. **Enforcement is client-side only for v1; server-side Firestore rule walks of `ancestorFolderIds` are deferred.**

Console-side work today:
- Firestore rules added for `folders`, `documents`, `customer-projects` (permissive — `allow read, write: if isAuthed()`).
- Storage rules added for the new `documents/{companyId}/{fileName}` prefix.
- Two composite indexes created (`documents`: companyId + uploadedAt; `folders`: companyId + position).

User backed up locally to `~/randb-backups/firestore-2026-05-14/` (Firestore JSON-binary export, excluding well-finder/queue/infra caches) and `~/randb-backups/storage-2026-05-14/` (CRM + construction Storage prefixes, also excluding well-finder).

## Assessment

The folder & document system is **functionally complete for its original user need**: Mike can build the 21-folder Asherton tree, nest folders, restrict access, archive + restore. New jobs auto-provision their skeleton. Migrated data is browsable on both the CRM customer profile and the construction tracker detail page.

Coexistence with legacy code is intentional and stable:
- Legacy `crm-documents` and `construction-jobs/*/documents` collections still exist and the legacy `DocumentsSection` chip view still renders below the new `FolderBrowser` on customer profiles. The 30-day rollback window is intact.
- Bailey Project (`construction-tracker` toolId) and Construction Projects (`construction-projects` toolId) coexist as parallel filtered views of the same underlying construction-tracker codebase.

Open risks:
- **Client-side-only access enforcement**: any user with direct Firestore SDK access can read past the per-folder gate. Fine for internal R&B use; must tighten before external/guest access.
- **The legacy `projects` collection still exists** (AUDIT M-1). Once deleted, we could rename `customer-projects` → `projects` to reclaim the natural name.
- **Migration legacy categories**: a few CRM docs had non-standard `category` values (e.g. `"report"`) that didn't map to the canonical 6-category enum. Migration preserved them as raw values, so a folder is currently named `report` instead of `Deliverables`. Fixable via the Rename UI — not data-loss.

## Recommendation — what to do next session

In rough priority order:

1. **Have Mike user-test the deployed app** end-to-end on Asherton. Watch for friction in folder creation, access management, and the chip-view ↔ folder-view duality.
2. **PR 3.2** — Pre-Con and REP project types. Create flows for the other two business dimensions (pre-con linked to a Site Analyzer site; REP for maintenance/work-orders). Mount the FolderBrowser on those project profiles too.
3. **PR 3.3** — Dedicated `/projects/:id` route. Decouples the project view from the construction tracker; lets us mount the FolderBrowser on a clean URL.
4. **PR 4.2** — Repurpose the existing `/documents` tool as a cross-customer search across the new `documents` collection. Drop the My Documents and Company Drive Drive shortcuts; keep Templates.
5. **Tighten Firestore rules** to enforce per-folder access server-side (ancestor-walk via `ancestorFolderIds`). Once this is in, client-side filtering becomes a UX nicety rather than the security boundary.
6. **Commit Firestore + Storage rules to the repo** (`firestore.rules`, `storage.rules`, wire into `firebase.json`). Today they're managed in Firebase Console; moving them under git removes the manual "paste this snippet" friction.
7. **Phase 5 paperwork**: ADRs 018–020 (folder/doc model, 3-role model, no-deletion guarantee), update ERD with the three new collections, retire stale parts of CLAUDE.md.
8. **Delete the legacy `projects` collection** (AUDIT M-1) and rename `customer-projects` → `projects` if desired.

## Where things live

- **Folder system component**: `src/components/crm-directory/FolderBrowser.tsx` (mounted on `CompanyDetailTool` and `ConstructionTrackerDetail`)
- **Manage Access modal**: `src/components/crm-directory/ManageAccessModal.tsx`
- **Access helpers**: `src/lib/folderAccess.ts`
- **Auto-provisioning**: `src/lib/projectProvisioning.ts`
- **Data layer**: `src/lib/folders.ts`, `src/lib/documentRecords.ts`, `src/lib/projects.ts`
- **Hooks**: `src/hooks/useFolders.ts`, `src/hooks/useDocumentRecords.ts`, `src/hooks/useProjects.ts`
- **Types + collection-name constants**: bottom of `src/types/index.ts` (`FOLDERS_COLLECTION`, `DOCUMENTS_COLLECTION`, `CUSTOMER_PROJECTS_COLLECTION`)
- **Migration script**: `scripts/migrate-to-folder-system.mjs`
- **Plan doc**: `docs/architecture/folder-system-plan.md`
