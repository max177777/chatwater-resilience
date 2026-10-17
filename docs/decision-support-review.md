# Decision cards and data checks: review handoff

Status: **proposed, not yet approved by the team.** This lives on branch `noah/decision-support` only. All examples use the hypothetical Utility A sample.

## What changed for users (Stage 2)

- **Decision cards replace the options table.** Each card shows, in compact form:
  - the selection checkbox
  - the benefit estimate
  - *Why it appeared* (the rule's own condition)
  - the decision condition

  **Details** opens:
  - the assessment values the rule read
  - the existing estimate with its scenario assumption, exclusions and calculation basis
  - *Supporting evidence*: currently always "Supporting document not yet added.", because no action is linked to a document
  - *Missing information and conditions*: the decision condition, plus input status for covered rules
  - the notes field and the (AI-only) explanation
- **The Data checks panel** lists the covered checks with three distinct statuses:
  - *Option offered*: the rule's condition holds
  - *Checked — condition not met*: the inputs it reads are present and the condition does not hold
  - *Not assessed — information missing*: an input or ECAM output the condition needs is zero or missing

  Each check shows its reason, the inputs at zero, and each input's status. The other rules are listed as "option offered" or "no option (missing data or condition not met)", because the app cannot tell those two apart for them.
- **Input status** is recorded for the inputs of the covered checks:
  - *Entered*: typed, selected or applied in Stage 1
  - *Confirmed*: confirmed by the user in Stage 2
  - *Not entered (default value)*: untouched in an assessment created in this app
  - *Input status unconfirmed*: imported files, the sample, duplicates and sessions saved before this feature

  A record only holds while the value is unchanged. Status never changes options, figures or freshness.

## Coverage (deliberately limited)

| Check | Rules | Substages | Inputs tracked |
|---|---|---|---|
| Pump efficiency | `pump_upgrade`, `pump_audit` | abstraction, distribution, sewer collection | `*_pmp_flow`, `_head`, `_volt`, `_amps`, `_pf`, `_exff` |
| Non-revenue water | `nrw_reduction` | distribution | `wsd_vol_dist`, `wsd_auth_con` |
| Scheduled desludging | `septic_desludging` | onsite sanitation | `wwo_cont_emp` |

Not covered: `cso_reduction`, `biogas_capture`, `fuel_switch`, `solar_pv`, and `pump_upgrade` in treatment and onsite substages.

## Where things are

- **Rule conditions in words:** `trigger()` on each rule in `engine/actions.js`
- **Covered checks:** `CHECKS` and `ruleChecks()` in the same file
- **Input-status logic:** `TRACKED_INPUTS`, `inputStatus()` and `setInputStatus()` in `public/js/cw-core.js`. Status is stored in `state.inputStatus` in the browser, never in the ECAM JSON, so ECAM files stay compatible.
- **Cards and panel rendering:** `public/js/decision-cards.js`
- **Tests:** `test/decision-support.test.js`

## Questions for Chimdi (scientific and engineering)

1. **Pump-flow units (priority).** ECAM declares `*_pmp_flow` in L/s, but `wsa_pmp_pw = flow × head × ct_gravit / 1000` yields kW only if flow is in m³/s. The sample's 1.27 at 45 m gives 560.6 kW and a 52% efficiency, which drives A02 (836,297 kWh). Is the sample value meant as m³/s, or does the ECAM formula or unit need checking? Nothing was changed.
2. **The non-revenue water rule reads `wsd_auth_con`.** That input sits behind an ECAM question that is "No" in the sample, and ECAM resets it to 0 when the question is switched off. ECAM computes `1 − auth_con/vol_dist` as *water losses* (`wsd_SL_water_loss`); non-revenue water uses billed consumption (`wsd_bill_con`). Which should the rule use, and is 15% the right trigger?
3. **Desludging with zero containment emissions** is shown as "not assessed". Should a containment type whose methane factor is zero count as "assessed, not triggered" instead?
4. **Pump checks** cover abstraction, distribution and sewer collection only (the `pump_audit` scope). Should treatment and onsite pumps be covered?
5. **Minimum data per rule.** Should an option be withheld, or only flagged, when its inputs are unconfirmed? Today it is flagged only. Proposed requirements to discuss, none enforced:
   - desludging: a confirmed emptying rate and containment type
   - non-revenue water: a confirmed authorized or billed consumption
   - pump: confirmed duty-point measurements
6. **Applying an ECAM estimate** (the "Estimate — use" button) is recorded as *Entered*. Should estimated values get their own status?
7. **Evidence documents.** Which documents should back each rule (for example, desludging guidance, IWA water balance, pump testing standards)? Cards will keep showing "Supporting document not yet added." until a document is linked.

## Questions for Silvia (Bahasa Indonesia)

All new Indonesian strings need review: the `// kartu keputusan dan pemeriksaan data` block in `public/js/i18n.js` and the `trigger.text.id` strings in `engine/actions.js`. In particular:

- *Bukti pendukung* / *Dokumen pendukung belum ditambahkan.*
- *Status isian belum dikonfirmasi*, *Belum diisi (nilai bawaan)*
- *Belum dinilai — informasi kurang* versus *Diperiksa — syarat tidak terpenuhi*
- *Air tak berekening*, used for a ratio ECAM calls water losses (see question 2)

## Known limitations

- Input status covers 21 inputs across three checks. Everything else is not tracked, and the interface says so.
- Duplicating an assessment does not copy input status; the copy's inputs show as unconfirmed.
- Values set by toggling ECAM questions, or by importing over an assessment, are not recorded as entered. They show as unconfirmed.
- Input status is not part of exports, and it does not mark plans or proposals outdated, because it does not change any recommendation.
- No evidence documents are linked to actions. The knowledge base still holds only the ChatWater ECAM notes.
