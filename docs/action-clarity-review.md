# Action clarity: review handoff

Status: **proposed, not yet approved by the team.** Branch `noah/action-clarity` (from `noah/demo-readiness`). All examples use the hypothetical Utility A sample. No equation, threshold, assumption, eligibility rule or benefit estimate changed.

## What changed for users

- **Stage 2 cards** show, without opening Details:
  - **Addresses:** the problem or source the action acts on and where, for example "Methane from faecal sludge containment · Onsite sanitation › Household septic tanks".
  - The **emission classification** of each source as a text label: *Direct emissions · mapping awaiting review*, *Indirect emissions · mapping awaiting review* or *Classification pending review*. The label itself says the mapping is ours and not yet reviewed; the colour and border only repeat the text; nothing uses an "approved" green.
  - **Energy benefit not quantified** where a card has a GHG estimate but no energy estimate. This is distinct from a calculated 0 kWh (see "Benefit status" below).
  - Details adds an **Emission source** entry with the basis of the classification, its review status ("not yet reviewed by the team's scientific reviewer") and **Show in assessment**, which opens the matching Stage 1 substage of the assessment the options came from. If another assessment was open in Stage 1, the app switches to the source assessment and says so; Stage 2 options, selections, plan and proposal keep their source.
- **Order cards by:** *Original order* (default), *Estimated GHG reduction (highest first)*, *Estimated energy savings (highest first)*. A sorted view shows the measure on every card with its qualifiers ("scenario", "Up to the full untreated-discharge emission"), and a note that estimates use different methods, that unquantified options come last, that benefits are not added together, and that this is not a ranking of the best action. The baseline stays first. Ordering is display only: stored order, A-labels, keys, estimates, selections, notes and open cards are unchanged, and it never marks plans or proposals outdated. The choice is saved with the session; older sessions default to the original order.
- **Largest assessed contributor** (Stage 1 results and Stage 2): source, location, tCO₂eq, share of the assessed total and classification. Ties list every tied source; zero totals, values ECAM cannot evaluate and breakdowns that do not add up are reported instead of guessed.
- **Stage 1 results, substage table:** two new columns, *Emission sources* (each first-level ECAM source with its classification label and tCO₂eq) and *Related action cards* (A-labels of current Stage 2 options at that substage; hidden with a note while options are outdated).
- **Exports:** the Word "Selected actions" table adds an "Addresses: … Source: classification" line under each option, in the output language; `actions/selected-actions.json` in the ZIP adds structured `addresses` and `benefit_status` fields. Both are derived at export time from the same mapping, so they cannot disagree with the cards.
- **No combined savings.** Generated text and exports present each action's estimate separately and say "Combined savings have not been assessed because actions may overlap." (see below).

## Combined savings

The template plan summary used to add the selected actions' reductions ("Calculated reductions add up to about … tCO2eq"). Actions that act on the same source (for example a pump upgrade and solar PV, both on grid electricity) overlap, and no interaction model exists, so that sum was not an achievable package reduction. Now:

- `templatePlanSummary` lists each action's own estimate ("A02 566 tCO2eq · 836,297 kWh; A03 538 tCO2eq · 795,000 kWh (scenario)") and, with more than one action, states that combined savings have not been assessed. The template "Proposed actions"/"Impact" sections end with the same statement; the Word "Selected actions" table has it as a note; the ZIP README says it.
- Proposal facts carry `combined_savings: "not assessed: …"`; the shared AI rules (`frameworks/prompts/system-base.md`) forbid adding estimates together and say an unquantified benefit is unknown, not zero; `project-plan.md` asks for each effect separately. The general framework's summary guidance no longer asks for a "total expected reduction", and the GCF impact guidance asks for each option separately.
- **Older saved text is not rewritten.** If a saved plan summary or proposal section still contains the earlier template sentence (English or Indonesian), the plan, financing and draft pages show a warning, Word/ZIP export is blocked in the browser and on the server (409), and drafting a proposal from that plan is blocked. The user deletes or rewrites the sentence (their other edits stay), or regenerates (the current version is kept as the previous version). Deleting it from the plan marks the proposal outdated through the existing edit protection.
- Nothing is assumed about which actions are independent; no estimate changed.

