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
- **The Data checks panel** keeps two things apart for each covered check:
  - **Current rule** (what the rule did):
    - *Option offered by current rule*: the rule's condition holds. This says nothing about whether the inputs are complete.
    - *Checked — condition not met*: the inputs it reads are present and the condition does not hold.
    - *Not assessed — information missing*: an input or ECAM output the condition needs is zero or missing, and at least one such zero has no recorded source or is unconfirmed.
    - *Not evaluated by the current rule*: the only zeros blocking the rule were entered manually or confirmed by the user. Each is shown as "Confirmed value: 0. The current rule does not evaluate this case." (or "Entered value: 0 …"). The app does not interpret such a zero as "not applicable" or "condition not met"; that is a question for Chimdi (question 2 below).
  - **Input completeness**: how many tracked inputs are entered manually or confirmed, each input's source and confirmation, and the *known* untracked dependencies (labelled "list may be incomplete").

  The other rules are listed as "option offered" or "no option (missing data or condition not met)", because the app cannot tell those two apart for them.
- **Input provenance** is recorded for the inputs of the covered checks. Source and confirmation are separate:
  - Source: *Entered manually* (typed or selected), *ECAM estimate* (the "Estimate — use value" button), *Typical value* (chosen from ECAM's typical-value list), *Not entered (default value)* (untouched in an assessment created here), or *Source not recorded* (imported files, the sample, duplicates, older sessions, or values changed outside the form).
  - Confirmation: *Confirmed* or *Not confirmed*. Confirming an ECAM estimate keeps it labelled as an estimate ("ECAM estimate · Confirmed").
  - Manual entries do not ask for confirmation; every other source does until confirmed.

  A record only holds while the value is unchanged. It is saved with the browser session (not in the ECAM JSON) and survives reload. Records saved by the first version of this branch are read as manual or confirmed. Provenance never changes options, figures or freshness.
- **Units on cards** use the Stage 1 conversion (`CW.unitView`, the same rule as ECAM's `Units.multiplier`), including a unit the user selected for the assessment.
- **Pump review notice.** A pump option shows "The savings calculation uses total substage energy and pumping energy. Confirm that this calculation is appropriate before using the estimate." when pumping energy is zero or differs from total substage energy. This is a review flag only; it does not change eligibility or the estimate.

## Coverage (deliberately limited)

| Check | Rules | Substages | Inputs tracked | Known untracked dependencies (not exhaustive) |
|---|---|---|---|---|
| Pump efficiency | `pump_upgrade`, `pump_audit` | abstraction, distribution, sewer collection | `*_pmp_flow`, `_head`, `_volt`, `_amps`, `_pf`, `_exff` | `*_nrg_pump`, `*_nrg_cons`, `*_conv_kwh`; also `wwc_vol_pump` for sewer collection |
| Non-revenue water | `nrw_reduction` | distribution | `wsd_vol_dist`, `wsd_auth_con` | `wsa_nrg_cons`, `wst_nrg_cons`, `wsd_nrg_cons`, `conv_kwh_co2` (benefit estimate) |
| Scheduled desludging | `septic_desludging` | onsite sanitation | `wwo_cont_emp` | `wwo_bod_cont`, `wwo_bod_rmvd`, `wwo_ch4_efac_con` |

The untracked lists come from reading the ECAM formulas and the rule code (`untracked` in `CHECKS`). They are known dependencies, not a verified complete list: for example, the desludging scenario also re-runs ECAM estimations, and the GWP report choice affects CH₄ figures.

Not covered: `cso_reduction`, `biogas_capture`, `fuel_switch`, `solar_pv`, and `pump_upgrade` in treatment and onsite substages.

## Where things are

- **Rule conditions in words:** `trigger()` on each rule in `engine/actions.js`
- **Covered checks:** `CHECKS` and `ruleChecks()` in the same file
- **Input-provenance logic:** `TRACKED_INPUTS`, `inputState()`, `setInputOrigin()`, `confirmInputValue()` and `needsConfirm()` in `public/js/cw-core.js`. Records are stored in `state.inputStatus` in the browser, never in the ECAM JSON, so ECAM files stay compatible. The Stage 1 form records the source in `bindEntry` (`public/js/ecam-form.js`).
- **Pump review flag:** `pumpReview()` in `engine/actions.js`, attached to the pump option's `trigger.review` and the pump check's `review` (display only; `trigger` is not part of the action fingerprint).
- **Cards and panel rendering:** `public/js/decision-cards.js`
- **Tests:** `test/decision-support.test.js`

## Pump flow units: resolved display bug

An earlier version of this note claimed that ECAM's flow unit and its pump-power equation disagree. **That claim was wrong.** ECAM stores flow in m³/s (its base unit); "L/s" is only the default *display* unit, with multiplier 0.001 (`vendor/ecam/backend/units.js`). `wsa_pmp_pw = flow × head × 9810 / 1000` therefore gives kW. Checked with a synthetic pump (100 L/s typed → 0.1 m³/s stored, 20 m, 400 V, 50 A, pf 0.85): an independent SI calculation, the server engine and the browser classes all give 19.62 kW and 66.63% efficiency. The sample's stored 1.27 m³/s is 1,270 L/s in Stage 1.

The actual bug was in this branch's cards: they printed the stored value next to the display unit ("1.27 L/s"). Cards now use the Stage 1 conversion and show 1,270 L/s, or the user-selected unit (regression test in `test/decision-support.test.js`). No ECAM equation, threshold, assumption or estimate changed. Vendored ECAM: commit `3b6aab18` (2023-03-07), identical to upstream master when checked; matching upstream code does not by itself establish scientific correctness.

## Questions for Chimdi (scientific and engineering)

1. **Pump savings basis (unresolved, priority).** ECAM's saving is `nrg_cons − (measured efficiency / expected efficiency) × nrg_pump`, and Stage 2 uses it unchanged. When pumping energy is 0, the whole substage energy counts as saved (sample with `wsa_nrg_pump = 0`: 2,400,000 kWh, and the option is still offered). When pumping energy is below total energy, the non-pumping part is counted as saved. Cards now show a review notice in both cases, but the eligibility and estimate are unchanged. Should Stage 2 require pumping energy above zero, use a different saving basis, or keep ECAM's formula as is?
2. **Confirmed zeros.** A confirmed or manually entered zero that blocks a rule is now shown as "Confirmed value: 0. The current rule does not evaluate this case." Should any of these mean "condition not met" (for example, zero authorized consumption) or "not applicable"? The app makes no such interpretation today.
3. **The non-revenue water rule reads `wsd_auth_con`.** That input sits behind an ECAM question that is "No" in the sample, and ECAM resets it to 0 when the question is switched off. ECAM computes `1 − auth_con/vol_dist` as *water losses* (`wsd_SL_water_loss`); non-revenue water uses billed consumption (`wsd_bill_con`). Which should the rule use, and is 15% the right trigger?
4. **Desludging with zero containment emissions** is shown as "not assessed". Should a containment type whose methane factor is zero count as "assessed, not triggered" instead?
5. **Pump checks** cover abstraction, distribution and sewer collection only (the `pump_audit` scope). Should treatment and onsite pumps be covered? (The pump review notice already applies to pump options in every substage.)
6. **Minimum data per rule.** Which inputs are *required* for each rule, and should an option be withheld, or only flagged, when they are unconfirmed? Today it is flagged only. This also decides whether the known untracked dependencies above (pumping and total energy, containment BOD and emission factor) should be tracked. Proposed requirements to discuss, none enforced:
   - desludging: a confirmed emptying rate and containment type
   - non-revenue water: a confirmed authorized or billed consumption
   - pump: confirmed duty-point measurements and pumping energy
7. **ECAM estimates and typical values** now have their own source labels and need confirmation. Is a confirmed estimate or typical value an acceptable basis for an option, or should the card say more?
8. **Evidence documents.** Which documents should back each rule (for example, desludging guidance, IWA water balance, pump testing standards)? Cards will keep showing "Supporting document not yet added." until a document is linked.

## Questions for Silvia (Bahasa Indonesia)

All new Indonesian strings need review: the `// kartu keputusan dan pemeriksaan data` block in `public/js/i18n.js` and the `trigger.text.id` strings in `engine/actions.js`. In particular:

- *Bukti pendukung* / *Dokumen pendukung belum ditambahkan.*
- Sources: *Diisi manual*, *Perkiraan ECAM*, *Nilai tipikal*, *Belum diisi (nilai bawaan)*, *Sumber tidak tercatat*; confirmation: *Dikonfirmasi* / *Belum dikonfirmasi*
- *Nilai yang dikonfirmasi: 0. Aturan saat ini tidak menilai kasus ini.* (must stay neutral: no "not applicable" or "condition not met" meaning)
- *Opsi ditawarkan oleh aturan saat ini*, *Tidak dinilai oleh aturan saat ini*, *Kelengkapan isian*
- *Ketergantungan yang diketahui tetapi tidak dilacak (daftar mungkin belum lengkap)*
- The pump notice: *Perhitungan penghematan memakai total energi subtahap dan energi pemompaan. Pastikan perhitungan ini sesuai sebelum memakai perkiraannya.*
- *Belum dinilai — informasi kurang* versus *Diperiksa — syarat tidak terpenuhi*
- *Air tak berekening*, used for a ratio ECAM calls water losses (see question 3)

## Known limitations

- Input status covers 21 inputs across three checks. Everything else is not tracked, and the interface says so.
- Duplicating an assessment does not copy input status; the copy's inputs show as unconfirmed.
- Values set by toggling ECAM questions, or by importing over an assessment, have no recorded source. They show as "Source not recorded · Not confirmed".
- Values on cards follow the assessment's unit preference. The rule-trigger values ("why it appeared") are shown in ECAM base units with their unit stated (for example m³), which can differ from a non-default Stage 1 unit.
- Input status is not part of exports, and it does not mark plans or proposals outdated, because it does not change any recommendation.
- No evidence documents are linked to actions. The knowledge base still holds only the ChatWater ECAM notes.
