import type { TaxonomySeed } from './action-taxonomies'

/**
 * What a deliverable can BE (cahier des charges §M7).
 *
 * Data, not code (rule 7): an agency that ships something we never thought of
 * adds a row, not a release. Codes are stable; only the labels are translated.
 */
export const DELIVERABLE_TYPE_SEED: readonly TaxonomySeed[] = [
  { code: 'document', labels: { fr: 'Document', en: 'Document' }, sortOrder: 10 },
  { code: 'design', labels: { fr: 'Création graphique', en: 'Design' }, sortOrder: 20 },
  { code: 'video', labels: { fr: 'Vidéo', en: 'Video' }, sortOrder: 30 },
  { code: 'photo', labels: { fr: 'Photo', en: 'Photo' }, sortOrder: 40 },
  { code: 'website', labels: { fr: 'Site web', en: 'Website' }, sortOrder: 50 },
  { code: 'social_content', labels: { fr: 'Contenu social', en: 'Social content' }, sortOrder: 60 },
  { code: 'campaign', labels: { fr: 'Campagne', en: 'Campaign' }, sortOrder: 70 },
  { code: 'report', labels: { fr: 'Rapport', en: 'Report' }, sortOrder: 80 },
  { code: 'presentation', labels: { fr: 'Présentation', en: 'Presentation' }, sortOrder: 90 },
  { code: 'other', labels: { fr: 'Autre', en: 'Other' }, sortOrder: 100 },
]