## Benefit status

The desludging rule stored `expected_kwh: 0` as a placeholder: it never calculates the energy of emptying trucks or sludge treatment. It now also carries `benefit_status: { kwh: 'not_quantified' }`; every option gets `benefit_status` for GHG and energy (a missing number is `not_quantified`, any calculated number including 0 is `quantified`). `expected_kwh` stays 0 so stored sessions, fingerprints and the server's figure comparison are unchanged. `AS.benefitStatus` reads the field and, for older saved desludging actions without it, treats the known placeholder the same way. Cards, the energy ordering (unquantified options last, in stored order), the Word expected-result column, `selected-actions.json` and the proposal facts all use it and show "Energy benefit not quantified" / "Manfaat energi belum dihitung". A genuine calculated zero still shows and sorts as 0 kWh.

## How the breakdown avoids double counting

ECAM's `TotalGHG` is the sum of every substage's `<prefix>_KPI_GHG`, and each of those is the sum of a fixed list of first-level outputs (`vendor/ecam/backend/global.js`). `AS.COMPONENTS` copies exactly those lists. Some first-level outputs are parents of finer ones (`wwt_KPI_GHG_biog`, `wwt_KPI_GHG_slu`, `wwo_KPI_GHG_sludge`); their children are never listed separately. The largest contributor is chosen among substage × first-level source; the breakdown is used only if each substage's components add up to its own total (otherwise "Not shown"). For Utility A the components add up to 81,653 tCO₂eq exactly, and the largest is containment at Household septic tanks: 74,460 tCO₂eq, 91.2%.

## The mapping (`public/js/action-sources.js`)

| Rule | Addresses | Source(s) and location | Classification |
|---|---|---|---|
| `pump_upgrade` | Pump efficiency below the expected value | Grid electricity, its substage | Indirect |
| `pump_audit` | Pump performance not yet measured | Grid electricity, its substage | Indirect |
| `nrw_reduction` | Water lost in distribution (its distribution substage) | Grid electricity, water abstraction, treatment and distribution (what its estimate uses) | Indirect |
| `septic_desludging` | Methane from faecal sludge containment | Containment, its substage | **Pending review** |
| `cso_reduction` | Collected wastewater discharged untreated | Untreated discharge (`wwc_KPI_GHG_cso`) | Direct |
| `biogas_capture` | Methane from the wastewater treatment process | Treatment process (`wwt_KPI_GHG_tre`) | Direct |
| `fuel_switch` | Fuel burned in on-site engines | Fuel engines (`*_KPI_GHG_fuel`) | Direct |
| `solar_pv` | Grid electricity use | Grid electricity, whole utility | Indirect |

Classification basis:

- **Indirect, grid electricity:** ECAM labels every `*_KPI_GHG_elec` output "Electricity (indirect)" (`vendor/ecam/languages/en.json`). This is the only classification ECAM states per output.
- **Direct, fuel engines, wastewater treatment process, untreated discharge, treated effluent discharge (`wwt_KPI_GHG_disc`):** ECAM's label file names the categories "Fuel combustion (direct)", "Treatment process (direct)", "Untreated wastewater (direct)" and "Discharged water (direct)", and the ChatWater ECAM notes (`knowledge/ecam/ecam-overview.md`, team notes, not reviewed) list the same sources as direct. ECAM's code does not link these outputs to those category labels; the link is ours.
- **Everything else is unclassified** and shows "Classification pending review", including containment and all ECAM outputs not listed above.

All classifications carry review status `pending`. Classification is separate from input confirmation (input status), evidence documents ("Supporting document not yet added.") and scientific validation; none of them changes another.

## Questions for Chimdi

