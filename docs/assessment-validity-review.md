# Launch review reconciliation — bounded validity batch

**Current local checkpoints (2026-10-24):** the original work below is preserved in `37aef3d` on `noah/assessment-validity`; CW-03 including real-browser backup acceptance is committed as `bc8d316` on `noah/missing-data-continuity`. CW-11 is committed as `fc85013` on `noah/project-export-scope`; CW-10 is checkpointed locally on `noah/document-review-status`; the integration handoff records its commit and fetched-main comparison. See [CW-03 continuity handoff](cw03-missing-data-continuity.md), [exact dependency inventory](cw03-dependency-coverage.json), [CW-11 export scope handoff](cw11-project-export-scope.md), and [CW-10 review status handoff](cw10-document-review-status.md). Historical findings below describe their earlier batch unless updated in the checklist.

**Historical initial batch (2026-10-23):** Branch: `noah/assessment-validity`. Tested base commit: `7ea984fca7fc44fdb3af99ab4e49c211146c77e2` (Meeting feedback, Oct 20). After `git fetch origin`, `HEAD` and `origin/main` are identical: zero commits ahead/behind. The starting version was `noah/demo-language-export` **plus its 42 modified/untracked files**, not a clean main checkout. No repository AGENTS.md was found in the repository or applicable ancestor locations.

At that initial review, all original work was uncommitted. The initial tracked patch, copies of the 42 changed/untracked files, and their SHA-256 manifest are in `.cache/assessment-validity/pre-existing.patch`, `baseline/`, and `baseline.json`. These are local, ignored preservation copies. `.cache/assessment-validity/batch-files.json` lists the 24 paths changed by this batch relative to that starting tree. This batch adds shared assessment validity, server enforcement, fixture/test coverage and this report; it also extends the existing provenance, form, action wording, chat and export code. It does not commit, push, merge or deploy.

## Source files

Read the review's full ticket sections and the worked examples' settings, tables and narratives. Relevant input tables and review pages were also rendered locally and inspected. Originals were not edited.

- `/Users/noah/Downloads/Review.docx.pdf` — 25 pages; SHA-256 `c037c5e4389cf73fadb8a362ba8a5de3a2bb43a013c26e07d4a6611ee95b6bf9`.
- `/Users/noah/Downloads/Indonesia Example.docx.pdf` — 12 pages; SHA-256 `bb083a852e2ab398e605c2ec22e811d581dfe73ae87e798df22ba760283526a0`.

## Ticket checklist

Reconciled 2026-10-24 against CW-03/CW-10/CW-11 implementation, saved test logs and real browser/download evidence. These are **local** findings. No ticket is claimed fixed on the live site. “Partially addressed” includes pre-existing fixes in the starting working tree; it does not imply this batch implemented the whole ticket.

