"""
Tests de klubik_crm.py — toujours exécutés sur une COPIE temporaire du fichier.

    python3 -m unittest discover -s crm/tests -v

Le fichier source est lu via $KLUBIK_CRM_FICHIER ou data/klubik-prospection-master.xlsx.
Il n'est jamais modifié (son empreinte est contrôlée en fin de tests).
"""

import contextlib
import datetime as dt
import hashlib
import io
import json
import os
import shutil
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import klubik_crm as k  # noqa: E402

SOURCE = Path(os.environ.get("KLUBIK_CRM_FICHIER", k.FICHIER_DEFAUT))
JOUR = "26/10/2026"


def empreinte(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


@unittest.skipUnless(SOURCE.exists(), f"fichier source absent : {SOURCE}")
class TestCRM(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sha_source = empreinte(SOURCE)

    @classmethod
    def tearDownClass(cls):
        assert empreinte(SOURCE) == cls.sha_source, "LE FICHIER SOURCE A ÉTÉ MODIFIÉ PAR LES TESTS"

    def setUp(self):
        self.dossier = Path(tempfile.mkdtemp(prefix="klubik-test-"))
        self.f = self.dossier / "crm.xlsx"
        shutil.copy2(SOURCE, self.f)
        self.crm = k.CRM(self.f, k.parse_date(JOUR))

    def tearDown(self):
        shutil.rmtree(self.dossier, ignore_errors=True)

    # ── utilitaires ──
    def run_cli(self, *args):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = k.main(["--fichier", str(self.f), "--aujourdhui", JOUR, *args])
        return code, out.getvalue()

    def un_club(self, statut, sans_date=True):
        for c in self.crm.clubs:
            if c["Statut"] == statut and (not sans_date or not c.get("Date 1er contact")):
                return c
        self.skipTest(f"aucun club au statut {statut}")

    def recharger(self):
        return k.CRM(self.f, k.parse_date(JOUR))

    # ── lecture ──
    def test_verifier_et_point(self):
        code, out = self.run_cli("verifier")
        self.assertEqual(code, 0, out)
        self.assertIn("ACCÈS LECTURE : OK", out)
        code, out = self.run_cli("point")
        self.assertEqual(code, 0, out)
        self.assertIn("Clubs actifs", out)

    def test_recherche_exacte_et_inconnue(self):
        c = self.un_club("À contacter")
        res = self.crm.chercher(c["Club"])
        self.assertEqual(res[0][1]["ID"], c["ID"])
        self.assertEqual(self.crm.chercher("Zorglub Inexistant FC"), [])

    def test_calculs_identiques_aux_formules_en_cache(self):
        for c in self.crm.clubs:
            if c["Joignable"] in ("Oui", "Non"):
                self.assertEqual("Oui" if self.crm.joignable(c) else "Non", c["Joignable"], c["Club"])
            if c["Priorité"] is not None:
                self.assertEqual(self.crm.priorite(c), c["Priorité"] or "", c["Club"])

    # ── écriture : parcours nominal ──
    def test_simulation_n_ecrit_rien(self):
        c = self.un_club("À contacter")
        avant = empreinte(self.f)
        code, out = self.run_cli("enregistrer", "--club", str(c["ID"]), "--nom", c["Club"][:6],
                                 "--type", "premier-contact", "--canal", "Instagram")
        self.assertEqual(code, 0, out)
        self.assertIn("SIMULATION", out)
        self.assertEqual(empreinte(self.f), avant)
        self.assertFalse((self.dossier / "journal-crm.jsonl").exists())

    def test_cycle_complet_premier_contact_relance_reponse(self):
        c = self.un_club("À contacter")
        cid, nom = str(c["ID"]), c["Club"][:6]
        code, out = self.run_cli("enregistrer", "--club", cid, "--nom", nom, "--type", "premier-contact",
                                 "--canal", "Instagram", "--date", "20/10/2026", "--resume", "DM test", "--appliquer")
        self.assertEqual(code, 0, out)
        self.assertIn("ÉCRIT ET VÉRIFIÉ", out)
        c2 = self.recharger().club(int(cid))
        self.assertEqual(c2["Statut"], "Contacté")
        self.assertEqual(k.serial_vers_date(c2["Date 1er contact"]), dt.date(2026, 10, 20))
        self.assertEqual(c2["Canal utilisé"], "Instagram")
        self.assertTrue(str(c2["Notes"]).endswith("20/10/2026 : premier contact Instagram – DM test"))
        self.assertEqual(self.recharger().relance_due(c2), dt.date(2026, 10, 27))
        # sauvegarde + journal
        self.assertEqual(len(list((self.dossier / "sauvegardes").glob("*.xlsx"))), 1)
        j = [json.loads(l) for l in (self.dossier / "journal-crm.jsonl").read_text(encoding="utf-8").splitlines()]
        self.assertEqual(j[-1]["club_id"], int(cid))
        self.assertEqual(j[-1]["avant"]["Statut"], "À contacter")
        # double premier contact refusé
        code, out = self.run_cli("enregistrer", "--club", cid, "--nom", nom, "--type", "premier-contact",
                                 "--canal", "Instagram", "--appliquer")
        self.assertEqual(code, 2)
        self.assertIn("déjà été contacté", out)
        # relance
        code, out = self.run_cli("enregistrer", "--club", cid, "--nom", nom, "--type", "relance",
                                 "--canal", "Email", "--appliquer")
        self.assertEqual(code, 0, out)
        self.assertEqual(self.recharger().club(int(cid))["Statut"], "Relancé")
        # réponse positive avec prochain pas daté
        code, out = self.run_cli("enregistrer", "--club", cid, "--nom", nom, "--type", "reponse",
                                 "--sentiment", "positif", "--resume", "Intéressé, échange le mois prochain",
                                 "--prochain-pas", "Proposer un appel", "--date-prochain-pas", "01/11/2026",
                                 "--appliquer")
        self.assertEqual(code, 0, out)
        crm = self.recharger()
        c3 = crm.club(int(cid))
        self.assertEqual((c3["Statut"], c3["Réponse reçue"]), ("En échange", "Oui"))
        self.assertEqual(crm.prochain_pas_date(c3), dt.date(2026, 11, 1))
        self.assertIsNone(crm.relance_due(c3))  # plus de relance automatique une fois en échange
        code, out = self.run_cli("relances")
        self.assertIn(c["Club"], out.split("PROCHAINS PAS DATÉS")[1])
        # historique jamais écrasé : les notes s'accumulent
        self.assertIn("DM test", c3["Notes"])
        self.assertIn("Intéressé", c3["Notes"])

    def test_refus_poli_en_echange_refus_definitif_sans_suite(self):
        # Règles de l'onglet Listes : refus poli = « En échange », refus explicite = « Sans suite ».
        relances = [c for c in self.crm.clubs if c["Statut"] == "Relancé"]
        if len(relances) < 2:
            self.skipTest("moins de 2 clubs relancés")
        c1, c2 = relances[:2]
        code, out = self.run_cli("enregistrer", "--club", str(c1["ID"]), "--nom", c1["Club"][:5], "--type", "reponse",
                                 "--sentiment", "refus-poli", "--resume", "Déjà quelqu'un pour la comm", "--appliquer")
        self.assertEqual(code, 0, out)
        r1 = self.recharger().club(int(c1["ID"]))
        self.assertEqual((r1["Statut"], r1["Réponse reçue"]), ("En échange", "Oui"))
        self.assertIn("refus poli", r1["Action maintenant"])
        code, out = self.run_cli("enregistrer", "--club", str(c2["ID"]), "--nom", c2["Club"][:5], "--type", "reponse",
                                 "--sentiment", "refus-definitif", "--resume", "Ne plus nous contacter", "--appliquer")
        self.assertEqual(code, 0, out)
        self.assertEqual(self.recharger().club(int(c2["ID"]))["Statut"], "Sans suite")
        code, out = self.run_cli("enregistrer", "--club", str(c2["ID"]), "--nom", c2["Club"][:5], "--type", "reponse",
                                 "--sentiment", "negatif", "--resume", "x")
        self.assertEqual(code, 2)

    def test_fidelite_graphiques_tableaux_formules(self):
        c = self.un_club("À contacter")
        self.run_cli("enregistrer", "--club", str(c["ID"]), "--nom", c["Club"][:6], "--type", "premier-contact",
                     "--canal", "Instagram", "--appliquer")
        a, b = zipfile.ZipFile(SOURCE), zipfile.ZipFile(self.f)
        self.assertEqual(sorted(a.namelist()), sorted(b.namelist()))
        for nom in a.namelist():
            if nom.startswith(("xl/charts/", "xl/tables/", "xl/drawings/", "xl/styles", "xl/sharedStrings")):
                self.assertEqual(a.read(nom), b.read(nom), nom)
        src, dst = k.Classeur(SOURCE), k.Classeur(self.f)
        for onglet in src.onglets:
            fa = {kk: v["f"] for kk, v in src.cellules(onglet).items() if v["f"]}
            fb = {kk: v["f"] for kk, v in dst.cellules(onglet).items() if v["f"]}
            self.assertEqual(fa, fb, f"formules modifiées dans {onglet}")
        self.assertIn('fullCalcOnLoad="1"', b.read("xl/workbook.xml").decode())

    # ── garde-fous ──
    def test_refus_exclu(self):
        c = self.un_club("Exclu", sans_date=False)
        code, out = self.run_cli("enregistrer", "--club", str(c["ID"]), "--nom", c["Club"][:5],
                                 "--type", "premier-contact", "--canal", "Instagram", "--appliquer")
        self.assertEqual(code, 2)
        self.assertIn("Exclu", out)

    def test_refus_mauvais_nom(self):
        c = self.un_club("À contacter")
        avant = empreinte(self.f)
        code, out = self.run_cli("enregistrer", "--club", str(c["ID"]), "--nom", "Zorglub",
                                 "--type", "premier-contact", "--canal", "Instagram", "--appliquer")
        self.assertEqual(code, 2)
        self.assertIn("Contrôle d'identité échoué", out)
        self.assertEqual(empreinte(self.f), avant)

    def test_refus_date_future_et_canal_hors_liste(self):
        c = self.un_club("À contacter")
        base = ["enregistrer", "--club", str(c["ID"]), "--nom", c["Club"][:5], "--type", "premier-contact"]
        code, out = self.run_cli(*base, "--canal", "Instagram", "--date", "01/01/2030", "--appliquer")
        self.assertEqual(code, 2)
        self.assertIn("futur", out)
        code, out = self.run_cli(*base, "--canal", "Pigeon voyageur", "--appliquer")
        self.assertEqual(code, 2)
        self.assertIn("hors liste", out)

    def test_refus_fichier_ouvert(self):
        c = self.un_club("À contacter")
        (self.dossier / "~$crm.xlsx").write_text("verrou")
        code, out = self.run_cli("enregistrer", "--club", str(c["ID"]), "--nom", c["Club"][:5],
                                 "--type", "premier-contact", "--canal", "Instagram", "--appliquer")
        self.assertEqual(code, 2)
        self.assertIn("ouvert", out)

    def test_refus_fichier_modifie_entre_lecture_et_ecriture(self):
        c = self.un_club("À contacter")
        crm = k.CRM(self.f, k.parse_date(JOUR))
        with open(self.f, "ab") as fh:
            fh.write(b" ")
        with self.assertRaises(k.ErreurCRM):
            k.ecrire_classeur(crm, {"Notes": "x"}, crm.club(int(c["ID"])), {})

    def test_refus_ecriture_formule(self):
        xml = '<row r="2"><c r="P2" s="1" t="str"><f>IF(1,"A","B")</f><v>A</v></c></row>'
        with self.assertRaises(k.ErreurCRM):
            k.patcher_feuille(xml, {"P2": "X"})
        crm = self.crm
        c = crm.clubs[0]
        with self.assertRaises(k.ErreurCRM):
            k.ecrire_classeur(crm, {"Priorité": "A+"}, c, {})

    def test_info_sans_source_ou_ecrasement_refuse(self):
        c = next(c for c in self.crm.clubs if "@" in str(c.get("Instagram exact") or ""))
        base = ["enregistrer", "--club", str(c["ID"]), "--nom", c["Club"][:5], "--type", "info",
                "--champ", "Instagram exact", "--valeur", "@autre_compte"]
        code, out = self.run_cli(*base, "--source", "test")
        self.assertEqual(code, 2)
        self.assertIn("--remplacer", out)
        c2 = next(c for c in self.crm.clubs if not c.get("Contact (prénom nom)") and c["Statut"] == "À contacter")
        code, out = self.run_cli("enregistrer", "--club", str(c2["ID"]), "--nom", c2["Club"][:5], "--type", "info",
                                 "--champ", "Contact (prénom nom)", "--valeur", "Jean Test")
        self.assertEqual(code, 2)
        self.assertIn("--source obligatoire", out)


if __name__ == "__main__":
    unittest.main()
