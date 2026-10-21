/*
 * What the utility is responsible for, and what that means for emissions and actions
 * (meeting feedback, Oct 2026: "largest emission source ≠ most actionable source").
 * Shared by the browser (global RS), the server and the tests.
 *
 * The utility profile answers, per service area, who runs it:
 *   operates  the utility runs it                         → directly actionable
 *   shared    run with / by local government or another
 *             provider, or needs their approval            → conditionally actionable
 *   none      not the utility's responsibility             → outside the utility's responsibility
 *   ''        not answered                                 → responsibility not specified
 *
 * ECAM outputs and Stage 2 options are mapped to a service area. Sources outside the
 * utility's responsibility stay in the inventory (totals never change); they are only
 * labelled and grouped, so they do not dominate the utility's action list.
 * Capacity answers add feasibility flags to options; they never hide or change an option.
 * Nothing here changes an ECAM figure or a Stage 2 estimate.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // Profile keys (stored in state.profile next to the existing profile fields)
  const AREAS = {
    water_supply: 'resp_water_supply',          // abstraction, treatment, distribution
    sewer_collection: 'resp_sewer',             // sewer network
    wastewater_treatment: 'resp_wwtp',          // centralised wastewater treatment
    onsite_containment: 'resp_onsite',          // household septic tanks / pits (containment itself)
    fs_services: 'resp_fs',                     // desludging (emptying, transport) and faecal sludge treatment (IPLT)
  };
  const ROLES = ['operates', 'shared', 'none'];
  const TIER_OF_ROLE = { operates: 'direct', shared: 'conditional', none: 'outside' };
  const TIERS = ['direct', 'conditional', 'outside', 'unspecified'];
  const CAPACITY = {
    capex: ['own', 'partial', 'external'],             // capital budget for new investment
    tech_capacity: ['strong', 'some', 'limited'],      // in-house engineering capacity
    data_availability: ['metered', 'partial', 'limited'], // operational data
  };
  const PROFILE_KEYS = [...Object.values(AREAS), ...Object.keys(CAPACITY)];

  const roleOf = (profile, area) => {
    const v = profile && profile[AREAS[area]];
    return ROLES.includes(v) ? v : '';
  };
  const tierOfArea = (profile, area) => (area && TIER_OF_ROLE[roleOf(profile, area)]) || 'unspecified';
  /** True once at least one service area has been answered. */
  const answered = profile => Object.keys(AREAS).some(a => roleOf(profile, a));

  /** Service area of one ECAM first-level emission output (prefix, component as in AS.COMPONENTS). */
  function areaOfComponent(prefix, component) {
    if (prefix === 'wsa' || prefix === 'wst' || prefix === 'wsd') return 'water_supply';
    if (prefix === 'wwc') return 'sewer_collection';
    if (prefix === 'wwt') return 'wastewater_treatment';
    if (prefix === 'wwo') return component === 'containment' || component === 'unt_opd' ? 'onsite_containment' : 'fs_services';
    return null;
  }
  const areaOfPrefix = prefix => (prefix === 'wwo' ? 'fs_services' : areaOfComponent(prefix, null));

  // Stage 2 rule → service area of the work itself. 'substage' = the area of the option's substage.
  const RULE_AREA = {
    pump_upgrade: 'substage', pump_audit: 'substage', fuel_switch: 'substage',
    nrw_reduction: 'water_supply', septic_desludging: 'fs_services',
    cso_reduction: 'sewer_collection', biogas_capture: 'wastewater_treatment', solar_pv: 'utility',
  };
  // Rules that usually need capital investment, and rules that need specialist engineering.
  const CAPITAL = ['pump_upgrade', 'nrw_reduction', 'septic_desludging', 'cso_reduction', 'biogas_capture', 'solar_pv'];
  const TECHNICAL = ['pump_upgrade', 'pump_audit', 'nrw_reduction', 'cso_reduction', 'biogas_capture', 'solar_pv'];

  const prefixOfKey = o => {
    if (o && o.substage && o.substage.prefix) return o.substage.prefix;
    if (o && o.location && o.location.at === 'substage') return o.location.prefix || null;
    return null;
  };
  const isUser = o => !!o && (o.origin === 'user' || o.rule === 'custom');

  /** Utility-wide work (e.g. solar on utility sites) is as actionable as the best-placed area the utility runs. */
  function utilityTier(profile) {
    const tiers = Object.keys(AREAS).map(a => tierOfArea(profile, a));
    for (const t of ['direct', 'conditional']) if (tiers.includes(t)) return t;
    return tiers.every(t => t === 'outside') ? 'outside' : 'unspecified';
  }

  /**
   * { area, tier, basis } for a Stage 2 option or a user-proposed action.
   * basis explains the mapping in one code (shown as text in the interface).
   */
  function forOption(o, profile) {
    if (!o || o.rule === 'baseline') return null;
    let area = null, basis;
    if (isUser(o)) {
      const p = prefixOfKey(o);
      if (!p) return { area: 'utility', tier: utilityTier(profile), basis: 'user_assessment' };
      area = areaOfPrefix(p); basis = 'user_location';
    } else {
      const r = RULE_AREA[o.rule];
      if (r === 'utility') return { area: 'utility', tier: utilityTier(profile), basis: 'utility_wide' };
      area = r === 'substage' ? areaOfPrefix(prefixOfKey(o)) : r || null;
      basis = r === 'substage' ? 'substage' : o.rule === 'septic_desludging' ? 'desludging_service' : 'rule';
    }
    return { area, tier: tierOfArea(profile, area), basis };
  }

  /** Feasibility flags from the capacity answers. They inform, they never remove an option. */
  function flags(o, profile) {
    if (!o || o.rule === 'baseline' || !profile) return [];
    const f = [];
    const user = isUser(o);
    if (profile.capex === 'external' && (user || CAPITAL.includes(o.rule))) f.push('needs_external_finance');
    if (profile.capex === 'partial' && (user || CAPITAL.includes(o.rule))) f.push('needs_cofinance');
    if (profile.tech_capacity === 'limited' && (user || TECHNICAL.includes(o.rule))) f.push('needs_technical_support');
    if (profile.data_availability === 'limited' && !user) f.push('data_mostly_estimated');
    return f;
  }

  /**
   * Split ECAM emission rows by responsibility tier.
   * rows: [{ prefix, sid, name, component, kg }] as built for AS.largestContributor.
   * Returns { total, byTier: { direct, conditional, outside, unspecified }, top: { overall, actionable } }.
   * The total is the plain sum of the rows (ECAM's TotalGHG when its breakdown is complete).
   */
  function breakdown(rows, profile) {
    const byTier = { direct: 0, conditional: 0, outside: 0, unspecified: 0 };
    let total = 0, overall = null, actionable = null;
    for (const r of rows || []) {
      if (r.kg == null || !Number.isFinite(r.kg)) continue;
      const area = areaOfComponent(r.prefix, r.component);
      const tier = tierOfArea(profile, area);
      byTier[tier] += r.kg; total += r.kg;
      const row = { ...r, area, tier };
      if (r.kg > 0 && (!overall || r.kg > overall.kg)) overall = row;
      if (r.kg > 0 && (tier === 'direct' || tier === 'conditional') && (!actionable || r.kg > actionable.kg)) actionable = row;
    }
    return { total, byTier, top: { overall, actionable } };
  }

  /** Display group of an option: tier, with options the user rejected kept apart. */
  const groupOf = (o, profile, rejected) => (rejected && rejected[o.key] ? 'rejected' : (forOption(o, profile) || {}).tier || 'unspecified');
  const GROUP_ORDER = ['direct', 'conditional', 'unspecified', 'outside', 'rejected'];

  /** Profile defaults suggested from the service type, used only to pre-fill the form. */
  function suggestedRoles(serviceType) {
    if (serviceType === 'water') return { resp_water_supply: 'operates' };
    if (serviceType === 'ww') return { resp_sewer: 'operates', resp_wwtp: 'operates' };
    if (serviceType === 'both') return { resp_water_supply: 'operates', resp_sewer: 'operates', resp_wwtp: 'operates' };
    return {};
  }

  return {
    AREAS, ROLES, TIERS, TIER_OF_ROLE, CAPACITY, PROFILE_KEYS, RULE_AREA, GROUP_ORDER,
    roleOf, tierOfArea, answered, areaOfComponent, areaOfPrefix, forOption, flags, breakdown, groupOf, utilityTier, suggestedRoles,
  };
});