| ID | Current status | Verification and remaining work |
|---|---|---|
| CW-01 | Addressed locally for the declared computational floor; scientific approval pending | CW-03 extends shared browser/server presence, period and applicability gates. Empty/reversed/impossible periods and missing process inputs cannot finish or export; text/values remain editable. `assessment-validity` and `missing-data` tests pass. Computational sufficiency and inventory boundaries still need approval. |
| CW-02 | Addressed locally for declared bounds | CW-03 propagates invalid status through results/actions/drafts instead of inventing zeros; existing energy, percentage, option, physical-order and water-balance checks remain. Offline tests cover invalid drafts and unchanged Cases A/B. No universal positivity rule or new ECAM equations. |
| CW-03 | Addressed locally for declared continuity scope; scientific limits remain | Checkpoint `bc8d316`: ambiguous legacy zeros stay unconfirmed; explicit zero/unknown and default origin versus confirmation remain distinct. Shared dependency inventory, partial totals, support freshness, duplication and bound transfer pass tests. Actual full-backup download, exact-file isolated restore and original-state retention verified. See CW-03 handoff and inventory; not complete scientific dependency certification. |
| CW-04 | Partly covered by CW-03/CW-10; scientific/product decision open | Independent NRW/water-loss values and support statuses reach results, facts, chat and exports. Case A remains NRW 28.5714% versus water loss 25%. CW-10 retains caveats and requires human treatment. Chimdi still must approve the action measure, trigger and benefit scenario; do not duplicate status propagation work. |
| CW-05 | Partly covered by CW-03/CW-10; scientific decision open | Existing split-energy calculation remains 597003.375 kWh new pump energy and 302996.625 kWh saving. CW-03 tracks prerequisite support; CW-10 requires explicit treatment of provisional warnings and preserves them in review/export. Pump-only energy boundary and methodology approval remain unresolved; acknowledgment is not approval. |
| CW-06 | Partly covered by CW-10 and existing generation guards | Known truncation/incomplete text and failed fallback origin are exposed in section review and Word/ZIP; incomplete text cannot be reviewed, accepting a completed fallback requires a note. Concurrent edit/generation responses preserve newer text. Synthetic tests pass; comprehensive semantic completeness and live provider behavior remain unverified. |
| CW-07 | Partly covered by CW-03 and existing context scoping | Unknown/invalid/unconfirmed status and separate water measures travel into server chat context; foreign/stale outputs are excluded or flagged. Offline context tests pass. Real generated answers and comprehensive claim support remain unverified with AI off; no duplicate missing-data/context implementation needed. |
| CW-08 | Local retrieval verified; corpus distribution/deployment gate open | Recorded local library: 19 documents, build `lib-4c319211a4b2`. Offline retrieval and full-suite absent-corpus behavior pass; generated library is ignored and absent on a fresh checkout. Max must provision approved source archives, build/evaluate the corpus and verify deployed health/search. Licensing, source approval and claim support remain human responsibilities. |
| CW-09 | Open wording/framework inconsistency | GCF UI still claims use of the 2024 guidelines while describing a placeholder structure. CW-10 review states do not validate that statement or implement the framework. Reconcile wording and approved framework with the team before presenting it as implemented. |
| CW-10 | Addressed locally for declared editorial-review scope | Shared browser/server working-draft/reviewed/outdated evaluation, content/dependency-bound confirmations, treatment notes and linked issues; guarded Word/ZIP exports and scoped review metadata. Actual browser downloads, language switching, edit reopening and rendered layouts verified. Local attestations are not authenticated signatures, scientific certification, eligibility or funder approval. See CW-10 handoff. |
| CW-11 | Addressed locally; checkpoint `fc85013` | Server scopes Word/ZIP to outputs' source assessment ID, including companion and nested backup; foreign/unbound versions, chat, recovery and whole-workspace checkpoints excluded. Actual A/B downloads and selected-project restore pass deep inspection. Separate full-workspace recovery intentionally retains both projects. See CW-11 handoff; no need for another all-assessments sharing format. |
| CW-12 | Declared transfer/settings coverage supplied by CW-03/CW-11 | Cases A/B, AR5-CCF/AR4 and base-unit conversions remain unchanged. Bound companion and project envelopes preserve IDs, calculation settings/versions, provenance and text; actual full and scoped backup round trips verify this. Native ECAM alone cannot preserve app metadata; global GWP/profile semantics and broader interoperability remain explicit limits, not a missing second transfer format. |
| CW-13 | Declared provenance continuity supplied by CW-03 | Per-input source/year/period notes, history, origin and confirmation survive duplicate/full/scoped transfer. Ambiguous zero is unconfirmed; confirming a default does not make it measured. Source-note edits do not stale numeric outputs that do not consume those notes. Factor-specific scientific defaults/source guidance and source approval remain separate decisions. |
| CW-14 | Partially addressed; remaining input guidance open | Existing ECAM unit conversions/help and malformed-value preservation remain. CW-03 supplies editable provenance/source-year notes; it does not add a concentration/load calculator or factor-specific source/year hints. Those specific UX/scientific requirements remain; do not reopen general provenance storage. |
| CW-15 | Partly covered by CW-03; semantic boundary review open | Covered biogas indicators propagate not-applicable when disabled; shared inventory/status coverage is explicit for published results and eight action rules. Unknown components are unavailable, not zero, and incomplete totals remain distinct. Unexposed/remaining semantic dependencies and zero-denominator scientific meanings require inventory review; see CW-03 coverage limits. |
| CW-16 | Partly covered by CW-03/CW-10/CW-11 | IDs/dependencies survive duplication, transfer and earlier-version restoration; visible B cannot change ownership of A's exports. Real two-project UI exports and isolated restores plus mixed/stale rejection pass. One active plan/proposal pair and global profile/GWP remain; full multi-project authoring and concurrent-tab usability are not certified. |
| CW-17 | Partially addressed by existing onboarding; broader readiness open | ECAM-first start, optional profile details and guide-derived synthetic fixtures exist. CW-03 preserves missing/unknown inputs through that flow rather than inventing observations. Disabled profile workflow and comprehensive onboarding/role readiness remain outside these batches. |
| CW-18 | Partly covered by CW-03/CW-10 and existing decision cards | Cards preserve trigger, scenario assumptions, evidence and conditions; shared support covers all eight declared rules and unknown benefits are not quantified/ranked. CW-10 retains scientific caveats and requires their human treatment. Scenario validity, rule coverage and per-prerequisite bilingual guidance still need product/scientific review. |
| CW-19 | Partly covered by CW-10/CW-11; language approval open | New review/issue/confirmation and project/full-backup labels are EN/ID; browser interface switching preserves saved English text/review. Existing parity, formatting and output-language tests pass. Some validity detail remains English; Silvia must review terminology and complete language coverage. |
| CW-20 | Partly covered by CW-10 and existing validation navigation | Plan/proposal/review textareas and schedule controls now have section/task names; issue links focus content and note errors focus an alert. Real keyboard Enter navigation verified. Earlier claim that those textareas are unnamed is superseded. Full keyboard/screen-reader/WCAG and remaining-form audit are still open. |
| CW-21 | Partly covered by CW-03/CW-10; concurrent-tab/checkpoint UX open | Actual full-backup download and exact-file restore preserve all state in a new workspace; CW-11 scoped backup also restores with valid bindings. Edited text, prior notes and previous-version dependencies remain recoverable; in-flight generation cannot overwrite newer content. No separate backup format needed. General checkpoint-restore UI and multi-tab/storage contention remain unverified. |
| CW-22 | Open layout/progress work; generation integrity partly covered by CW-10 | Collapsed chat still occupies a wide empty column. CW-10 blocks stale review during generation and protects newer text from late responses; this is not a complete progress, duplicate-request or responsive-layout audit. Reuse those guards and address remaining feedback/layout separately. |
| CW-23 | Partly covered by CW-10/CW-11 and existing Word export | Actual scoped ZIP/Word XML checked; CW-10 adds status/associations/issues/notes and footer labels. All three rendered pages across synthetic working-draft/reviewed samples were visually inspected and an orphaned heading fixed. Broad Word-client/large-document pagination, full narrative/scientific review and live AI output remain unverified. |

