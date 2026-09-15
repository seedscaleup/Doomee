/**
 * The six smart result forms, as DATA (ADR-008).
 *
 * This file is the whole point of `result_form_templates` / `result_form_fields`:
 * a social media post and a website build are not measured with the same
 * questions, and coding one form per trade is how a product ends up with
 * fifteen forms and a fourteen-field average. The template is chosen by the
 * action's type; the fields are rendered from these rows; the Zod schema that
 * validates them is built at runtime from the same rows.
 *
 * `metric` links a field to the catalogue — that is what makes the number
 * aggregatable and comparable to an objective. A field with no metric is still
 * recorded, it is simply not counted.
 *
 * Almost nothing is required. A result nobody can finish is a result nobody
 * records, and half a measurement beats none (rule 10).
 */
export type FormFieldSeed = {
  key: string
  kind:
    | 'number'
    | 'percent'
    | 'currency'
    | 'text'
    | 'longtext'
    | 'url'
    | 'date'
    | 'select'
    | 'boolean'
  labels: { fr: string; en: string }
  help?: { fr: string; en: string }
  /** A metric `code`, resolved to its id at seed time. */
  metric?: string
  unit?: string
  isRequired?: boolean
  min?: string
  max?: string
  options?: { value: string; labels: { fr: string; en: string } }[]
}

export type FormTemplateSeed = {
  code: string
  /** An `action_types` code, or null for the fallback form. */
  actionType: string | null
  labels: { fr: string; en: string }
  fields: readonly FormFieldSeed[]
}

const REACH_FIELDS: readonly FormFieldSeed[] = [
  {
    key: 'impressions',
    kind: 'number',
    labels: { fr: 'Impressions', en: 'Impressions' },
    metric: 'impressions',
    min: '0',
  },
  {
    key: 'reach',
    kind: 'number',
    labels: { fr: 'Portée', en: 'Reach' },
    metric: 'reach',
    min: '0',
  },
]

