// Réponses instantanées de Popi (sans IA) : libellés et outils CRM déterministes utilisés.
export const QUICK = {
  point: { label: "Point du jour", tool: "crm_point", input: {} },
  relances: { label: "Relances à faire", tool: "crm_relances", input: { horizon_jours: 7 } },
  prioritaires: { label: "Clubs à contacter", tool: "crm_prioritaires", input: { n: 10, prets_seulement: true } },
  qualite: { label: "Qualité des données", tool: "crm_qualite", input: {} },
  chercher: { label: "Chercher un club", tool: "crm_chercher", input: {} },
} as const;
export type QuickKind = keyof typeof QUICK;
