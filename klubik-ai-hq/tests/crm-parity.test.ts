// Parité avec l'outil Python validé, sur le VRAI fichier de prospection (jamais commité).
// KLUBIK_XLSX = chemin du fichier · KLUBIK_REF = dossier contenant python-export.json et python-expected.json
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, beforeAll } from "vitest";
import { parseWorkbook, type ParsedWorkbook } from "@/lib/crm/xlsx-import";
import * as R from "@/lib/crm/rules";

const XLSX = process.env.KLUBIK_XLSX ?? "";
const REF = process.env.KLUBIK_REF ?? "";
const dispo = XLSX && REF && existsSync(XLSX) && existsSync(path.join(REF, "python-expected.json"));
const J = new Date(Date.UTC(2026, 9, 27));

describe.skipIf(!dispo)("parité avec l'outil Python sur le fichier réel", () => {
  let wb: ParsedWorkbook;
  let clubs: R.Club[];
  let exp: any;
  beforeAll(async () => {
    wb = await parseWorkbook(readFileSync(XLSX), path.basename(XLSX));
    clubs = wb.clubs.map((c) => ({ id: c.id, data: c.data, version: 1 }));
    exp = JSON.parse(readFileSync(path.join(REF, "python-expected.json"), "utf8"));
  });

  it("lit chaque cellule de chaque onglet comme le lecteur Python (valeurs et formules)", () => {
    const ref = JSON.parse(readFileSync(path.join(REF, "python-export.json"), "utf8")) as Record<string, Record<string, { v: unknown; f: string | null }>>;
    expect(Object.keys(wb.sheets).sort()).toEqual(Object.keys(ref).sort());
    let comparees = 0;
    const ecarts: string[] = [];
    for (const [sheet, cells] of Object.entries(ref)) {
      for (const [addr, c] of Object.entries(cells)) {
        const mine = wb.sheets[sheet][addr];
        comparees++;
        if (c.f) {
          if (!mine?.f || mine.f !== c.f) ecarts.push(`${sheet}!${addr} formule`);
          continue; // valeur en cache non significative (recalculée par l'application)
        }
        const a = c.v, b = mine?.v;
        const ok = typeof a === "number" ? typeof b === "number" && Math.abs(a - b) < 1e-9 : a === b;
        if (!ok) ecarts.push(`${sheet}!${addr} : ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
      }
      for (const addr of Object.keys(wb.sheets[sheet])) if (!(addr in cells)) ecarts.push(`${sheet}!${addr} en trop`);
    }
    expect(ecarts.slice(0, 10)).toEqual([]);
    expect(comparees).toBeGreaterThan(50000);
  });

  it("importe les 727 clubs sans perte, colonnes calculées exclues", () => {
    expect(wb.clubs.length).toBe(727);
    expect(new Set(wb.clubs.map((c) => c.id)).size).toBe(727);
    expect(wb.formulaHeaders.sort()).toEqual(
      ["Priorité", "Relance due le", "Joignable", "Contact à utiliser", "Prêt à envoyer", "Rang envoi", "Relance en retard", "Rang relance", "Alerte"].sort(),
    );
    expect(wb.settings.delaiRelance).toBe(7);
    expect(wb.settings.objectifSemaine).toBe(10);
    expect(wb.settings.seuils).toEqual([8.9, 8, 6.5]);
    const objat = clubs.find((c) => c.id === 305)!;
    expect(objat.data["Statut"]).toBe("En échange");
    expect(objat.data["Dernier contact"]).toBe("2026-10-26");
  });

  it("statistiques identiques", () => {
    const st = R.stats(clubs, wb.settings, J);
    const e = exp.stats;
    expect([st.actifs, st.joignables, st.contactes, st.ontRepondu, st.clients, st.relancesEnRetard, st.premiersContactsSemaine, st.prets])
      .toEqual([e.actifs, e.joignables, e.contactes, e.ont_repondu, e.clients, e.relances_en_retard, e.premiers_contacts_semaine, e.prets]);
    expect(st.statuts).toEqual(e.statuts);
  });

  it("valeurs dérivées identiques pour chaque club", () => {
    for (const c of clubs) {
      const due = R.relanceDue(c.data, wb.settings);
      const mine = [R.priorite(c.data, wb.settings), R.joignable(c.data), R.contactAUtiliser(c.data), R.pretAEnvoyer(c.data), R.alerte(c.data), due ? R.iso(due) : null];
      expect(mine, `club ${c.id}`).toEqual(exp.derived[String(c.id)]);
    }
  });

  it("relances identiques", () => {
    const r = R.relances(clubs, wb.settings, J, 7);
    expect(r.retard.map((x) => x.club.id).sort()).toEqual([...exp.relances.retard].sort());
    expect(r.avenir.map((x) => x.club.id).sort()).toEqual([...exp.relances.avenir].sort());
  });

  it("recherche identique (scores et ordre)", () => {
    for (const [q, attendu] of Object.entries(exp.search as Record<string, [number, number][]>)) {
      expect(R.chercher(clubs, q, 5).map((x) => [x.score, x.club.id]), q).toEqual(attendu);
    }
  });

  it("planification des mises à jour identique (y compris les refus)", () => {
    const byId = (id: number) => clubs.find((c) => c.id === id)!.data;
    const exclu = clubs.find((c) => c.data["Statut"] === "Exclu")!;
    const aQualifier = clubs.find((c) => c.data["Statut"] === "À qualifier")!;
    const cas: Record<string, [R.ClubData, R.DemandeMaj]> = {
      premier_51: [byId(51), { type: "premier-contact", canal: "Instagram", resume: "DM de présentation" }],
      relance_94: [byId(94), { type: "relance", canal: "Email", date: "27/10/2026" }],
      reponse_28_poli: [byId(28), { type: "reponse", sentiment: "refus-poli", resume: "Déjà quelqu un" }],
      reponse_29_pos: [byId(29), { type: "reponse", sentiment: "positif", resume: "Intéressé", prochain_pas: "Appel", date_prochain_pas: "05/11/2026" }],
      exclu: [exclu.data, { type: "premier-contact", canal: "Instagram" }],
      futur: [byId(51), { type: "premier-contact", canal: "Instagram", date: "01/01/2030" }],
      qualifier: [aQualifier.data, { type: "premier-contact", canal: "Instagram" }],
      info_sans_source: [byId(51), { type: "info", champ: "Contact (prénom nom)", valeur: "Jean Test" }],
    };
    for (const [nom, [data, dm]] of Object.entries(cas)) {
      const attendu = exp.plans[nom];
      if (attendu.error) {
        expect(() => R.planifier(data, dm, wb.settings, J), nom).toThrow(R.CrmError);
        let msg = "";
        try { R.planifier(data, dm, wb.settings, J); } catch (e) { msg = (e as Error).message; }
        // mêmes refus ; formulation adaptée à l'application (sans options de ligne de commande)
        const mot = (t: string) => R.normaliser(t.replace(/--/g, "")).split(" ").slice(0, 2).join(" ");
        expect(mot(msg), nom).toEqual(mot(String(attendu.error)));
      } else {
        const { changes, avertissements } = R.planifier(data, dm, wb.settings, J);
        expect(changes, nom).toEqual(attendu.changes);
        expect(avertissements.length, nom).toBe(attendu.avert.length);
      }
    }
  });
});
