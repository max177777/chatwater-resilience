# Silvia participant review handoff

Implementation is complete on the existing `noah/silvia-participant-review` branch, based on `ce6d550`. Implementation changes are committed for the user-requested branch push. Existing work, including untracked `.github` files, is preserved; their prior checkpoint is `.cache/silvia-review/preexisting-github.tgz`. No new branch, merge, deployment, external model call, browser installation or scientific equation change was made during completion. The user subsequently authorized committing and pushing this branch.

## Utility identity

Utility records and assessment-to-utility ID associations are separate. Names never establish ownership. A single-assessment legacy profile is associated with that assessment. With multiple legacy assessments, the profile remains preserved but unassigned; open Utility details and choose the intended saved utility explicitly. Imported assessments remain unassigned. New assessments explicitly offer reuse versus another utility; duplicate assessments retain the association. The header displays Utility and Assessment separately and opens Utility details with pointer, Enter or Space.

Chat and generation resolve source assessment associations. Selected-project exports use the source utility even if a different assessment is active. The server rejects mismatched utility/profile associations; scoped recovery contains only the associated utility. Full workspace backups retain every utility and association. Profile fingerprints still govern freshness. Saving a selection for another assessment preserves previous concept financing fields in `financingHistory` and clears them for the new assessment, preventing silent transfer of another utility's implementing-organization narrative. Existing documents remain preserved and subject to freshness checks.

Generated new-assessment names have explicit metadata. Language switching translates only a name still matching that generated value; user edits and legacy names without ownership metadata are preserved. Existing authored narrative, documents, source titles and quotations do not change when interface language changes.

## Completed participant guidance

- Accessible compact required/calculation/optional indicators with expandable field guidance and a persistent legend. Invalid-input errors remain beside inputs; missing/unknown explanations expand from the indicator.
- Compact readiness counts, with detailed issues and correction links inside an expandable panel. Guidance links still open and focus the intended field/review control.
- Editable content precedes detailed review administration. Each section's review controls follow its editable content; plan summary, concept areas and schedule have local controls. Notes expand by default only for flagged issues that require treatment. Review association hashes remain under diagnostics. Refreshing a confirmation returns focus to its control. Server content-bound human-review restrictions are unchanged.
- Persistent descriptions distinguish browser progress/checkpoints, active assessment ECAM inputs, selected-project packages, and full workspace recovery backups. No browser storage is described as cross-device backup.
- Help explains without editing; Revise proposes an alternative for preview and explicit addition; Generate produces editable content. AI-off generation uses templates. Saving notes does not request or apply a revision.
- Assess returns to active inputs. Service scope is early; water-only scope hides inactive sanitation factors. Dates explain the exclusive end convention and offer the last completed calendar year. Stored values and equations are unchanged. Unknown retains its number but excludes dependent supported calculations. Factor confirmation preserves source origin.
- Incomplete results, provenance statuses and unavailable water-balance results are localized; missing fields use readable names with process names and correction controls. Missing per-person indicators identify served population and provide a correction control. Totals identify selected processes. Source queries, library IDs and review hashes are expandable diagnostics.
- PDAM/PAM applies to drinking-water organizations; wastewater-only scope remains “Wastewater” / “Air limbah” and generic “Utility” / “Utilitas”. Silvia may confirm PAM alone versus PDAM/PAM and preferred combined-service terminology; this is editorial, not a calculation change.

## Complete fictional demonstration

`public/samples/complete-example.json` reproduces existing `test/fixtures/review/case-a.json` (supplied fictional Indonesia example). `public/js/demo-example.js` assembles bilingual utility details, responsibility/capacity, input provenance and hypothetical GCF source fields. It is called only by Load complete example, never by real imports.

Loading requires explicit acceptance of fictional example assumptions. Accepted input applicability is not measurement or scientific verification. Every numeric source record carries the fictional source note; no generated document is marked human-reviewed. Drinking-water operations are assigned to the fictional PDAM/PAM; inactive wastewater responsibilities are outside its scope. Supported inventory: 1,218,600 kgCO2eq. GCF eligibility, source qualifications and technical design remain unverified.

Manual demonstration steps (also displayed in the app):