## Implemented validity contract

`public/js/assessment-validity.js` is shared by the form and `engine/assessment-validity.js`. Vendored ECAM code and equations are unchanged. Bounds come from ECAM `Info`, `Tables`, question/input metadata and the review's stated physical constraints. Negative elevations or scientific coefficients are not assigned invented universal bounds.

The minimum is a **computational floor for entered processes**, not scientific approval of an inventory:

| Process | Base inputs required (ECAM base units, totals for the assessment period) |
|---|---|
| Water abstraction | abstracted volume, grid electricity, grid factor |
| Drinking-water treatment | treated volume, grid electricity, grid factor |
| Water distribution | distributed volume, grid electricity, grid factor |
| Wastewater collection | collected/treated/untreated collected volumes, BOD and TN loads, grid electricity/factor, collection and overflow CH4/N2O factors |
| Wastewater treatment | treated/discharged volume, influent/effluent BOD and TN loads, BOD removed as sludge, grid electricity/factor, treatment and discharge CH4/N2O factors |
| Onsite sanitation | population, containment BOD/factor, emptying share, BOD removed, grid electricity/factor |

Enabled optional questions require their actual numeric/option input fields. An entered zero satisfies presence when physically permitted. Untouched zero defaults in a newly created assessment do not count as an entry. Existing imported numbers remain identifiable as **provenance unconfirmed**; they are not silently relabeled measured. The existence of a water/wastewater process identifies its service type. No assumption that water operators also manage sanitation is introduced.

Checks use the same process and period: billed ≤ authorized ≤ distributed; pumping electricity ≤ total electricity; adequate-pressure connections ≤ service connections; passed tests ≤ tests performed; effluent loads ≤ influent loads for this modeled boundary; and collected treated plus untreated volume ≤ collected volume. No cross-facility mass balance is invented. Different plants, added loads, changing boundaries or nonstandard processes require scientific review.

Draft text/blank/null and invalid numbers survive local persistence and remain editable. Imports reject malformed structure/nonfinite JSON numbers transactionally; ordinary invalid inputs can load as drafts. Absent imported fields are set to null before ECAM hydration, preserving absence instead of inventing constructor-zero observations. Invalid assessments cannot finish. A conservative gate withholds the assessment results and actions until correction, rather than presenting a partial inventory as a valid total. Summary links navigate to the field and focus it.

