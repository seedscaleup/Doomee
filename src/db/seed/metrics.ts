/**
 * The system metric catalogue.
 *
 * Each row carries more than a label: how several measurements become one
 * number over a period (`aggregation`), and whether more is better
 * (`direction`). Without those two an objective cannot be scored at all —
 * "20% below target" is a miss on revenue and a win on cost per lead.
 *
 * `isComputed` marks a metric derived from others. Those are computed AT READ
 * TIME by the metrics service (LOT 7) and never stored twice: a stored ratio
 * disagrees with its own numerator the first time one of them is corrected.
 *
 * Data, not code (rule 7): an agency that tracks something absent here adds a
 * row of its own, with no deployment.
 */
export type MetricSeed = {
  code: string
  labels: { fr: string; en: string }
  unit?: string
  kind: 'integer' | 'decimal' | 'currency' | 'percent' | 'ratio' | 'duration'
  aggregation: 'sum' | 'avg' | 'last' | 'max' | 'min'
  direction: 'higher_is_better' | 'lower_is_better' | 'neutral'
  decimals: number
  isComputed?: boolean
  /** Written in metric codes, read by the derived-metrics service. */
  formula?: string
  sortOrder: number
}

export const METRIC_SEED: readonly MetricSeed[] = [
  // — Audience ————————————————————————————————————————————————————————
  {
    code: 'impressions',
    labels: { fr: 'Impressions', en: 'Impressions' },
    kind: 'integer',
    aggregation: 'sum',
    direction: 'higher_is_better',
    decimals: 0,
    sortOrder: 10,
  },
  {
    code: 'reach',
    labels: { fr: 'Portée', en: 'Reach' },
    kind: 'integer',
    aggregation: 'sum',
    direction: 'higher_is_better',
    decimals: 0,
    sortOrder: 20,
  },
  {
    code: 'views',
    labels: { fr: 'Vues', en: 'Views' },
    kind: 'integer',
    aggregation: 'sum',
    direction: 'higher_is_better',
    decimals: 0,
    sortOrder: 30,
  },
  {
    code: 'traffic',
    labels: { fr: 'Trafic', en: 'Traffic' },
    kind: 'integer',
    aggregation: 'sum',
    direction: 'higher_is_better',
    decimals: 0,
    sortOrder: 40,
  },

  // — Engagement ——————————————————————————————————————————————————————
  {
    code: 'reactions',
    labels: { fr: 'Réactions', en: 'Reactions' },
    kind: 'integer',
    aggregation: 'sum',
    direction: 'higher_is_better',
    decimals: 0,
    sortOrder: 50,
  },
  {
    code: 'comments',
    labels: { fr: 'Commentaires', en: 'Comments' },
    kind: 'integer',
    aggregation: 'sum',
    direction: 'higher_is_better',
    decimals: 0,
    sortOrder: 60,
  },
  {
    code: 'shares',
    labels: { fr: 'Partages', en: 'Shares' },
    kind: 'integer',
    aggregation: 'sum',
    direction: 'higher_is_better',
    decimals: 0,
    sortOrder: 70,
  },
  {
    code: 'clicks',
    labels: { fr: 'Clics', en: 'Clicks' },
    kind: 'integer',
    aggregation: 'sum',
    direction: 'higher_is_better',
    decimals: 0,
    sortOrder: 80,
  },
  {
    code: 'ctr',
    labels: { fr: 'Taux de clic (CTR)', en: 'Click-through rate (CTR)' },
    unit: '%',
    kind: 'percent',
    // A rate is never summed: two 3% weeks are not a 6% fortnight.
    aggregation: 'avg',
    direction: 'higher_is_better',
    decimals: 2,
    isComputed: true,
    formula: 'clicks / impressions',
    sortOrder: 90,
  },

  // — Conversion ——————————————————————————————————————————————————————
  {
    code: 'leads',
    labels: { fr: 'Leads', en: 'Leads' },
    kind: 'integer',
    aggregation: 'sum',
    direction: 'higher_is_better',
    decimals: 0,
    sortOrder: 100,
  },
  {
    code: 'meetings',
    labels: { fr: 'Rendez-vous', en: 'Meetings' },
    kind: 'integer',
    aggregation: 'sum',
    direction: 'higher_is_better',
    decimals: 0,
    sortOrder: 110,
  },
  {
    code: 'sales',
    labels: { fr: 'Ventes', en: 'Sales' },
    kind: 'integer',
    aggregation: 'sum',
    direction: 'higher_is_better',
    decimals: 0,
    sortOrder: 120,
  },
  {
    code: 'conversion_rate',
    labels: { fr: 'Taux de conversion', en: 'Conversion rate' },
    unit: '%',
    kind: 'percent',
    aggregation: 'avg',
    direction: 'higher_is_better',
    decimals: 2,
    isComputed: true,
    formula: 'sales / leads',
    sortOrder: 130,
  },

  // — Money ———————————————————————————————————————————————————————————
  {
    code: 'revenue',
    labels: { fr: "Chiffre d'affaires", en: 'Revenue' },
    kind: 'currency',
    aggregation: 'sum',
    direction: 'higher_is_better',
    decimals: 2,
    sortOrder: 140,
  },
  {
    code: 'spend',
    labels: { fr: 'Budget dépensé', en: 'Spend' },
    kind: 'currency',
    aggregation: 'sum',
    // Spending less for the same result is better — which is exactly why
    // direction is a column and not an assumption.
    direction: 'lower_is_better',
    decimals: 2,
    sortOrder: 150,
  },
  {
    code: 'cpl',
    labels: { fr: 'Coût par lead (CPL)', en: 'Cost per lead (CPL)' },
    kind: 'currency',
    aggregation: 'avg',
    direction: 'lower_is_better',
    decimals: 2,
    isComputed: true,
    formula: 'spend / leads',
    sortOrder: 160,
  },
  {
    code: 'cpc',
    labels: { fr: 'Coût par clic (CPC)', en: 'Cost per click (CPC)' },
    kind: 'currency',
    aggregation: 'avg',
    direction: 'lower_is_better',
    decimals: 2,
    isComputed: true,
    formula: 'spend / clicks',
    sortOrder: 170,
  },
  {
    code: 'roas',
    labels: { fr: 'ROAS', en: 'ROAS' },
    kind: 'ratio',
    aggregation: 'avg',
    direction: 'higher_is_better',
    decimals: 2,
    isComputed: true,
    formula: 'revenue / spend',
    sortOrder: 180,
  },
  {
    code: 'roi',
    labels: { fr: 'ROI', en: 'ROI' },
    unit: '%',
    kind: 'percent',
    aggregation: 'avg',
    direction: 'higher_is_better',
    decimals: 2,
    isComputed: true,
    formula: '(revenue - spend) / spend',
    sortOrder: 190,
  },

  // — Delivery ————————————————————————————————————————————————————————
  {
    code: 'pages_delivered',
    labels: { fr: 'Pages livrées', en: 'Pages delivered' },
    kind: 'integer',
    aggregation: 'sum',
    direction: 'higher_is_better',
    decimals: 0,
    sortOrder: 200,
  },
  {
    code: 'features_delivered',
    labels: { fr: 'Fonctionnalités livrées', en: 'Features delivered' },
    kind: 'integer',
    aggregation: 'sum',
    direction: 'higher_is_better',
    decimals: 0,
    sortOrder: 210,
  },
  {
    code: 'bugs',
    labels: { fr: 'Bugs', en: 'Bugs' },
    kind: 'integer',
    aggregation: 'sum',
    direction: 'lower_is_better',
    decimals: 0,
    sortOrder: 220,
  },
  {
    code: 'tests_passed',
    labels: { fr: 'Tests passés', en: 'Tests passed' },
    kind: 'integer',
    aggregation: 'sum',
    direction: 'higher_is_better',
    decimals: 0,
    sortOrder: 230,
  },
  {
    code: 'performance_score',
    labels: { fr: 'Score de performance', en: 'Performance score' },
    kind: 'decimal',
    // A score is a state, not a total: the latest one is the one that counts.
    aggregation: 'last',
    direction: 'higher_is_better',
    decimals: 0,
    sortOrder: 240,
  },
]
