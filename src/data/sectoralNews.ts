// AUTO-DERIVED from the investor portfolio pack — do not hand-edit the items below.
// Source: templates/niva-bupa-portfolio-review.xlsx › sheet "Key sectoral updates".
// A curated, source-linked briefing of 31 sector updates (Dec 2023 → Aug 2025); each item
// links its original article. This is a sourced, point-in-time pack — NOT a live feed.

export type SectoralCategory =
  | 'Competition / Peers'
  | 'Regulatory'
  | 'General'
  | 'GST'
  | 'Profitability'

export interface SectoralNewsItem {
  /** Serial number as it appears in the source sheet. */
  sn: number
  category: SectoralCategory
  /** ISO date (yyyy-mm-dd) the update is dated to in the source. */
  date: string
  /** Headline. */
  subject: string
  /** Plain-English summary (verbatim from source; two obvious typos lightly fixed). */
  summary: string
  /** Link to the original article. */
  reference: string
}

export interface SectoralCategoryMeta {
  label: SectoralCategory
  /** Short chip label. */
  short: string
  /** Tone-coded accent (navy = rules, lavender = rivals, teal = margins …). */
  color: string
  /** Soft background tint for chips/cards. */
  soft: string
  /** One-line, plain-English meaning of the theme. */
  blurb: string
}

// Colour-psychology coding so the eye can sort the feed before reading a word:
//   Regulatory          → navy      (authority / the rulebook)
//   Competition / Peers → lavender  (rivals & market players)
//   General             → slate     (neutral market backdrop)
//   GST                 → champagne (tax / policy)
//   Profitability       → teal      (margins / money)
export const SECTORAL_CATEGORY_META: Record<SectoralCategory, SectoralCategoryMeta> = {
  'Competition / Peers': { label: 'Competition / Peers', short: 'Competition', color: '#6E7BD6', soft: '#ECEEFB', blurb: 'New entrants, JVs and leadership moves among rivals' },
  Regulatory: { label: 'Regulatory', short: 'Regulatory', color: '#27457E', soft: '#E7ECF6', blurb: 'Rule changes from IRDAI and the government' },
  General: { label: 'General', short: 'General', color: '#8C97A8', soft: '#EEF1F5', blurb: 'Market trends shaping demand and claims' },
  GST: { label: 'GST', short: 'GST', color: '#B68B3A', soft: '#F4ECDB', blurb: 'Tax on insurance premiums' },
  Profitability: { label: 'Profitability', short: 'Profitability', color: '#168E8E', soft: '#E1F2F1', blurb: 'Costs and margins — what hits the bottom line' },
}

/** Display order for legends / filters — most-active theme first. */
export const SECTORAL_CATEGORY_ORDER: SectoralCategory[] = [
  'Competition / Peers',
  'Regulatory',
  'General',
  'GST',
  'Profitability',
]

export const sectoralNewsMeta = {
  source_name: 'Niva Bupa portfolio review · "Key sectoral updates"',
  source_file: 'templates/niva-bupa-portfolio-review.xlsx',
  span_start: "2023-12-16",
  span_end: "2025-08-01",
  count: 31,
}