Server routes `/api/actions`, `/api/actions/explain`, `/api/actions/alternatives`, `/api/plan`, `/api/proposal`, `/api/export` and `/api/export/docx` enforce validity. Existing ownership/freshness conflicts may be reported before validity (409); validity failures return 422. `/api/calculate` returns unavailable results plus structured issues for invalid drafts. Chat can still explain a draft, but receives unavailable numerical results/actions and the reasons. Financing taxonomy and document parsing remain independent of inventory calculations.

## Missing-data coverage and migration limits

The existing `state.inputStatus[assessmentId].s[substageId][code]` is retained. No conflicting second provenance system is introduced. Availability is a derived result; the optional `availability: 'not_applicable'` input record is recognized only for the matching current value. Ordinary process applicability comes from ECAM's existing question settings. Legacy question settings do not prove when a person answered them.

Explicit per-result dependency/status coverage currently includes NRW, water loss, water-loss volume per kilometre, the application NRW-per-kilometre companion, and wastewater/onsite biogas utilization. The inventory/downstream gate uses the declared base/optional input lists. This **does not** establish a complete dependency graph for every ECAM equation, chemical/sludge route or scenario re-run. Historical numeric zero values cannot be reliably reclassified as “not entered” without evidence. They remain imported/legacy-unconfirmed, and an all-default empty process is blocked.

A larger follow-up must agree the per-process inventory boundaries, map each remaining output/scenario to all inputs, decide zero-denominator meanings, track explicit question answers, and design a versioned companion/backup importer with migration and recovery tests. In particular, an onsite inventory may include containment, open defecation, emptied-sludge treatment/discharge and disposal: the present minimum is not a claim of completeness. Costs, funding, eligibility and combined benefits remain uncomputed. CW-03 stays partial; this batch's protection is enforced downstream gating, not merely a display label.

ZIP exports add `ecam/application-metadata.json` (same provenance records, IDs, GWP index and version) and `ecam/availability-and-water-balance.json`; recalculated `results.json` also carries statuses. Native valid ECAM inputs retain their original format. Companion restoration is explicitly not implemented. Existing saved action text using the old NRW label, or missing a required pump warning, must be refreshed; user narrative is not silently rewritten.

## Scientific decisions still required

1. **Chimdi — water loss:** approve whether the action is intended to measure physical/authorized-consumption water loss, NRW, or a different measure; approve its 15% trigger and 5-percentage-point energy/benefit assumption. This batch uses the existing authorized-consumption equation with corrected wording, never billed consumption in the action trigger.
2. **Chimdi — pump boundary:** approve ECAM's total-stage-energy saving basis or specify/enforce a pump-only boundary. For total 900000 and pump 850000 kWh, the unchanged equation yields new pump energy 597003.375 and saving 302996.625 kWh. A pump-only subtraction would be 252996.625 kWh (~171278.715 kgCO2eq), but that alternative is documented only. The action remains provisional and is not scientifically validated.
3. **Chimdi/team — minimum data and missingness:** approve each process's scientific sufficiency, imported/default confirmation policy, applicability/zero-denominator behavior and unusual mass-balance boundaries. No new treatment/sludge factors or pump-saving formula is approved here.
4. **Silvia — language:** review new validation and water-loss wording in both languages. Current detailed error text is English.

## Reproducible fixtures and guide mismatches

Run `node scripts/make-review-fixtures.js`. Separate `test/fixtures/review/case-a.json` and `case-b.json` use fictional data only. Their `.context.json` companions record exact constructor defaults, all settings, guide-supplied values/provenance, GWP factors, period, assumptions and model version. These companions are test support, not an implemented app import format.

Both use 2025-01-01 to 2026-01-01, 365 days, Indonesia/IDR, AR5-CCF (index 0; CH4 34, N2O 298), grid factor 0.677, and the supplied protein/BOD/household factors. The factor is an example default, not verified current Indonesian evidence. ECAM storage conversions: 100 L/s → 0.1 m³/s; 5 km → 5000 m; 1200 L diesel → 1.2 m³. The pump-size choice is index 3 (>96 kW), treatment C/F/S/Filt/Des is index 3, diesel index 0.

