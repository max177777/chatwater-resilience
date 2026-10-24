# CW-11 selected project export — local handoff

Verified 2026-10-24. CW-03 is preserved in local commit `bc8d316` on `noah/missing-data-continuity`, following base `37aef3d`. Its remaining real-browser backup acceptance passed before that commit; see the dated addendum in [CW-03](cw03-missing-data-continuity.md). CW-11 starts from that checkpoint on `noah/project-export-scope` and remains **uncommitted**. Existing unrelated `.github/` files are excluded. No push, merge, deployment, provider call or ECAM equation change occurred.

## Default package and ownership

**Download selected project package** exports one project, defined by the existing actions/plan/proposal's source assessment ID. The assessment selector on another screen does not define ownership. Inconsistent, absent, duplicate, missing or stale ownership blocks sharing with 409; unsupported source inputs retain the existing validity protection. An unrelated invalid assessment does not block a valid selected project. Neither record IDs nor dependency revisions are rewritten to make records appear current.

Both HTTP sharing routes (`POST /api/export`, `POST /api/export/docx`), including Express's accepted trailing-slash and case variants, pass through `engine/project-export.js` on the server before rendering. This validates the original dependencies, projects an explicit allowlist, checks freshness again, recalculates only the source assessment, and builds a new bound transfer envelope. It does not pass through the client's complete saved state. `engine/export.js` remains an internal rendering helper; no additional HTTP download route bypasses this boundary.

The ZIP includes:

- One native ECAM assessment, its original assessment/substage IDs, matching General factors, unit/question settings, GWP, input origin/confirmation/status/history/source notes, calculated results and result availability statuses.
- The selected actions and saved selection, source-owned custom definitions, per-action notes/labels/explanations/evidence, and matching calculated options when their original basis and server-calculated figures agree. A stale/unverifiable options cache is omitted, not rebound. Custom benefits remain unquantified.
- The source-owned plan, proposal and the existing single previous-version slot for each document when it has explicit matching ownership. Previous versions retain their original dependency records and can still be outdated. Mixed-ownership task versions are omitted.
- The profile and financing framework actually bound into these outputs' freshness fingerprints; source/related evidence, qualifications, locators and review flags belonging to retained outputs/actions. Unsupported profile/framework structures block export rather than silently changing their identity.
- `ecam/application-metadata.json` and `project/project-backup.json`, rebuilt from the **same scoped state** with valid native, metadata and state digests. The latter is a supported single-project recovery envelope, not a complete workspace backup.
- `manifest.json`: project/source assessment ID and revision, application/ECAM/session/transfer versions, period, output language, units, GWP/factors/support revision, review status, deliberate omissions, and every archive file with byte count/SHA-256 (manifest self-hash intentionally excluded).

Review status is explicitly **working draft**. Existing human review flags are preserved; a successful export does not establish scientific approval. Interface-language switching does not translate saved text or change its output language.

## Deep exclusions and other download routes

Other assessments and their metadata/status maps/actions, foreign or unbound previous versions, all whole-workspace checkpoints, chat/chatThreads, transferRecovery, legacy/unbound saved data, other profiles and unknown workspace fields are excluded. Checkpoints are intentionally omitted even if apparently named for this project: their snapshots contain complete workspace state and do not offer dependable per-record ownership. Unknown nested document/evidence properties and workspace containers are removed recursively; explicitly foreign evidence records are removed. Known source qualification fields are retained. Malformed nested label/completion metadata is not copied. Native fields come from ECAM constructors; a result-affecting revision change caused by projection rejects export.

The server validates an incoming nested backup's digests and association with the outer ECAM data, aligned IDs and GWP before reading historical slots. It never reuses that envelope in the outgoing ZIP. Both outgoing companion state and project envelope contain only the projection. Mismatched companion metadata is rejected under the existing transfer rules. There is no new all-assessments sharing format.

Download inventory:

| UI/route | Scope |
|---|---|
| Selected project package / `/api/export` | Source-owned ZIP described above, including its scoped nested backup/companion. |
| Download Word / `/api/export/docx` | Source-owned proposal and relevant actions/results/evidence under the same server boundary. |
| Save current assessment ECAM inputs | Browser's currently displayed assessment only, native ECAM array. Standalone inputs, not an output package or complete settings/provenance backup. |
| Save full workspace backup | Existing complete `CWProject` recovery envelope, all assessments and saved state, including chat, previous versions, checkpoints and recovery imports. Filename `chatwater-full-workspace-backup.json`. |
| Storage-error “Download original saved session” / “Download current work” | Existing emergency recovery downloads on the storage-error panel; intentionally retain original/current full saved data. They are not sharing/package routes and are not relabeled as a validated project envelope. |

The full-backup button is explicitly labeled in English and Indonesian. Its adjacent explanation states the assessment count and that documents, source notes, chat and recovery history are included, before download. A selected-project restore naturally has a workspace count of one; a full backup of it includes that entire one-project workspace. Recovery import creates a new workspace and retains the original.

## Verification and evidence

All data were synthetic and AI was off. Local server and tests preload `test/helpers/offline.js`: provider credentials removed and external fetches blocked. No live model behavior is claimed.