export const RESULT_FORM_SEED: readonly FormTemplateSeed[] = [
  {
    code: 'social_post',
    actionType: 'social_post',
    labels: { fr: 'Publication réseaux sociaux', en: 'Social media post' },
    fields: [
      ...REACH_FIELDS,
      {
        key: 'views',
        kind: 'number',
        labels: { fr: 'Vues', en: 'Views' },
        metric: 'views',
        min: '0',
      },
      {
        key: 'reactions',
        kind: 'number',
        labels: { fr: 'Réactions', en: 'Reactions' },
        metric: 'reactions',
        min: '0',
      },
      {
        key: 'comments',
        kind: 'number',
        labels: { fr: 'Commentaires', en: 'Comments' },
        metric: 'comments',
        min: '0',
      },
      {
        key: 'shares',
        kind: 'number',
        labels: { fr: 'Partages', en: 'Shares' },
        metric: 'shares',
        min: '0',
      },
      {
        key: 'clicks',
        kind: 'number',
        labels: { fr: 'Clics', en: 'Clicks' },
        metric: 'clicks',
        min: '0',
      },
      { key: 'post_url', kind: 'url', labels: { fr: 'Lien de la publication', en: 'Post link' } },
    ],
  },
  {
    code: 'ads_campaign',
    actionType: 'ads_campaign',
    labels: { fr: 'Campagne publicitaire', en: 'Ads campaign' },
    fields: [
      ...REACH_FIELDS,
      {
        key: 'clicks',
        kind: 'number',
        labels: { fr: 'Clics', en: 'Clicks' },
        metric: 'clicks',
        min: '0',
      },
      {
        key: 'spend',
        kind: 'currency',
        labels: { fr: 'Budget dépensé', en: 'Spend' },
        metric: 'spend',
        min: '0',
      },
      {
        key: 'leads',
        kind: 'number',
        labels: { fr: 'Leads générés', en: 'Leads generated' },
        metric: 'leads',
        min: '0',
      },
      {
        key: 'sales',
        kind: 'number',
        labels: { fr: 'Ventes', en: 'Sales' },
        metric: 'sales',
        min: '0',
      },
      {
        key: 'revenue',
        kind: 'currency',
        labels: { fr: "Chiffre d'affaires généré", en: 'Revenue generated' },
        metric: 'revenue',
        min: '0',
      },
    ],
  },
  {
    code: 'website',
    actionType: 'website',
    labels: { fr: 'Site web', en: 'Website' },
    fields: [
      {
        key: 'pages_delivered',
        kind: 'number',
        labels: { fr: 'Pages livrées', en: 'Pages delivered' },
        metric: 'pages_delivered',
        min: '0',
      },
      {
        key: 'features_delivered',
        kind: 'number',
        labels: { fr: 'Fonctionnalités livrées', en: 'Features delivered' },
        metric: 'features_delivered',
        min: '0',
      },
      {
        key: 'performance_score',
        kind: 'number',
        labels: { fr: 'Score de performance', en: 'Performance score' },
        help: { fr: 'Lighthouse, sur 100.', en: 'Lighthouse, out of 100.' },
        metric: 'performance_score',
        min: '0',
        max: '100',
      },
      {
        key: 'bugs',
        kind: 'number',
        labels: { fr: 'Bugs relevés', en: 'Bugs found' },
        metric: 'bugs',
        min: '0',
      },
      {
        key: 'traffic',
        kind: 'number',
        labels: { fr: 'Trafic', en: 'Traffic' },
        metric: 'traffic',
        min: '0',
      },
      { key: 'site_url', kind: 'url', labels: { fr: 'Adresse du site', en: 'Site address' } },
    ],
  },
  {
    code: 'content',
    actionType: 'content',
    labels: { fr: 'Production de contenu', en: 'Content production' },
    fields: [
      ...REACH_FIELDS,
      {
        key: 'views',
        kind: 'number',
        labels: { fr: 'Vues', en: 'Views' },
        metric: 'views',
        min: '0',
      },
      {
        key: 'pieces',
        kind: 'number',
        labels: { fr: 'Contenus produits', en: 'Pieces produced' },
        min: '0',
      },
      {
        key: 'format',
        kind: 'select',
        labels: { fr: 'Format', en: 'Format' },
        options: [
          { value: 'article', labels: { fr: 'Article', en: 'Article' } },
          { value: 'video', labels: { fr: 'Vidéo', en: 'Video' } },
          { value: 'photo', labels: { fr: 'Photo', en: 'Photo' } },
          { value: 'podcast', labels: { fr: 'Podcast', en: 'Podcast' } },
          { value: 'other', labels: { fr: 'Autre', en: 'Other' } },
        ],
      },
    ],
  },
  {
    code: 'event',
    actionType: 'event',
    labels: { fr: 'Événement', en: 'Event' },
    fields: [
      {
        key: 'attendees',
        kind: 'number',
        labels: { fr: 'Participants', en: 'Attendees' },
        min: '0',
      },
      {
        key: 'leads',
        kind: 'number',
        labels: { fr: 'Contacts collectés', en: 'Leads collected' },
        metric: 'leads',
        min: '0',
      },
      {
        key: 'meetings',
        kind: 'number',
        labels: { fr: 'Rendez-vous obtenus', en: 'Meetings booked' },
        metric: 'meetings',
        min: '0',
      },
      {
        key: 'spend',
        kind: 'currency',
        labels: { fr: 'Budget dépensé', en: 'Spend' },
        metric: 'spend',
        min: '0',
      },
      {
        key: 'satisfaction',
        kind: 'percent',
        labels: { fr: 'Satisfaction', en: 'Satisfaction' },
        min: '0',
        max: '100',
      },
    ],
  },
  {
    /**
     * The fallback. Every action type without a form of its own gets this one,
     * so "record a result" is never unavailable — which is what would otherwise
     * push people back to not recording anything.
     */
    code: 'generic',
    actionType: null,
    labels: { fr: 'Résultat', en: 'Result' },
    fields: [
      {
        key: 'outcome',
        kind: 'longtext',
        labels: { fr: 'Ce qui a été produit', en: 'What was produced' },
      },
      {
        key: 'quantity',
        kind: 'number',
        labels: { fr: 'Quantité', en: 'Quantity' },
        min: '0',
      },
    ],
  },
]
