/*
 * Supporting documents for Stage 2 action options: one or two open-source references per rule, each opened at a
 * relevant page. Chosen with the library search (scripts/library/build-open.js output) and checked by reading the
 * page; they are reading material, not proof that an action fits this utility. Shared by the browser (global SD) and tests.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SD = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const DOCS = {
    'ecam-methodology-guide': 'ECAM Methodology Guide (WaCCliM)',
    'wb-2021-indonesia-utility-resilience': 'World Bank (2021): Strengthening the Resilience of Indonesian Water Utilities',
    'id-climate-finance-sectoral-guidelines-en': 'Indonesia Climate Finance Sectoral Guidelines',
    'id-gcf-country-programme-v2': 'Indonesia GCF Country Programme',
    'gcf-sanitation-part3-2024-consultation': 'GCF Water Project Design Guidelines, Part 3: Sanitation (2024)',
    'ipcc-2019-wastewater-ch6': 'IPCC 2019 Refinement, Chapter 6: Wastewater Treatment and Discharge',
    'wb-2020-waste-to-resource-lac': 'World Bank (2020): From Waste to Resource',
  };
  const BY_RULE = {
    pump_upgrade: [['ecam-methodology-guide', 145], ['wb-2021-indonesia-utility-resilience', 32]],
    pump_audit: [['ecam-methodology-guide', 55], ['ecam-methodology-guide', 145]],
    nrw_reduction: [['wb-2021-indonesia-utility-resilience', 32], ['ecam-methodology-guide', 149]],
    solar_pv: [['id-climate-finance-sectoral-guidelines-en', 34], ['id-gcf-country-programme-v2', 18]],
    fuel_switch: [['id-climate-finance-sectoral-guidelines-en', 34], ['ecam-methodology-guide', 21]],
    septic_desludging: [['gcf-sanitation-part3-2024-consultation', 55], ['ipcc-2019-wastewater-ch6', 11]],
    cso_reduction: [['gcf-sanitation-part3-2024-consultation', 58], ['wb-2020-waste-to-resource-lac', 21]],
    biogas_capture: [['ecam-methodology-guide', 160], ['wb-2020-waste-to-resource-lac', 44]],
  };
  /** [{ id, title, page, url }] for an option's rule; empty for the baseline and user-proposed actions. */
  function forRule(rule) {
    return (BY_RULE[rule] || []).map(([id, page]) => ({ id, title: DOCS[id], page, url: `/sources/${id}.pdf#page=${page}` }));
  }
  return { DOCS, BY_RULE, forRule };
});
