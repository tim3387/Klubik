// Génère les versions web des avatars à partir des originaux (public/avatars/<id>/original.png, jamais modifiés).
// Redimensionnement uniquement : aucune retouche de couleur ni de forme. Le cadrage « portrait » (visage, pour
// les pastilles rondes) vient de la configuration centrale src/lib/agents/profiles.ts.
// Usage : npm run avatars
import path from "node:path";
import sharp from "sharp";
import { AGENT_IDS, PROFILES, TAILLES } from "../src/lib/agents/profiles.ts";

const pub = path.join(import.meta.dirname, "..", "public");
for (const id of AGENT_IDS) {
  const a = PROFILES[id].avatar;
  if (!a) continue;
  const original = path.join(pub, a.dossier, "original.png");
  const meta = await sharp(original).metadata();
  const w = meta.width!, h = meta.height!;
  for (const largeur of TAILLES.entier) {
    await sharp(original).resize(largeur, Math.round((largeur * h) / w), { kernel: "lanczos3" })
      .webp({ quality: 88, effort: 6, smartSubsample: true }).toFile(path.join(pub, a.dossier, `entier-${largeur}.webp`));
  }
  const c = a.cadrage;
  const zone = { left: Math.round(c.x * w), top: Math.round(c.y * h), width: Math.round(c.cote * w), height: Math.round(c.cote * w) };
  for (const largeur of TAILLES.portrait) {
    await sharp(original).extract(zone).resize(largeur, largeur, { kernel: "lanczos3" })
      .webp({ quality: 88, effort: 6, smartSubsample: true }).toFile(path.join(pub, a.dossier, `portrait-${largeur}.webp`));
  }
  console.log(`${id} : ${w}×${h} → entier ${TAILLES.entier.join("/")} px, portrait ${TAILLES.portrait.join("/")} px`);
}
