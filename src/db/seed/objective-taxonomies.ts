import type { TaxonomySeed } from './action-taxonomies'

/** The kinds of objective a project can carry (cahier des charges §M6). */
export const OBJECTIVE_TYPE_SEED: readonly TaxonomySeed[] = [
  { code: 'business', labels: { fr: 'Business', en: 'Business' }, sortOrder: 10 },
  { code: 'marketing', labels: { fr: 'Marketing', en: 'Marketing' }, sortOrder: 20 },
  { code: 'communication', labels: { fr: 'Communication', en: 'Communication' }, sortOrder: 30 },
  { code: 'commercial', labels: { fr: 'Commercial', en: 'Sales' }, sortOrder: 40 },
  { code: 'operational', labels: { fr: 'Opérationnel', en: 'Operational' }, sortOrder: 50 },
  { code: 'financial', labels: { fr: 'Financier', en: 'Financial' }, sortOrder: 60 },
]