export const sectoralNews: SectoralNewsItem[] = [
  {
    sn: 1,
    category: "GST",
    date: "2025-08-01",
    subject: "GST rationalisation proposed",
    summary: "GST exemption / reduction in GST rate to 5% from the current 18% for insurance is being contemplated; GST council meeting is scheduled on 3/4th Sept in New Delhi to consider this",
    reference: "https://www.moneycontrol.com/news/opinion/full-gst-exemption-on-life-and-health-insurance-policies-will-be-a-mixed-blessing-13495606.html",
  },
  {
    sn: 2,
    category: "General",
    date: "2025-06-09",
    subject: "Bupa weighs foray into private hospitals market in India",
    summary: "Recognising India's under-penetrated insurance market and significant growth potential, Bupa intends to replicate its 'Payvider' model in India, integrating insurance with healthcare provision, though no commitments on the dates yet, feels it is too soon to talk about this right now.",
    reference: "https://timesofindia.indiatimes.com/business/india-business/bupa-weighs-foray-into-private-hospitals-market-in-india/articleshow/121713883.cms",
  },
  {
    sn: 3,
    category: "Competition / Peers",
    date: "2025-05-21",
    subject: "Star Health to focus on retail in bid to grow premiums",
    summary: "Star Health Insurance aims for substantial premium growth, targeting ₹30,000 crore in three years while improving profitability by lowering the combined ratio to 97%. The company is prioritizing its retail business and limiting group insurance exposure, focusing on SMEs. To manage medical inflation, Star Health is negotiating with hospitals and implementing premium adjustments, rewarding healthy policyholders with discounts.",
    reference: "https://economictimes.indiatimes.com/industry/banking/finance/insure/star-health-to-focus-on-retail-in-bid-to-grow-premiums/articleshow/121299740.cms",
  },
  {
    sn: 4,
    category: "Competition / Peers",
    date: "2025-05-13",
    subject: "Star Health Announces New Board Appointments",
    summary: "Star announced key appointments and leadership updates - 1. Mr. Amitabh Jain, Chief Operating Officer has now been elevated as Whole-time Director and designated as a KMP, 2. Mr. Himanshu Walia, Chief Marketing Officer has also now been elevated as Whole-time Director and designated as a Key Managerial Personnel.",
    reference: "https://www.business-standard.com/content/press-releases-ani/star-health-announces-new-board-appointments-125051300623_1.html",
  },
  {
    sn: 5,
    category: "Competition / Peers",
    date: "2025-05-05",
    subject: "Star Health appoints Rajeev Kher as Chairperson of the Board",
    summary: "Rajeev Kher - A former Commerce Secretary to the Govt of India and a senior officer of the IAS",
    reference: "https://www.exchange4media.com/people-movement-news/star-health-appoints-rajeev-kher-as-chairperson-of-the-board-143156.html",
  },
  {
    sn: 6,
    category: "General",
    date: "2025-02-21",
    subject: "Insurers look to hike health premiums as pollution stings",
    summary: "Insurers are considering making New Delhi residents pay 10% to 15% more for new health policies after an extraordinary spike in claims related to air pollution in 2024 in India's capital, according to nine insurance executives, including Amitabh Jain (COO, Star Health).",
    reference: "https://www.reuters.com/world/india/india-insurers-look-hike-health-premiums-pollution-stings-2025-02-21/",
  },
  {
    sn: 7,
    category: "Regulatory",
    date: "2024-12-01",
    subject: "Insurance Amendment Bill likely in monsoon session",
    summary: "Drafted late 2024; expected introduction next Monsoon Session (July 2025)\n\n1. 100% FDI permitted (up from 74%), under automatic route—conditional on full reinvestment of premiums in India\n2. Composite licenses enable insurers to offer life, health, general, and reinsurance under one entity\n3. Differential capital norms: IRDAI may set lower capital thresholds\n4. Reduced paid-up/net-owned fund requirements\n5. Insurance agents can now represent multiple insurers across categories—breaking the single-insurer exclusivity\n6. Permanent intermediary registrations, executive power enhancements, and larger share transfer limits (1→5%)\n7. Expanded permissible activities for insurers: property management, employee trusts, indemnity guarantees, and mergers with non-insurers",
    reference: "https://www.moneycontrol.com/banking/insurance-amendment-bill-likely-in-monsoon-session-composite-licenses-and-nod-for-100-fdi-on-cards-article-13035037.html",
  },
  {
    sn: 8,
    category: "General",
    date: "2024-11-28",
    subject: "IRDAI approved Bima Sugam (electronic insurance marketplace)",
    summary: "This platform will help the customers in identifying the best possible insurance policy by comparing it with other insurance companies. The platform will act as a one stop solution for all entities in the insurance value chain, including customers, insurers, intermediaries and agents.",
    reference: "https://www.business-standard.com/finance/insurance/bima-sugam-is-a-game-changer-says-irdai-chairman-debasish-panda-124112601236_1.html",
  },
  {
    sn: 9,
    category: "Regulatory",
    date: "2024-11-27",
    subject: "Proposed insurance amendment may open doors to 100% FDI, waives min capital requirement and hints on composite implementation",
    summary: "Proposed clauses\n1. The bill proposes 100% foreign investment in the insurance sector (from current 74%)\n2. Waiver of 100cr paid up capital for starting insurance business requirements for insurance companies\n3. Composite license implementation",
    reference: "https://economictimes.indiatimes.com/?back=1",
  },
  {
    sn: 10,
    category: "Regulatory",
    date: "2024-11-25",
    subject: "GoM report on GST on health insurance to be placed before Council when received: Finance Ministry (Discussion on GST rate cut)",
    summary: "Recommendations of the Group of Ministers (GoM), which is examining issues related to GST on life and health insurance, will be presented to the GST Council once received. The matter of exempting or reducing GST on life and health insurance was discussed at the GST Council's 54th meeting on September 9, 2024",
    reference: "https://economictimes.indiatimes.com/industry/banking/finance/insure/gom-report-on-gst-on-health-insurance-to-be-placed-before-council-when-received-finance-ministry/articleshow/115657199.cms",
  },
  {
    sn: 11,
    category: "Competition / Peers",
    date: "2024-11-22",
    subject: "Central Bank of India gets RBI nod to enter insurance biz through JV with Generali group (buying stake of Future Group)",
    summary: "Central Bank of India received approval from the Reserve Bank of India to enter the insurance business. The bank will form a joint venture with Generali Group under FGIICL and FGILICL, offering a range of insurance products. This follows approvals from the Competition Commission of India and IRDAI",
    reference: "https://economictimes.indiatimes.com/industry/banking/finance/insure/central-bank-of-india-gets-rbi-nod-to-enter-insurance-biz-through-jv-with-generali-group/articleshow/115566258.cms",
  },
  {
    sn: 12,
    category: "Competition / Peers",
    date: "2024-11-17",
    subject: "WestBridge to float a general insurance JV with Neelesh Garg",
    summary: "WestBridge Capital and Tata AIG's outgoing CEO, Neelesh Garg, are teaming up to launch a new AI-driven general insurance venture. The venture will focus on health and motor insurance; WestBridge will hold a majority stake, with Garg owning 10%; The new entity is expected to launch by mid-2025, pending regulatory approvals",
    reference: "https://economictimes.indiatimes.com/industry/banking/finance/insure/westbridge-to-float-a-general-insurance-jv-with-neelesh-garg/articleshow/115378875.cms?utm_source=contentofinterest&utm_medium=text&utm_campaign=cppst",
  },
  {
    sn: 13,
    category: "Competition / Peers",
    date: "2024-10-23",
    subject: "Jio Financial in talks with Allianz for insurance JVs in India post plans to exit Bajaj",
    summary: "Jio Financial Services Ltd is in early talks with Allianz SE to form insurance companies in India. Allianz seeks to exit existing ventures with Bajaj Finserv due to a directional dispute, but remains committed to the Indian market",
    reference: "https://economictimes.indiatimes.com/industry/banking/finance/insure/mukesh-ambanis-jio-fin-in-talks-with-allianz-for-insurance-jvs-in-india-post-plans-to-exit-bajaj/articleshow/114489668.cms",
  },
  {
    sn: 14,
    category: "Competition / Peers",
    date: "2024-10-23",
    subject: "There's scope for more insurance companies in India, says IRDAI chairperson",
    summary: "Speaking at an industry event organised by the CII, IRDAI chairperson Debasish Panda said the 1.4 billion population base offers massive growth opportunities. \"There is scope for more than 70 insurance companies to cater to 1.4 billion people. I encourage more conglomerates to enter the insurance sector. It is an exciting time for the industry,\" said Panda",
    reference: "https://economictimes.indiatimes.com/industry/banking/finance/insure/theres-scope-for-more-insurance-companies-in-india-says-irdai-chairperson/articleshow/114477566.cms?utm_source=contentofinterest&utm_medium=text&utm_campaign=cppst",
  },
  {
    sn: 15,
    category: "Profitability",
    date: "2024-10-13",
    subject: "Patients, insurers feel the pain as hospitals take to 'surge pricing'",
    summary: "Hospitals in India introduce additional charges, such as disinfection fees and peak operation theatre charges, leading to a 20% rise in medical costs. Insurers struggle as previously bundled services are unbundled, causing unpredictability in healthcare expenses and potential increases in insurance premiums",
    reference: "https://economictimes.indiatimes.com/industry/banking/finance/insure/patients-insurers-feel-the-pain-as-hospitals-take-to-surge-pricing/articleshow/114195592.cms",
  },
  {
    sn: 16,
    category: "Regulatory",
    date: "2024-10-11",
    subject: "IRDAI to increase scrutiny of cyber security breaches after Star Health episode",
    summary: "IRDAI is intensifying scrutiny of cybersecurity lapses in the insurance sector following a major data breach at Star Health Insurance. Over 31 million customers' data was compromised. The regulator has mandated an extensive audit of Star Health's cybersecurity framework. The audit aims to identify control gaps and recommend measures to prevent future breaches",
    reference: "https://economictimes.indiatimes.com/industry/banking/finance/insure/irdai-to-increase-scrutiny-of-cyber-security-breaches-after-star-health-episode/articleshow/114129398.cms",
  },
  {
    sn: 17,
    category: "Regulatory",
    date: "2024-09-06",
    subject: "IRDAI prohibits insurers from collecting premium before policy approval",
    summary: "IRDAI has introduced new rules for life and health insurance premiums. Insurers can no longer collect initial premiums with the proposal form unless the policy is issued immediately. This change aims to prevent idle customer money and ensure transparency in the insurance process",
    reference: "https://economictimes.indiatimes.com/industry/banking/finance/insure/irdai-prohibits-insurers-from-collecting-premium-before-policy-approval/articleshow/113104639.cms?from=mdr",
  },
  {
    sn: 18,
    category: "Competition / Peers",
    date: "2024-08-22",
    subject: "ICICI Lombard focuses on retail with innovative health products",
    summary: "ICICI Lombard General Insurance is aiming to expand its retail health insurance share through product innovation. The Elevate Health policy, featuring industry-first options and AI-driven advice, is expected to drive sales. The company sees rising awareness and increased policy coverage as key factors for growth, projecting significant market expansion by FY31",
    reference: "https://economictimes.indiatimes.com/industry/banking/finance/insure/icici-lombard-focuses-on-retail-with-innovative-health-products/articleshow/112717989.cms",
  },
  {
    sn: 19,
    category: "Regulatory",
    date: "2024-08-14",
    subject: "Ind AS notified for insurance companies",
    summary: "The Ministry of Corporate Affairs has introduced new accounting standards for insurance contracts, harmonizing them with global norms. These standards, effective April 1, 2024, are expected to enhance transparency and attract foreign investments in the insurance sector by allowing better risk assessment and comparison with global peers.\nThe Accounting Standard (Ind AS 117) would be applicable from April 1, 2024, the ministry said in a notification.\nIRDAI has not yet notified the applicability of IND AS on Insurance companies; expected from FY26",
    reference: "https://economictimes.indiatimes.com/industry/banking/finance/insure/new-accounting-standards-for-insurance-notified-raise-investment-chances/articleshow/112532282.cms",
  },
  {
    sn: 20,
    category: "General",
    date: "2024-08-10",
    subject: "Seasonal infections take a toll on health insurance claims",
    summary: "According to a study by Policybazaar, nearly one-third of health insurance claims were due to seasonal diseases such as dengue, malaria, and gastroenteritis. These diseases led to high treatment costs during monsoon and peak winters. Despite being avoidable through improved hygiene, these illnesses significantly affected healthcare expenses across all social segments.",
    reference: "https://economictimes.indiatimes.com/industry/banking/finance/insure/seasonal-infections-take-a-toll-on-health-insurance-claims/articleshow/112423622.cms",
  },
  {
    sn: 21,
    category: "Regulatory",
    date: "2024-08-05",
    subject: "Waiting period for pre-existing diseases cut to 3 years from 4 years",
    summary: "Irdai's guidelines, effective from April 2024, mandate that insurers cannot reject any claim based on the pre-existence of an ailment three years after policy issuance. This regulatory change aims to make health insurance more accessible for policyholders with pre-existing conditions.",
    reference: "https://economictimes.indiatimes.com/industry/banking/finance/insure/waiting-period-for-pre-existing-diseases-cut-health-insurance-premiums-to-rise/articleshow/112281949.cms",
  },
  {
    sn: 22,
    category: "Competition / Peers",
    date: "2024-07-09",
    subject: "Narayana Hrudayalaya's 'Aditi' - the latest experiment in Indian healthcare",
    summary: "Bengaluru-based hospital chain Narayana Hrudayalaya (NHL) has introduced the Aditi insurance scheme, offering a Rs 1 crore cover for surgeries and Rs 5 lakh for medical treatments at NHL hospitals for an annual premium of Rs 10,000 for a family of four. The managed care model aims to provide affordable healthcare with controlled costs",
    reference: "https://economictimes.indiatimes.com/industry/banking/finance/insure/narayana-hrudayalayas-aditi-the-latest-experiment-in-indian-healthcare/articleshow/111596836.cms?utm_source=contentofinterest&utm_medium=text&utm_campaign=cppst",
  },
  {
    sn: 23,
    category: "Competition / Peers",
    date: "2024-07-03",
    subject: "Star Health launches home healthcare initiative; to cover 50 cities & towns in phase one",
    summary: "Star Health's groundbreaking Home Health Care Service, led by Anand Roy, in partnership with Care24, Portea, and CallHealth, expands to 50 cities, ensuring affordable and prompt medical assistance",
    reference: "https://economictimes.indiatimes.com/industry/banking/finance/insure/star-health-launches-home-healthcare-initiative-to-cover-50-cities-towns-in-phase-one/articleshow/111464574.cms",
  },
  {
    sn: 24,
    category: "Competition / Peers",
    date: "2024-06-18",
    subject: "Star Health looking to grow 18%, improve claims ratio by 50 bps: Anand Roy, CEO",
    summary: "Star Health & Allied Insurance expects 18-20% growth in gross written premiums this year, aiming to double premium income in four years. CEO Anand Roy discussed the company's strategies with Shilpy Sinha.\nOur target is to increase gross written premium (GWP) to ₹30,000 crore over the next four years.\n",
    reference: "https://economictimes.indiatimes.com/industry/banking/finance/insure/star-health-looking-to-grow-18-improve-claims-ratio-by-50-bps-anand-roy-ceo/articleshow/111066566.cms",
  },
  {
    sn: 25,
    category: "General",
    date: "2024-05-11",
    subject: "Insurers are having a Chillar Party: Maternity insurance sales skyrocket as couples brace for soaring costs",
    summary: "Rising childbirth costs in India drive a surge in demand for maternity insurance, growing at 80% annually. PolicyBazaar data reveals 78% of policies are bought by men. Insurers see these policies as customer magnets despite expected claims. Factors like urbanization and increased C-sections contribute to the trend. Reliance General Insurance reports a 21.5% increase in C-section deliveries since 2016.",
    reference: "https://economictimes.indiatimes.com/industry/banking/finance/insure/insurers-are-having-a-chillar-party-maternity-insurance-sales-skyrocket-as-couples-brace-for-soaring-costs/articleshow/110027597.cms",
  },
  {
    sn: 26,
    category: "General",
    date: "2024-05-02",
    subject: "India needs to expand universal health coverage for rapidly ageing population, maintain growth: ADB report",
    summary: "A report by the Asian Development Bank (ADB) highlights India's low health insurance coverage for older people, emphasizing the need to expand universal health coverage. While countries like South Korea and Thailand have achieved universal coverage, India lags behind, with only 21% of older people covered. The report acknowledges the positive impact of schemes like Ayushman Bharat but calls for further expansion to improve the well-being of older individuals and enhance their productivity for th ..",
    reference: "https://economictimes.indiatimes.com/industry/banking/finance/insure/india-needs-to-expand-universal-health-coverage-for-rapidly-ageing-population-maintain-growth-adb-report/articleshow/109781896.cms",
  },
  {
    sn: 27,
    category: "Regulatory",
    date: "2024-04-21",
    subject: "Health insurance for your ageing parents is now possible as IRDAI scraps age limit",
    summary: "The Insurance Regulatory and Development Authority of India (IRDAI) has eliminated the age limit of 65 years for purchasing health insurance policies, aiming to broaden the market and offer comprehensive coverage. This change, effective from April 1, makes health insurance more inclusive and accessible to individuals of all ages. Insurers are now required to offer policies to all age groups and cover pre-existing medical conditions",
    reference: "https://economictimes.indiatimes.com/industry/banking/finance/insure/insurance-regulator-irdai-abolishes-age-restriction-on-health-insurance-product/articleshow/109473949.cms",
  },
  {
    sn: 28,
    category: "Competition / Peers",
    date: "2024-03-23",
    subject: "Galaxy Health gets nod to launch health insurance business, IRDAI also okays setting up of insurance e-marketplace",
    summary: "Galaxy Health and Allied Insurance Company Limited is spearheaded by V Jagannathan, the founder of Star Health and Allied Insurance Company, has emerged as the latest addition to the Indian health insurance market.TVS Capital is also an Investor",
    reference: "https://economictimes.indiatimes.com/industry/banking/finance/insure/galaxy-health-gets-nod-to-launch-health-insurance-business-irdai-also-okays-setting-up-of-insurance-e-marketplace/articleshow/108722396.cms",
  },
  {
    sn: 29,
    category: "Competition / Peers",
    date: "2023-12-16",
    subject: "Reliance General Insurance unveils global healthcare policy",
    summary: "Reliance General Insurance Company Ltd (RGICL) on Saturday said it has launched a new policy to make global healthcare accessible to Indians. The policy, Reliance Health Global, provides comprehensive cover not only within the borders of India but across the world, RGICL said in a statement.",
    reference: "https://economictimes.indiatimes.com/industry/banking/finance/insure/reliance-general-insurance-unveils-global-healthcare-policy/articleshow/106046572.cms",
  },
  {
    sn: 30,
    category: "Competition / Peers",
    date: "2024-02-21",
    subject: "ICICI Lombard appoints Priya Deshmukh as head of health products, operations & services",
    summary: "Priya Deshmukh, a seasoned professional with 27 years of experience, is appointed as head of health products, operations & services at ICICI Lombard General Insurance. Her appointment is expected to drive innovation, enhance customer well-being, and contribute to the growth of the health insurance business",
    reference: "https://economictimes.indiatimes.com/industry/banking/finance/insure/icici-lombard-appoints-priya-deshmukh-as-head-of-health-products-operations-services/articleshow/107880372.cms",
  },
  {
    sn: 31,
    category: "Regulatory",
    date: "2024-05-22",
    subject: "IRDAI introduces new corporate governance regulations for insurers",
    summary: "IRDAI has mandated that insurance companies must now seek prior approval for appointing their Board Chairperson. Current Chairpersons must comply with this regulation by March 31, 2026, or by the end of their terms, whichever comes first. IRDAI has introduced new corporate governance rules to prevent conflicts of interest in key management roles and to ensure that no individual holds multiple significant positions.",
    reference: "https://economictimes.indiatimes.com/industry/banking/finance/insure/irdai-introduces-new-corporate-governance-regulations-for-insurers/articleshow/110340899.cms?from=mdr",
  },
]