1. **Containment (priority; 91% of the Utility A total).** The ChatWater notes call containment direct but define direct emissions as coming from sources the utility owns or controls. Household septic tanks are usually owned by households. Should containment methane be direct, indirect (value chain), or reported separately? Until answered, cards, the contributor and exports show "Classification pending review".
2. **Confirm the four "direct" classifications** that rest on ECAM category labels plus our notes rather than a per-output ECAM label: fuel engines, wastewater treatment process, untreated discharge and treated effluent discharge.
3. **Unclassified outputs.** Should any of these be classified: generation in sewers (`wwc_KPI_GHG_col`), truck transport (`wsd_KPI_GHG_trck`, `wwo_KPI_GHG_trck`, `wwt_KPI_GHG_slu_transport`, `wwt_KPI_GHG_reus_trck`), biogas, digester fuel, sludge management, onsite treatment and discharge, open defecation? Note that ECAM's text calls sludge transport "Indirect CO2", while a utility-owned fleet is often counted as direct.
4. **Non-revenue water** is labelled indirect because its estimate counts only grid electricity in water supply. Is that adequate, or should the card say that other effects (chemicals, fuel) are not estimated?
5. **Desludging energy (now shown as not quantified).** The placeholder 0 kWh is now displayed as "Energy benefit not quantified" (see "Benefit status"). Should the rule eventually estimate the energy and fuel of emptying and sludge treatment, and with which method?
6. **Combined savings (now not summed).** Is an interaction model wanted (for example pump upgrade then solar on the reduced load), or is "not assessed" the right long-term wording for proposals?

## Questions for Silvia (Bahasa Indonesia)

All new strings are in the block marked `// sasaran kegiatan, klasifikasi emisi, urutan dan kontributor terbesar (usulan; perlu ditinjau Silvia)` in `public/js/i18n.js`. In particular: *Menangani* (Addresses), *Emisi langsung · pemetaan menunggu tinjauan* / *Emisi tidak langsung · pemetaan menunggu tinjauan* / *Klasifikasi menunggu tinjauan*, *Manfaat energi belum dihitung*, the combined-savings sentence (*Penghematan gabungan belum dinilai karena kegiatan dapat saling tumpang tindih.*) and the warning about earlier summed sentences, *Kontributor terbesar yang dinilai*, *Urutkan kartu menurut* and the sorting note (it must not read as "best action"), *Kehilangan air di distribusi*, *Mesin berbahan bakar*.

## Overlap with Max's work

- `engine/export.js` (Word table cell can hold several lines; `addressesText`; `addresses` and `benefit_status` in `selected-actions.json`; "Energy benefit not quantified" in `expectedText`; combined-savings note; README lines). The export now reads interface labels from `public/js/i18n.js`.
- `engine/proposal.js` (`templatePlanSummary` lists estimates separately; `facts()` adds `energy_benefit` and `combined_savings`; template actions/impact sections add the not-assessed statement).
- `engine/actions.js`: `benefit_status` metadata only (desludging plus the derived status of every option); no equation, threshold or figure changed.
- `engine/integrity.js` (`summedIssues`; export and proposal drafting blocked on the earlier summed sentence), `public/js/cw-core.js` (`summedClaims`).
- Prompts and guidance: `frameworks/prompts/system-base.md`, `project-plan.md`, `frameworks/financing/general.json`, `gcf.json`.
- `public/js/ecam-form.js` `renderResults` (contributor panel and two table columns).
- No change to `engine/plan.js` or the knowledge base.

## Dependencies and compatibility

- The mapping is derived from each option's rule, substage and key, which saved sessions already contain, so older sessions show the same labels. Options from schema-1 sessions without a key get no link.
- The source/classification metadata is not sent to plan or proposal generation and is not part of any fingerprint; it is recomputed at export time. `benefit_status` is also outside every fingerprint (older saved actions without it stay current and pass the server check); only its derived `energy_benefit` and the `combined_savings` note reach new drafts, so existing plans and proposals are not marked outdated. No freshness check is weakened (tests: `test/action-clarity.test.js`).

## Known limitations

- Classification labels are proposals pending scientific review; passing tests checks the code against this mapping, not the science.
- Older summed sentences are detected only when they match the earlier template wording. AI-written text from before this change (AI was off in all local testing) could add estimates in other words and is not detected; review such text by hand.
- Combined savings are not estimated at all; there is no interaction model.
- Rule-trigger "why it appeared" values and the new source amounts are in ECAM base units / tCO₂eq, as before.
- Substage names inside Indonesian text stay as entered in the assessment.
- The Stage 1 results table shows related cards only for the assessment the current Stage 2 options came from.
