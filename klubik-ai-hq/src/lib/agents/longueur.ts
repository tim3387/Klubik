// Longueur maximale des brouillons par canal (règles « style et ton ») : vérifiée par le code, pas laissée au modèle.

export interface Limite { canal: string; max: number; unite: "mots" | "caractères" }

export function limitePour(canal: string): Limite {
  if (/insta|facebook|messenger/i.test(canal)) return { canal: "DM", max: 80, unite: "mots" };
  if (/mail/i.test(canal)) return { canal: "email", max: 120, unite: "mots" };
  if (/t[ée]l[ée]phone|sms/i.test(canal)) return { canal: "SMS", max: 300, unite: "caractères" };
  return { canal: "LinkedIn / autre", max: 100, unite: "mots" };
}

/** Mots du texte (signature comprise) ; la ponctuation isolée (« : », « — ») ne compte pas. */
export function compterMots(texte: string): number {
  return texte.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

/** Message d'échec si le brouillon dépasse la limite de son canal, sinon null. */
export function depassement(canal: string, texte: string): string | null {
  const l = limitePour(canal);
  const n = l.unite === "mots" ? compterMots(texte) : texte.trim().length;
  if (n <= l.max) return null;
  return `ÉCHEC : brouillon trop long pour un ${l.canal} (${n} ${l.unite}, maximum ${l.max}). Raccourcis-le (un seul fait, une seule demande) puis enregistre-le à nouveau. Rien n'a été enregistré.`;
}
