/**
 * System sectors, shared by every organisation.
 *
 * Data, not code (ADR-010): an organisation that works in a sector we did not
 * anticipate adds its own row, with no deployment. The list below is a
 * starting point, not a closed world — which is why `other` exists and why the
 * codes are stable while the labels are translatable.
 */
export type IndustrySeed = {
  code: string
  labels: { fr: string; en: string }
  sortOrder: number
}

export const INDUSTRY_SEED: readonly IndustrySeed[] = [
  {
    code: 'agriculture',
    labels: { fr: 'Agriculture et agroalimentaire', en: 'Agriculture and food' },
    sortOrder: 10,
  },
  {
    code: 'retail',
    labels: { fr: 'Distribution et commerce', en: 'Retail and commerce' },
    sortOrder: 20,
  },
  {
    code: 'banking',
    labels: { fr: 'Banque et assurance', en: 'Banking and insurance' },
    sortOrder: 30,
  },
  { code: 'telecom', labels: { fr: 'Télécoms', en: 'Telecoms' }, sortOrder: 40 },
  {
    code: 'technology',
    labels: { fr: 'Technologie et logiciel', en: 'Technology and software' },
    sortOrder: 50,
  },
  { code: 'health', labels: { fr: 'Santé', en: 'Health' }, sortOrder: 60 },
  {
    code: 'education',
    labels: { fr: 'Éducation et formation', en: 'Education and training' },
    sortOrder: 70,
  },
  {
    code: 'construction',
    labels: { fr: 'BTP et immobilier', en: 'Construction and real estate' },
    sortOrder: 80,
  },
  {
    code: 'transport',
    labels: { fr: 'Transport et logistique', en: 'Transport and logistics' },
    sortOrder: 90,
  },
  {
    code: 'energy',
    labels: { fr: 'Énergie et ressources', en: 'Energy and resources' },
    sortOrder: 100,
  },
  {
    code: 'hospitality',
    labels: { fr: 'Hôtellerie et restauration', en: 'Hospitality and food service' },
    sortOrder: 110,
  },
  {
    code: 'media',
    labels: { fr: 'Médias et divertissement', en: 'Media and entertainment' },
    sortOrder: 120,
  },
  {
    code: 'ngo',
    labels: { fr: 'ONG et secteur public', en: 'NGO and public sector' },
    sortOrder: 130,
  },
  {
    code: 'services',
    labels: { fr: 'Services aux entreprises', en: 'Business services' },
    sortOrder: 140,
  },
  { code: 'other', labels: { fr: 'Autre', en: 'Other' }, sortOrder: 999 },
]
