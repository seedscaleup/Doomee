/**
 * The system classifications an action is described by.
 *
 * Data, not code (rule 7, ADR-010). The codes are stable because code depends
 * on them — `action_type` will decide which results form an action gets when it
 * closes (ADR-008) — while the labels are translatable and an organisation can
 * add its own rows with no deployment.
 *
 * The lists below come from the agency work the cahier des charges describes;
 * they are a starting point, not a closed world.
 */
export type TaxonomySeed = {
  code: string
  labels: { fr: string; en: string }
  sortOrder: number
}

/** WHAT is being done. The one that will drive the results form. */
export const ACTION_TYPE_SEED: readonly TaxonomySeed[] = [
  {
    code: 'social_post',
    labels: { fr: 'Publication réseaux sociaux', en: 'Social media post' },
    sortOrder: 10,
  },
  {
    code: 'ads_campaign',
    labels: { fr: 'Campagne publicitaire', en: 'Ads campaign' },
    sortOrder: 20,
  },
  {
    code: 'content',
    labels: { fr: 'Production de contenu', en: 'Content production' },
    sortOrder: 30,
  },
  { code: 'design', labels: { fr: 'Création graphique', en: 'Design' }, sortOrder: 40 },
  { code: 'website', labels: { fr: 'Site web', en: 'Website' }, sortOrder: 50 },
  { code: 'development', labels: { fr: 'Développement', en: 'Development' }, sortOrder: 60 },
  { code: 'event', labels: { fr: 'Événement', en: 'Event' }, sortOrder: 70 },
  {
    code: 'press_relations',
    labels: { fr: 'Relations presse', en: 'Press relations' },
    sortOrder: 80,
  },
  { code: 'meeting', labels: { fr: 'Réunion', en: 'Meeting' }, sortOrder: 90 },
  {
    code: 'strategy',
    labels: { fr: 'Stratégie et cadrage', en: 'Strategy and scoping' },
    sortOrder: 100,
  },
  { code: 'admin', labels: { fr: 'Administratif', en: 'Admin' }, sortOrder: 110 },
  { code: 'other', labels: { fr: 'Autre', en: 'Other' }, sortOrder: 999 },
]

/** WHY it is being done — the kind of work, for grouping and reporting. */
export const ACTION_CATEGORY_SEED: readonly TaxonomySeed[] = [
  { code: 'acquisition', labels: { fr: 'Acquisition', en: 'Acquisition' }, sortOrder: 10 },
  { code: 'brand', labels: { fr: 'Notoriété et image', en: 'Brand and awareness' }, sortOrder: 20 },
  { code: 'engagement', labels: { fr: 'Engagement', en: 'Engagement' }, sortOrder: 30 },
  { code: 'retention', labels: { fr: 'Fidélisation', en: 'Retention' }, sortOrder: 40 },
  { code: 'production', labels: { fr: 'Production', en: 'Production' }, sortOrder: 50 },
  { code: 'internal', labels: { fr: 'Interne', en: 'Internal' }, sortOrder: 60 },
  { code: 'other', labels: { fr: 'Autre', en: 'Other' }, sortOrder: 999 },
]

/** WHERE it happens. */
export const CHANNEL_SEED: readonly TaxonomySeed[] = [
  { code: 'facebook', labels: { fr: 'Facebook', en: 'Facebook' }, sortOrder: 10 },
  { code: 'instagram', labels: { fr: 'Instagram', en: 'Instagram' }, sortOrder: 20 },
  { code: 'linkedin', labels: { fr: 'LinkedIn', en: 'LinkedIn' }, sortOrder: 30 },
  { code: 'tiktok', labels: { fr: 'TikTok', en: 'TikTok' }, sortOrder: 40 },
  { code: 'youtube', labels: { fr: 'YouTube', en: 'YouTube' }, sortOrder: 50 },
  { code: 'x', labels: { fr: 'X', en: 'X' }, sortOrder: 60 },
  { code: 'whatsapp', labels: { fr: 'WhatsApp', en: 'WhatsApp' }, sortOrder: 70 },
  { code: 'email', labels: { fr: 'E-mailing', en: 'Email' }, sortOrder: 80 },
  { code: 'website', labels: { fr: 'Site web', en: 'Website' }, sortOrder: 90 },
  { code: 'print', labels: { fr: 'Print', en: 'Print' }, sortOrder: 100 },
  { code: 'radio', labels: { fr: 'Radio', en: 'Radio' }, sortOrder: 110 },
  { code: 'tv', labels: { fr: 'Télévision', en: 'Television' }, sortOrder: 120 },
  { code: 'outdoor', labels: { fr: 'Affichage', en: 'Outdoor' }, sortOrder: 130 },
  { code: 'in_person', labels: { fr: 'Terrain', en: 'In person' }, sortOrder: 140 },
  { code: 'other', labels: { fr: 'Autre', en: 'Other' }, sortOrder: 999 },
]
