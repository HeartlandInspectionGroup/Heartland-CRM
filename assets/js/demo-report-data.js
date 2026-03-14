/**
 * ============================================
 * DEMO INSPECTION REPORT DATA
 * ============================================
 * Static sample report for the interactive demo on sample-report.html.
 * Uses `var` for global access (matches HEARTLAND_CONFIG pattern).
 */

var DEMO_REPORT = {

  property: {
    address: "847 Maple Ridge Drive",
    city: "Roscoe",
    state: "IL",
    zip: "61073",
    yearBuilt: 1978,
    sqft: 2100,
    bedrooms: 3,
    bathrooms: 2,
    type: "Single Family"
  },

  inspection: {
    date: "March 14, 2026",
    inspector: "Jake Schminkey",
    company: "Heartland Inspection Group"
  },

  findings: [
    {
      id: "F001",
      category: "electrical",
      severity: "major",
      title: "Double-tapped circuit breaker",
      description: "Two conductors were connected to a single-pole breaker in the main electrical panel that is rated for one conductor only. Double-tapped breakers can cause loose connections, arcing, and overheating — a potential fire hazard.",
      location: "Main electrical panel, basement",
      recommendation: "A licensed electrician should install a tandem breaker or add a new breaker to separate the circuits. Estimated repair: $150–$300.",
      photoCaption: "Two wires connected to a single 20-amp breaker — only one is permitted by the manufacturer."
    },
    {
      id: "F002",
      category: "roofing",
      severity: "major",
      title: "Missing shingles on rear slope",
      description: "Approximately 8–10 asphalt shingles are missing from the rear roof slope, exposing the underlayment to weather. This area showed signs of prior wind damage. Continued exposure will accelerate deterioration of the roof deck.",
      location: "Rear roof slope, south-facing",
      recommendation: "A qualified roofing contractor should replace the missing shingles and inspect the surrounding area for additional wind damage. If the roof is nearing end of life (25+ years), a full replacement may be more cost-effective.",
      photoCaption: "Bare underlayment visible where shingles have blown off the rear slope."
    },
    {
      id: "F003",
      category: "structural",
      severity: "major",
      title: "Horizontal crack in foundation wall",
      description: "A horizontal crack approximately 12 feet long was observed along the east basement wall, roughly 4 feet above the floor. The wall is bowing inward approximately 1/2 inch at center. Horizontal cracks indicate lateral soil pressure and are a structural concern.",
      location: "East basement wall",
      recommendation: "Recommend evaluation by a licensed structural engineer. Repair options may include carbon fiber reinforcement straps, steel I-beams, or wall anchors depending on severity. Do not delay — progressive bowing can lead to wall failure.",
      photoCaption: "Horizontal crack running along the mortar joint with visible inward deflection at center."
    },
    {
      id: "F004",
      category: "plumbing",
      severity: "major",
      title: "Water heater past service life — active corrosion",
      description: "The gas water heater is a 40-gallon unit manufactured in 2008, making it approximately 18 years old. Typical service life is 8–12 years. Active rust and corrosion were observed at the base of the tank and around the drain valve. No leaks at time of inspection, but failure is imminent.",
      location: "Utility room, basement",
      recommendation: "Budget for water heater replacement in the near term. A licensed plumber should install a new unit. Consider upgrading to a high-efficiency or tankless model. Estimated cost: $1,200–$2,500 installed.",
      photoCaption: "Heavy rust deposits and corrosion at the base of the water heater tank."
    },
    {
      id: "F005",
      category: "electrical",
      severity: "minor",
      title: "Ungrounded three-prong outlets in bedrooms",
      description: "Multiple three-prong outlets in the second-floor bedrooms tested as ungrounded using a circuit analyzer. The home's original wiring is two-wire (no ground conductor), but three-prong receptacles have been installed without a ground path. This creates a false sense of protection.",
      location: "Second floor bedrooms (3 outlets tested)",
      recommendation: "Options include rewiring circuits with grounded cable, installing GFCI-protected receptacles (labeled 'No Equipment Ground'), or reverting to two-prong outlets. Consult a licensed electrician for the best approach.",
      photoCaption: "Three-prong outlet testing as open ground on circuit analyzer."
    },
    {
      id: "F006",
      category: "plumbing",
      severity: "minor",
      title: "Slow drain in master bathroom sink",
      description: "The master bathroom lavatory sink drained noticeably slowly during testing — approximately 45 seconds to clear a basin of water. This suggests a partial clog or buildup in the drain line or P-trap.",
      location: "Master bathroom, second floor",
      recommendation: "Clean the pop-up stopper assembly and P-trap. If the issue persists, a plumber can snake the drain line. Typically a low-cost repair.",
      photoCaption: "Standing water slow to drain from the master bathroom lavatory."
    },
    {
      id: "F007",
      category: "hvac",
      severity: "minor",
      title: "Furnace filter heavily soiled",
      description: "The furnace air filter was extremely dirty and clogged with dust and debris. A restricted filter reduces airflow, forces the blower to work harder, increases energy costs, and can shorten the life of the heat exchanger.",
      location: "Furnace unit, basement utility room",
      recommendation: "Replace the filter immediately and establish a regular replacement schedule — every 1–3 months depending on filter type and household conditions (pets, allergies).",
      photoCaption: "Furnace filter caked with dust and debris — significantly restricting airflow."
    },
    {
      id: "F008",
      category: "exterior",
      severity: "minor",
      title: "Deteriorated caulking around window frames",
      description: "Exterior caulking around multiple window frames has cracked, separated, or is missing entirely. Failed caulk allows moisture intrusion behind the siding, which can lead to wood rot, insect entry, and energy loss.",
      location: "Multiple windows, all elevations",
      recommendation: "Remove old caulking and re-seal all window frames with quality exterior-grade silicone or polyurethane caulk. This is routine maintenance that should be repeated every 5–7 years.",
      photoCaption: "Cracked and peeling caulk around a first-floor window frame."
    },
    {
      id: "F009",
      category: "roofing",
      severity: "minor",
      title: "Gutter downspout discharging at foundation",
      description: "The front-right gutter downspout terminates at the base of the foundation wall without an extension or splash block. Concentrated water discharge at the foundation promotes soil erosion, increases hydrostatic pressure, and raises the risk of basement water intrusion.",
      location: "Front-right corner of home",
      recommendation: "Install downspout extensions to direct water at least 4–6 feet away from the foundation. Underground drain tile or pop-up emitters are ideal long-term solutions.",
      photoCaption: "Downspout discharging directly at the foundation with visible soil erosion."
    },
    {
      id: "F010",
      category: "interior",
      severity: "minor",
      title: "Sticking doors on second floor",
      description: "Two interior doors on the second floor — the master bedroom and hallway bathroom — stick or bind when opening and closing. This can indicate seasonal wood expansion, settlement, or framing movement.",
      location: "Second floor — master bedroom and hallway bathroom doors",
      recommendation: "Plane or sand the door edges for clearance. If sticking recurs seasonally, monitor for settlement. Persistent sticking across multiple doors could warrant further evaluation.",
      photoCaption: "Master bedroom door showing scuff marks along the top edge from binding against the frame."
    },
    {
      id: "F011",
      category: "plumbing",
      severity: "minor",
      title: "Galvanized steel drain lines under kitchen",
      description: "The visible drain lines beneath the kitchen sink are original galvanized steel. Galvanized pipes corrode from the inside out over time, reducing flow and eventually developing leaks. Given the age of the home (1978), these pipes are approaching or past expected service life.",
      location: "Under kitchen sink, visible from cabinet",
      recommendation: "Plan for replacement with PVC or ABS drain lines. This is not an emergency but should be budgeted as a future improvement, especially if slow drains develop.",
      photoCaption: "Corroded galvanized drain pipe visible beneath the kitchen sink."
    },
    {
      id: "F012",
      category: "exterior",
      severity: "minor",
      title: "Cracked mortar joints on front brick veneer",
      description: "Several mortar joints in the front brick veneer are cracked or deteriorated, particularly around the garage entry and below the front windows. Deteriorated mortar allows moisture penetration and can accelerate freeze-thaw damage in northern Illinois winters.",
      location: "Front elevation brick veneer",
      recommendation: "Tuckpointing (removing damaged mortar and replacing with fresh mortar) is needed in the affected areas. A qualified mason can typically complete this in a day for a section this size.",
      photoCaption: "Deteriorated mortar joints in the brick veneer near the front entry."
    },
    {
      id: "F013",
      category: "hvac",
      severity: "minor",
      title: "AC condenser unit — damaged fins",
      description: "Approximately 15–20% of the aluminum fins on the exterior AC condenser unit are bent or crushed, likely from impact or debris. Damaged fins restrict airflow through the coil, reducing cooling efficiency and increasing operating costs.",
      location: "Exterior AC condenser, east side of home",
      recommendation: "Use a fin comb to straighten the bent fins. If damage is extensive, an HVAC technician can assess whether coil replacement is warranted. Protect the unit with a seasonal cover when not in use.",
      photoCaption: "Bent aluminum fins on the AC condenser coil restricting airflow."
    },
    {
      id: "F014",
      category: "electrical",
      severity: "info",
      title: "Aluminum branch wiring present",
      description: "The home contains aluminum branch circuit wiring, common in homes built during the mid-1960s through late 1970s. Aluminum wiring is not inherently dangerous but requires proper connections. Loose connections at outlets and switches can overheat due to aluminum's higher thermal expansion rate.",
      location: "Throughout home — visible at main panel and select outlet boxes",
      recommendation: "No immediate action required if connections are secure. Recommend periodic inspection by a licensed electrician. If any outlets feel warm to the touch or show signs of discoloration, have them evaluated promptly. COPALUM or AlumiConn connectors are the preferred remediation methods.",
      photoCaption: "Aluminum wiring visible at a junction point in the attic."
    },
    {
      id: "F015",
      category: "interior",
      severity: "info",
      title: "Minor ceiling stain in second floor hallway",
      description: "A faint yellowish-brown stain approximately 10 inches in diameter was observed on the hallway ceiling near the attic access hatch. The stain was dry and did not show signs of active moisture. It may be from a prior roof leak, condensation event, or plumbing issue that has since been resolved.",
      location: "Second floor hallway ceiling, near attic access",
      recommendation: "Monitor the stain for changes in size or color, especially after heavy rain. If the stain grows or feels damp, investigate the attic above for active leaks. As-is, this appears to be a historical stain with no current moisture issue.",
      photoCaption: "Faint brownish stain on the hallway ceiling near the attic access hatch."
    },
    {
      id: "F016",
      category: "hvac",
      severity: "info",
      title: "HVAC system approaching end of service life",
      description: "The forced-air gas furnace (manufactured 2009) and central AC condenser (manufactured 2010) are approximately 16–17 years old. Typical service life for these systems is 15–20 years. Both units were functional at time of inspection but are in the late stage of their expected lifespan.",
      location: "Furnace: basement utility room. AC condenser: east exterior",
      recommendation: "No immediate action needed. Budget for replacement in the coming years. When replacing, consider upgrading to a high-efficiency system for energy savings. Annual maintenance and tune-ups will help extend remaining life.",
      photoCaption: "Data plate on the furnace showing a 2009 manufacture date."
    },
    {
      id: "F017",
      category: "exterior",
      severity: "info",
      title: "Mature tree limbs overhanging roof",
      description: "Large limbs from a mature oak tree extend over the rear roof section. Overhanging branches drop leaves and debris that clog gutters, retain moisture on the roof surface, and pose a risk of physical damage during storms.",
      location: "Rear yard — oak tree overhanging rear roof slope",
      recommendation: "Have an arborist trim branches back at least 6–10 feet from the roof surface. Regular trimming reduces gutter maintenance, protects shingles, and minimizes storm damage risk.",
      photoCaption: "Tree limbs extending over the rear roof slope from a mature oak."
    },
    {
      id: "F018",
      category: "interior",
      severity: "info",
      title: "Single-pane windows throughout",
      description: "The home retains original single-pane wood-framed windows throughout. Single-pane windows offer minimal insulation, allow significant heat transfer, and can contribute to condensation and higher energy bills — especially relevant in northern Illinois winters.",
      location: "All windows throughout the home",
      recommendation: "Window replacement with double-pane or triple-pane insulated units will improve energy efficiency, comfort, and noise reduction. Storm windows are a lower-cost interim option. This is an improvement item, not a defect.",
      photoCaption: "Original single-pane wood-framed window on the first floor."
    },
    {
      id: "F019",
      category: "plumbing",
      severity: "info",
      title: "Main water shutoff valve is gate-type",
      description: "The main water shutoff valve is a gate-type valve, which is common in homes of this era. Gate valves can seize or fail to fully shut off after years of non-use. If this valve fails when you need it, water damage can result.",
      location: "Basement, near the water meter",
      recommendation: "Test the valve periodically to ensure it still operates. Consider proactive replacement with a quarter-turn ball valve, which is more reliable and easier to operate in an emergency.",
      photoCaption: "Gate-type main water shutoff valve near the water meter in the basement."
    },
    {
      id: "F020",
      category: "structural",
      severity: "info",
      title: "Minor efflorescence on basement walls",
      description: "White crystalline mineral deposits (efflorescence) were observed on several areas of the basement block walls. Efflorescence forms when moisture migrates through masonry and deposits dissolved salts on the surface. It is cosmetic but indicates moisture movement through the walls.",
      location: "Basement — east and north walls",
      recommendation: "Clean deposits with a stiff brush or mild muriatic acid solution. Address exterior drainage (grading, gutters, downspout extensions) to reduce moisture migrating through the walls. Efflorescence alone is not structural damage but should be monitored.",
      photoCaption: "White efflorescence deposits visible on the basement block wall."
    }
  ]

};