Real browser acceptance used the in-app browser and real file chooser/download events at `localhost:38745`. The two synthetic projects have unique names, notes, custom actions, plan/proposal text, previous versions and nested checkpoints (`CW11_A_ONLY`, `CW11_B_ONLY`). Setup envelopes were imported through the UI; they are not represented as browser-generated downloads.

- A workspace: `workspace_c7696c3a4de04dbb`. Edited A proposal through the textarea, then downloaded `/Users/noah/Downloads/CW11_A_ONLY_profile-chatwater-files.zip` using the package button. Every archive entry, JSON nesting and Word XML was inspected; no B marker or B assessment ID occurs. Manifest hashes and nested companion/backup digests validate.
- Switched the visible assessment to B and the interface to Indonesian. A's outputs still displayed A's package scope. The real second download `CW11_A_ONLY_profile-chatwater-files (1).zip` also passes the same deep checks; the manifest correctly retains English output language.
- B workspace: `workspace_a246a8d4e8744ee4`. The real download `CW11_B_ONLY_profile-chatwater-files.zip` contains B only; no A markers or IDs, including nested files.
- Real **Save full workspace backup** download `/Users/noah/Downloads/chatwater-full-workspace-backup.json` validates and retains both IDs, both markers, edited A text, both checkpoints, chat and recovery state. The UI explained “all 2 assessments”.
- Extracted `project/project-backup.json` from A's actual downloaded ZIP to `.cache/cw11/browser-A-selected-backup.json`. Restored that exact extracted file through the UI into fresh `workspace_f80ca3954e304a6c`. Only A appears, with AR4 and confirmed-default origin intact; the browser-edited proposal text and source evidence display correctly. Real-button redownload `chatwater-full-workspace-backup (1).json` compares equal for native values, status/provenance, settings, IDs, profile, actions/selection, plan/proposal, previous versions and financing. Its dependency checks still pass, and B is absent. Reloaded original workspace still has A and B and edited A text.
- The real standalone native-input button downloaded `CW11_B_ONLY synthetic utility.json` containing exactly B, with A absent. The real Word button in restored A downloaded `proposal (6).docx`; its XML retains the browser edit and contains no B marker. This checks file content, not Word application pagination.

Screenshots and artifact hashes are recorded in ignored `.cache/cw11/cw11-browser-verification.json` and its listed screenshots. No synthetic download, cache, corpus, private source PDF, credential or machine-generated report is staged as implementation.

Automated regression `test/project-export.test.js` checks both source directions, deep archive/Word isolation, matching qualifications and manifest digests, valid scoped restore, full-workspace retention, unrelated invalid inputs, stale numeric/document changes, mixed owners/tasks, altered nested backups, absent ownership, EN/ID labels and unchanged Case A/B calculations. Existing transfer tests cover missing/mismatched metadata and unconfirmed fallback. Final `npm test` runs 17 files with the offline guard; `npm run test:absent-library` separately verifies absent-corpus behavior. Both pass. Vendor equations are unchanged; this is package scoping, not a new scientific calculation.

## Limits and review steps

The model currently keeps one active plan/proposal pair, a workspace-global profile/GWP and one previous slot per document. This change does not add per-project document storage, an arbitrary version archive or per-assessment GWP settings. Only explicitly bound current outputs and qualifying previous slots travel. Full workspace recovery preserves the original global relationships as stored. Unknown fields/evidence schemas may be deliberately omitted; the manifest records the category-level exclusions. Adding a new supported evidence field requires extending the allowlist and its regression checks.

Structured ownership checks cannot decide whether source-owned free text itself mentions another utility or whether evidence supports a scientific claim. That still requires human review. Digests detect accidental association changes; they are not signatures or authentication. Live deployment, external AI, concurrent-tab behavior, broad cross-browser/mobile/accessibility/security checks and Word application pagination were not verified. Chrome's extension upload helper lacked file-URL permission; browser upload/download acceptance used IAB successfully, without changing permissions.

Local review steps (synthetic fixtures are retained in ignored `.cache/cw11/`):

1. From `/Users/noah/chatwater-resilience`, run `PORT=38745 node --require ./test/helpers/offline.js server.js` and open `http://localhost:38745/?workspace=cw11-local-review`.
2. Choose English, **Start or load an ECAM assessment**, then **Restore project or workspace backup** with `.cache/cw11/browser-project-A.json`. Restore opens a fresh workspace. A's outputs are bound to A while the assessment selector shows B.
3. Open **4 Financing**, edit proposal text if desired, and click **Download selected project package**. Inspect `manifest.json`, native ECAM array, companion `state` and nested project backup; search all extracted files/Word XML for `CW11_B_ONLY` (must be absent).
4. Repeat in another fresh workspace with `browser-project-B.json`; A must be absent. To exercise restore, extract `project/project-backup.json` from the actual ZIP and restore it through the same UI into another fresh workspace.
5. On A's original **1 Assess → Start or load** screen, the full backup explanation says all 2 assessments. **Save full workspace backup** intentionally preserves both. Switch the visible assessment and return to Financing: scope still follows A's outputs. Do not regenerate AI drafts.
6. Run `npm test`, `npm run test:absent-library`, and `git diff --check`. Review `git diff` plus the new scoping/helper/test/handoff files. Leave this batch uncommitted unless separately authorized.
