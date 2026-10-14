# ECAM overview

ECAM (Energy Performance and Carbon Emissions Assessment and Monitoring tool) calculates greenhouse gas emissions — carbon dioxide (CO2), methane (CH4) and nitrous oxide (N2O) — and energy use for urban water and wastewater utilities. It is free and open source, developed by ICRA, IWA and GIZ under the WaCCliM project, and follows the IPCC 2019 Refinement to the 2006 Guidelines for National Greenhouse Gas Inventories. Online: https://climatesmartwater.org/ecam/ — source: https://github.com/icra/ecam

# Stages

ECAM splits a utility into two levels and six stages. Water supply: Abstraction (wsa), Treatment (wst), Distribution (wsd). Sanitation: Collection (wwc), Treatment (wwt), Onsite sanitation (wwo). Each stage can have several substages, for example one per pumping station or treatment plant. Results add up from substages to stages to the whole utility.

# Direct and indirect emissions

Direct emissions come from sources the utility owns or controls. Examples: CO2, CH4 and N2O from on-site engines burning fossil fuel (all stages); CH4 and N2O from sewers and biological wastewater treatment; CH4 and N2O from collected wastewater discharged without treatment; CH4 and N2O from treated effluent discharge; CH4 and N2O from sludge digestion; CH4 from faecal sludge containment such as septic tanks; CH4 and N2O from faecal sludge treatment; N2O from open defecation.

Indirect emissions come from electricity or heat the utility buys: they occur at the power plant but are caused by the utility's energy use. ECAM calculates CO2 from grid electricity for every stage as kWh consumed multiplied by the grid emission factor (kgCO2/kWh). Indirect emissions also include fuel burned in vehicles (water trucks, sludge transport) and CH4 and N2O from sludge and faecal sludge management off site.

# Global warming potential

CH4 and N2O are converted to CO2 equivalent with global warming potentials from an IPCC assessment report chosen by the user. The ECAM default is IPCC AR5 with climate-carbon feedbacks: CH4 = 34, N2O = 298 kgCO2eq per kg. Changing the report changes totals, so always report which one was used.

# Assessment period

All ECAM inputs are totals for the assessment period (usually one year). Energy in kWh, volumes in m3, masses in kg, over the whole period — not per day or per month.

# Indonesia defaults in ECAM

ECAM's country table gives Indonesia a grid emission factor of 0.677 kgCO2/kWh, protein consumption of about 22.1 kg/person/year (FAO), BOD5 of 40 g/person/day (IPCC) and currency IDR. Utilities should replace the grid factor with the latest official value for their grid system if available (for example values published by the Ministry of Energy and Mineral Resources for each PLN grid).

# Septic tanks and faecal sludge in ECAM

For onsite sanitation ECAM calculates containment methane as (BOD5 entering the containment minus BOD5 removed as emptied faecal sludge) multiplied by the CH4 emission factor of the containment type, e.g. 0.3 kgCH4/kgBOD for a septic tank. Emptying more faecal sludge (scheduled desludging, in Indonesia called LLTT – layanan lumpur tinja terjadwal) removes BOD from the tank before it degrades there. The emptied sludge then has to be treated (in Indonesia at an IPLT), which has its own emissions that should be entered in ECAM.

# Pump efficiency in ECAM

When pump data are entered (flow, head, voltage, current, power factor), ECAM calculates the electromechanical efficiency of the pump. Comparing it to the expected efficiency of a new pump gives ECAM's estimate of energy that could be saved and the GHG reduction (energy saved x grid emission factor).