| Independent guide check | Reproduced local result |
|---|---|
| Case A electricity / emissions | 1800000 kWh / 1218600 kgCO2eq |
| Case A NRW / water loss | 28.57142857% / 25% |
| Case A NRW / water loss per km | 160000 / 140000 m³/km for the annual period |
| Case A 70% pump scenario | 267878.778934 kWh / ~181353.933 kgCO2eq saved |
| Case B electricity / emissions | 498000 kWh / 951308.552211 kgCO2eq |
| Case B AR4 | about 899.5 tCO2eq |
| Case B electricity-only aeration scenario | 453000 kWh, reduction 30465 kgCO2eq |

Case B's 300000 × 15% = 45000 kWh aeration saving, 30.465 tCO2eq, budget and 16-week schedule are **user-supplied fictional assumptions**. They are recorded in fixture context; no aeration action-card benefit is generated or approved. The scenario changes treatment electricity only, preserving process loads/factors/sludge.

The guide asks for a profile workflow that is currently disabled: use the existing **Optional details** for name, location, service and responsibilities/capacity; operating quantities stay in ECAM. The profile has not been restored. The guide's narrative budget/schedules are not automatic model inputs. Case A's untouched task template totals 100 weeks including 52-week monitoring; its 16-week illustrative implementation schedule requires deliberate editing. The compost-N field has the guide's acknowledged misleading stored-sludge wording. No expected value was adjusted to force agreement.

## Verification and local review steps

- Initial offline suite passed on the pre-existing working tree (14 files). Final `npm test` covers the same suite plus `assessment-validity.test.js` (15 files), with `test/helpers/offline.js` preloaded in every process. AI keys are deleted; all external fetches are refused. Provider tests use injected synthetic responses.
- New regressions cover dates, empty/default-zero assessments, missing required and enabled inputs, numeric bounds/types, same-boundary inconsistencies, explicit zero, imported/unconfirmed and not-applicable states, malformed imports, invalid calculate/chat contexts, API gates, independent PDF figures, pump warning and Case A through real Word/ZIP generation. ZIP provenance and Word contents are inspected programmatically.
- Existing integrity test's unrelated assessment had 10 kWh total but a larger pumping value. Its pumping value is now also 10 kWh so it remains a valid **freshness/ownership** fixture; its assertions and the guide's expected outputs were not relaxed.
- Browser: a dedicated in-app browser origin `http://127.0.0.1:38741` isolated storage from normal/live work. Checked empty draft, reversed/equal dates, linked field errors, negative and malformed values, checkpoint/reload preservation, blank versus explicit zero, duplication, Case A import/results/finish, pump and water-loss cards, saved selection, plan, proposal and Word download. The browser download was `/Users/noah/Downloads/proposal (5).docx`. ZIP generation is verified by the API regression. Drafts remain unfinished and are not marked reviewed.
- Current local library retrieval returns `ecam-methodology-guide#p162-1` for a pump query. Live deployment, real AI completion, Word/LibreOffice visual pagination, mobile/cross-browser, full accessibility/security/load/recovery and multi-tab behavior were not verified.

To review locally:

1. `npm test` (requires local listener permission in a restricted sandbox).
2. `PORT=38741 node --require ./test/helpers/offline.js server.js` and open `http://127.0.0.1:38741` in a fresh browser profile/origin. Do not clear existing user storage.
3. Start a new assessment. Try equal/reversed dates, an empty process, -100 kWh, 30 service hours and 120% target efficiency. Inspect summary links and field errors, save a checkpoint and reload. Change a blank energy field to an explicit 0.
4. Load **only** `test/fixtures/review/case-a.json`; check 365 days, 1218.6 tCO2eq, 28.57% NRW and 25% water loss. Finish, choose only the distribution pump, save selections, generate/save a plan, choose General, generate the working proposal and download Word/ZIP.
5. In a separate fresh workspace, load `case-b.json`. Check the baseline and no-biogas applicability. For the narrative scenario duplicate B and change treatment electricity to 393000; retain all other values. Treat budgets, savings narrative and schedule as assumptions.
6. Review `ecam/results.json`, `application-metadata.json` and `availability-and-water-balance.json` in the ZIP. Companion import and selected-project-only export remain separate work.

Logs, initial preservation copies, PDF renders and generated browser evidence are under `.cache/assessment-validity/`. Changes are left uncommitted. Stop after this validity batch; no live-site fix or scientific approval is implied.

Final verification: the complete 15-file offline suite exited 0 after the last code changes; `git diff --check` is clean. The source PDFs retain the SHA-256 values above. Browser proof: `.cache/assessment-validity/case-a-browser.png`.