1. Load complete example and read the fictional-origin notice. Inspect inputs/results, then finish the assessment.
2. Show action options, select the pump improvement, and save the selection. Each benefit remains an individual potential estimate.
3. Generate the plan, inspect/edit the summary and tasks, and save it. Task durations are generic planning defaults. The fictional proposed 16-week duration is a discussion input, not a validated schedule; reconcile it with task durations before sharing.
4. Open financing and inspect the supplied hypothetical title, organization, objective, mitigation evidence, beneficiary area, investment, cost, partners and assumptions. Generate the GCF preliminary concept.
5. Inspect all eight editable sections and download a working draft. Preliminary next-stage placeholders and scientific/source warnings remain legitimate. Human-reviewed export requires explicit review of the exact current plan and concept sections and explanatory notes for flagged claims; do not remove these requirements for the demo.

The bilingual automated journeys reach actions, a plan, eight-section GCF concept and working-draft ZIP export. Reviewed export is rejected before human review. Existing generated work is retained in the example recovery snapshot and normal previous-version mechanisms.

## Verification

- `test/participant-review.test.js`: actual guarded local HTTP routes in both languages, complete supported inventory, pump selection, AI-off plan, eight-section GCF concept, working-draft ZIP, human-review rejection, utility association mismatch rejection, restoration, and unrelated utility exclusion from nested exported JSON.
- `test/participant-ui.test.js`: actual form helpers in an isolated VM, covering bilingual factor/provenance/KPI/water-balance rendering. This caught and fixed a missing translation binding. This is not a browser or layout test.
- `test/utility-identity.test.js`: conservative migration, distinct utility edits, restoration/fingerprints and execution of the actual full-workspace backup adapter with isolated stubs.
- Full 25-file offline suite: `.cache/silvia-review/verified-offline.log`; final rerun recorded in `.cache/silvia-review/final-offline.log`. Targeted final journeys and exports: `final-journey.log`, `final-export.log` in the same directory. Syntax checks and `git diff --check` pass.
- Isolated absent-library check: `.cache/silvia-review/completed-absent.log`; final rerun `final-absent.log`.
- An earlier suite run encountered an empty local HTTP response in decision-support. Its focused rerun passed (`decision-recheck.log`), followed by a passing full suite. It was not reported as a passing run.
- Supported browser discovery returned `[]`. No connected browser was available. No visual layout, actual browser keyboard focus, bilingual browser journey or browser-downloaded-file verification is claimed. No browser system was installed or configured.

Remaining English is intentional original-language material: published source titles/quotations, ECAM country/option names lacking translation, technical identifiers in diagnostics, original-language server error detail labelled as such, and saved user-authored or legacy narrative. New demo concept source text is localized when loaded; switching interface language preserves the already authored source/document text. Old names containing “Penilaian” without generated-name metadata are preserved rather than guessed to be application-authored.

## Exact local acceptance steps

From the repository root, start the guarded preview:

```sh
PORT=38761 node --require ./test/helpers/offline.js server.js
```

Open `http://127.0.0.1:38761/?workspace=silvia-accept-en-20261028`. For the Indonesian run use a separate suffix, e.g. `?workspace=silvia-accept-id-20261028`. The workspace query selects isolated browser storage. Use a new suffix for each clean run. The guard removes both provider keys and blocks external fetches. Run automated checks with `npm test` and `npm run test:absent-library`.

Short manual checklist:

- **Identity:** create A and B, decline reuse for B, enter different details. Switch assessments and verify header, chat, action generation, plan/concept organization and exports. Test explicit reuse separately. Edit a utility and verify affected output freshness; restore a full backup in another isolated workspace and check both associations.
- **Sample:** complete the five manual demonstration steps above in English and Bahasa. Verify hypothetical origins, responsibility scope, individual benefit caveats, supplied source fields and working-draft versus reviewed export restrictions.
- **Navigation:** return to Assess once; active inputs/values remain. Follow missing-input and review-issue links; verify the correct process, open ancestors and target focus. Mark unknown and confirm a factor; verify retained precision, source origin and calculation availability.
- **Layout/focus:** at desktop and narrow widths, check wrapping, the compact legend/readiness panel, content before administration, section-local review controls, and optional/required note behavior. Traverse with Tab, Enter and Space. Confirm focus returns after review and errors stay beside invalid fields.
- **Language:** switch languages with generated and edited names; generated labels translate, authored text remains. Check PDAM/PAM only for drinking water, appropriate wastewater labels, units, exclusive dates and original-language source notices.
- **Files:** download ECAM inputs, selected-project ZIP/Word, and full workspace backup. Verify selected packages exclude the other utility, retain provenance/scientific caveats, and restore with the correct association. Full backups should retain both utilities and recovery history. Confirm reviewed downloads remain blocked until explicit valid human review.
