# Meeting feedback (Oct 20): what changed

Status: **proposed, not yet approved by the team.** Branch `max/feedback-oct20`, built on `main` after Noah's PR #1. All examples use the hypothetical Utility A sample. No ECAM equation, Stage 2 rule, threshold, assumption or estimate changed.

## Feedback → change

| # | Feedback | What the app does now | Where |
|---|---|---|---|
| 1 | Utilities have different responsibilities | The utility profile asks who runs each of five service areas (water supply, sewer network, central WWTP, household septic tanks, desludging and IPLT): *we operate it* / *shared or run by local government or another provider* / *not our responsibility*. It also asks three capacity questions (capital budget, engineering capacity, operational data). | `public/js/responsibility.js`, profile form in `public/js/app.js` |
| 2 | The largest source may not be actionable | Stage 1 results and Stage 2 show **Total inventory** next to **Directly actionable**, **Needs coordination** and **Outside utility responsibility**, with the largest source overall and the largest source the utility can act on. Totals never change. Utility A: septic-tank containment is 91% of the inventory but outside the utility's responsibility; the largest actionable source is grid electricity in distribution. | `RS.breakdown`, `FU.responsibilityPanel` |
| 3 | Incomplete data | **Fill empty inputs with ECAM estimates** (per substage) fills zero inputs with ECAM's own estimation formulas, only for inputs shown by the current answers. Each one gets an *ECAM estimate* label until the user types a value. Results list them, and the plan baseline and proposal facts say how many there are. | `fillEstimates`, `estimatesList` in `app.js`; `ecam-form.js` |
| 4 | Actions should reflect local circumstances | Stage 2 cards are grouped by responsibility. Options outside the utility's responsibility are collapsed and listed last. Each card shows its tier and feasibility flags from the profile (*needs external financing*, *needs co-financing*, *may need technical support*, *based mostly on estimated data*). Flags never hide an option or change a figure. | `RS.forOption`, `RS.flags`, `FU.cardLine` |
| 5 | Accept, reject, revise, ask for alternatives | Each card has **Not relevant** (with an optional reason; it can be restored), **Suggest alternatives** and **Revise with AI**. Without AI, alternatives come from the team framework rows for that emission source. With AI, the model drafts alternatives or a revision from the option, the profile, the framework and library passages. A draft becomes an action only when the user clicks **Add as my action**. It is then a user-proposed action (Noah's custom actions): no figures, labelled as not reviewed. Drafts with numbers are flagged. | `engine/alternatives.js`, `POST /api/actions/alternatives`, `frameworks/prompts/action-alternatives.md` |
| 6 | Standardised planning, missing data, editable | Stage 3 adds a **Project concept** in the eight areas of Chimdi's planning framework (`stage-guidance.json`, stage 3). Each area is filled from data the app has; anything else becomes a `[To be provided: …]` placeholder. With AI on, the model rewrites the areas and keeps placeholders. Every area is editable and has a status (*from your data*, *needs input*, *AI draft — verify*, *edited by you*) and a *Reviewed* tick box. | `engine/plan-concept.js` |
| 7 | Financing relevant to Indonesia and the project | Stage 4 lists **financing pathways** matched to the selected actions and the profile, each with the reasons it is listed, who usually applies, questions to confirm, and related library documents (with their caveats). Ticked pathways go into the proposal facts and the template text, always as "to investigate; eligibility not confirmed". | `frameworks/pathways.json`, `engine/pathways.js` |
| 8 | Verification | ECAM remains the only source of numbers (drafts, alternatives and user actions carry none). A **Before you share this** checklist on the plan concept and on the proposal counts open placeholders, AI-drafted parts not yet ticked as reviewed, and AI sentences about regulations, funders or costs that have no `[S#]` source. | `FU.review`, `FU.reviewChecklist` |
| 9 | Too much information | Stage 1 results lead with the key figures and the responsibility split; detailed tables are collapsed. Stage 2 cards are compact: sources, decision condition and input notices moved into *Details*; scenario assumptions are collapsed. | `ecam-form.js`, `decision-cards.js` (`compact`) |
| 10 | User testing | Not code. Presenter notes below cover the new flow. | — |
| 11 | Other countries | Not started (marked *Future*). Pathways and the responsibility areas are data files that a country module could replace. | — |

## LLM backend: Gemini

`engine/ai.js` now supports Google Gemini (`generateContent`, key in the `x-goog-api-key` header) and still supports Claude.

| Variable | Meaning |
|---|---|
| `GEMINI_API_KEY` | Turns AI on with Gemini (set it in the Render dashboard, never in the repository) |
| `GEMINI_MODEL` | Optional, default `gemini-3.8-flash` |
| `GEMINI_THINKING_LEVEL` | Optional: `minimal`, `low` (default), `medium`, `high` or `off`. Thinking tokens count against the output limit, so the client adds headroom. |
| `LLM_PROVIDER` | Optional `gemini` or `anthropic` when both keys are set (Gemini wins otherwise) |
| `GEMINI_API_BASE` | Optional; for a proxy or a local mock in testing |

JSON answers (alternatives, plan concept, funding-guide sections) use Gemini's JSON mode. Blocked, truncated and failed answers become clear provider errors, and the existing template fallbacks apply. `/api/health` shows `provider` and `model`.

## Data model and compatibility

- **Profile** gains eight keys (`resp_*`, `capex`, `tech_capacity`, `data_availability`). They are part of the profile fingerprint, so changing them marks the plan and proposal outdated, as other profile edits already do.
- **Plan** gains `concept`. The plan fingerprint now includes the concept texts. Plans without a concept keep their fingerprint, so older saved plans are not marked outdated.
- **Financing** gains `pathways`. The framework key includes them only when at least one is ticked, so older proposals keep their key.
- **Session-only state**: `estimateUse` (which inputs came from ECAM estimates) and `rejectedActions`. Neither is in the ECAM JSON, so ECAM files stay compatible.
- **Exports**: the ZIP adds `plan/project-concept.md` and `financing/pathways-to-investigate.json` when present.
- **Sample**: *Load sample utility* now also sets a hypothetical profile, unless one exists: water and wastewater operated, septic tanks not the utility's, desludging shared, co-financing needed.

## Questions for Chimdi

1. **Mapping of ECAM outputs to service areas.** `wwo` containment and open defecation → household septic tanks; all other onsite outputs (onsite treatment, discharge, sludge, biogas, fuel, electricity) → desludging and faecal sludge treatment. Is that right?
2. **Desludging option tier.** It follows the *desludging and IPLT* answer, not the septic-tank answer, because the action is a service. Agree?
3. **Utility-wide options** (solar PV) are as actionable as the best-placed service the utility runs. Agree?
4. **Feasibility flag rule lists** (`CAPITAL`, `TECHNICAL` in `responsibility.js`): which actions need capital or specialist engineering?
5. **Financing pathways** (`frameworks/pathways.json`): six generic pathways with eligibility questions. Which should be removed, renamed or added for Indonesian utilities, and which documents should back each one? The national-transfer pathway points to the DAK excerpt, which is unverified OCR.
6. **Plan concept indicators** (`INDICATORS` in `plan-concept.js`): are these the right ECAM indicators to monitor per action?

## Questions for Silvia (Bahasa Indonesia)

All new strings are in the blocks marked `meeting feedback (Oct 20)` / `masukan rapat (20 Okt)` in `public/js/i18n.js`, plus the Indonesian template sentences in `engine/plan-concept.js` (`T.id`), `engine/proposal.js` (`pathwaysText`, `responsibilityText`) and `frameworks/pathways.json`. Please check in particular:
- *Dapat ditindaklanjuti langsung / Perlu koordinasi / Di luar tanggung jawab utilitas*
- the service-area names (*LLTT*, *IPLT*, *IPAL*)
- *Perlu disediakan* (placeholder) next to Noah's *Perlu dilengkapi*

## Presenter notes (new flow, about 10 minutes, AI off)

1. **Assess:** Load sample utility (profile is set). Open *Household septic tanks* and click **Fill empty inputs with ECAM estimates** to show the label. View results: 91% of the inventory is outside the utility's responsibility, and the largest source it can act on is shown separately.
2. **Identify actions:** cards grouped by responsibility. On A02, click **Suggest alternatives** and add *Variable-speed drives* as your own action. Mark solar PV **Not relevant** with a reason. Select A01, A02 and the new user action.
3. **Project plan:** generate it and walk through the eight concept areas and the **Before you share this** checklist. Edit one placeholder and tick an area as reviewed.
4. **Financing:** tick *Local government budget* and *International climate funds*, generate the general proposal, and show the pathway text in the budget section and the checklist. Download the ZIP.

## Known limitations

- The AI paths were tested with a local mock of the Gemini API and with a fake client in unit tests. Real Gemini output quality has not been reviewed.
- The uncited-claim check is a keyword heuristic. It finds obvious cases, and a person still has to verify the text.
- Alternatives and rejections are kept for the browser session (rejections are saved; alternative drafts disappear on reload until added).
- Responsibility mapping, flags and pathways are drafts awaiting Chimdi's review. Only the pathways list says so in the interface; the tier labels do not yet carry a "draft" mark.
