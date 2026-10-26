#!/usr/bin/env python3
"""
klubik_crm.py — accès fiable au fichier de prospection Klubik (xlsx).

Source unique de vérité : klubik-prospection-master (onglet « Clubs »).
Python 3.10+, bibliothèque standard uniquement (aucune installation).

Principes de sécurité :
  - Lecture seule par défaut. Toute commande d'écriture affiche d'abord un PLAN
    (cellule, avant → après) et n'écrit rien sans --appliquer.
  - Écriture chirurgicale : seules les cellules ciblées de l'onglet Clubs sont
    modifiées dans le XML ; graphiques, tableaux, formules, validations et autres
    onglets restent identiques à l'octet près.
  - Aucune commande de suppression n'existe. Aucune ligne n'est ajoutée.
  - Les cellules contenant une formule sont refusées en écriture.
  - Sauvegarde horodatée avant chaque écriture, relecture de vérification après,
    journal JSONL des modifications (avant/après).
  - « ÉCRIT ET VÉRIFIÉ » n'est affiché que si la relecture confirme l'écriture.

Usage : python3 crm/klubik_crm.py <commande> [options]   (aide : -h)
"""

from __future__ import annotations

import argparse
import datetime as dt
import difflib
import hashlib
import io
import json
import os
import re
import shutil
import sys
import tempfile
import unicodedata
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

ICI = Path(__file__).resolve().parent
RACINE = ICI.parent
FICHIER_DEFAUT = RACINE / "data" / "klubik-prospection-master.xlsx"

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
NS_REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
ONGLET_CLUBS = "Clubs"
ONGLET_LISTES = "Listes"

# Colonnes que l'outil a le droit de modifier (jamais une formule).
CHAMPS_SUIVI = [
    "Statut", "Historique Klubik", "Action maintenant", "Notes",
    "Date 1er contact", "Canal utilisé", "Dernier contact", "Réponse reçue",
    "Prochain pas", "Contact (prénom nom)", "Rôle du contact",
]
CHAMPS_INFO = [  # complétables via `enregistrer --type info`
    "Instagram exact", "Facebook exact / nom page", "Email public", "Site",
    "Canal recommandé", "Contact (prénom nom)", "Rôle du contact",
]
CHAMPS_DATE = {"Date 1er contact", "Dernier contact"}
STATUTS_FERMES = {"Exclu", "Client", "Sans suite"}
STATUTS_SUIVI_RELANCE = {"Contacté", "Relancé"}
EPOCH_EXCEL = dt.date(1899, 12, 30)


class ErreurCRM(Exception):
    """Erreur bloquante : rien n'a été écrit."""


# ─────────────────────────────── utilitaires ───────────────────────────────

def col_lettre(i: int) -> str:
    s = ""
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


def col_index(lettres: str) -> int:
    n = 0
    for ch in lettres:
        n = n * 26 + ord(ch) - 64
    return n


def split_ref(ref: str) -> tuple[str, int]:
    m = re.fullmatch(r"([A-Z]+)(\d+)", ref)
    return m.group(1), int(m.group(2))


def normaliser(txt) -> str:
    s = unicodedata.normalize("NFD", str(txt or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9@]+", " ", s.lower()).strip()


MOTS_GENERIQUES = {
    "handball", "hand", "ball", "hb", "hbc", "hbcl", "club", "de", "du", "des", "la", "le",
    "les", "l", "d", "et", "sport", "sports", "sportif", "sportive", "as", "us", "ac", "sc",
    "cs", "asso", "association", "amicale", "entente", "union", "olympique", "athletic",
}


def mots_significatifs(txt) -> list[str]:
    return [m for m in normaliser(txt).split() if m not in MOTS_GENERIQUES]


def serial_vers_date(v):
    if isinstance(v, (int, float)) and v > 0:
        return EPOCH_EXCEL + dt.timedelta(days=int(v))
    if isinstance(v, str):
        return parse_date(v, strict=False)
    return None


def date_vers_serial(d: dt.date) -> int:
    return (d - EPOCH_EXCEL).days


def parse_date(txt: str, strict: bool = True):
    txt = (txt or "").strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d/%m/%y", "%d-%m-%Y"):
        try:
            return dt.datetime.strptime(txt, fmt).date()
        except ValueError:
            pass
    if strict:
        raise ErreurCRM(f"Date illisible : « {txt} » (formats acceptés : JJ/MM/AAAA ou AAAA-MM-JJ)")
    return None


def fr(d) -> str:
    return d.strftime("%d/%m/%Y") if isinstance(d, dt.date) else ""


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def xml_echapper(s: str) -> str:
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;"))


# ─────────────────────────────── lecture xlsx ──────────────────────────────

class Classeur:
    """Lecture d'un xlsx sans dépendance. Ne calcule pas les formules :
    les valeurs dérivées sont recalculées en Python (voir Club)."""

    def __init__(self, chemin: Path):
        self.chemin = Path(chemin)
        if not self.chemin.exists():
            raise ErreurCRM(f"Fichier introuvable : {self.chemin}")
        self.octets = self.chemin.read_bytes()
        self.sha = hashlib.sha256(self.octets).hexdigest()
        try:
            self.zip = zipfile.ZipFile(io.BytesIO(self.octets))
        except zipfile.BadZipFile as e:
            raise ErreurCRM(f"Fichier illisible (xlsx corrompu ?) : {e}")
        self.chaines = self._lire_chaines()
        self.onglets = self._lire_onglets()  # nom -> chemin XML dans le zip

    def _lire_chaines(self) -> list[str]:
        if "xl/sharedStrings.xml" not in self.zip.namelist():
            return []
        racine = ET.fromstring(self.zip.read("xl/sharedStrings.xml"))
        return ["".join(t.text or "" for t in si.iter(f"{NS}t")) for si in racine.findall(f"{NS}si")]

    def _lire_onglets(self) -> dict[str, str]:
        wb = ET.fromstring(self.zip.read("xl/workbook.xml"))
        rels = ET.fromstring(self.zip.read("xl/_rels/workbook.xml.rels"))
        cibles = {r.get("Id"): r.get("Target") for r in rels}
        out = {}
        for s in wb.find(f"{NS}sheets"):
            cible = cibles[s.get(f"{NS_REL}id")].lstrip("/")
            out[s.get("name")] = cible if cible.startswith("xl/") else "xl/" + cible
        return out

    def cellules(self, onglet: str) -> dict[str, dict]:
        """coord -> {v: valeur, f: formule|None, s: style}"""
        if onglet not in self.onglets:
            raise ErreurCRM(f"Onglet « {onglet} » absent. Onglets : {', '.join(self.onglets)}")
        out = {}
        with self.zip.open(self.onglets[onglet]) as fh:
            for _, el in ET.iterparse(fh):
                if el.tag != f"{NS}c":
                    continue
                t = el.get("t", "n")
                f = el.find(f"{NS}f")
                v = el.find(f"{NS}v")
                txt = v.text if v is not None else None
                if t == "s" and txt is not None:
                    val = self.chaines[int(txt)]
                elif t == "inlineStr":
                    val = "".join(x.text or "" for x in el.iter(f"{NS}t"))
                elif t in ("str", "e"):
                    val = txt
                elif t == "b":
                    val = txt == "1"
                elif txt not in (None, ""):
                    n = float(txt)
                    val = int(n) if n.is_integer() else n
                else:
                    val = None
                out[el.get("r")] = {"v": val, "f": f.text if f is not None else None, "s": el.get("s")}
                el.clear()
        return out


# ─────────────────────────────── modèle CRM ────────────────────────────────

class CRM:
    def __init__(self, chemin: Path, aujourd_hui: dt.date | None = None):
        self.classeur = Classeur(chemin)
        self.chemin = self.classeur.chemin
        self.aujourd_hui = aujourd_hui or dt.date.today()
        self.cells = self.classeur.cellules(ONGLET_CLUBS)
        self._charger_clubs()
        self._charger_listes()

    def _charger_clubs(self):
        entetes = {}
        lignes = set()
        for coord, c in self.cells.items():
            col, lig = split_ref(coord)
            if lig == 1 and c["v"] not in (None, ""):
                entetes[str(c["v"]).strip()] = col
            lignes.add(lig)
        manquants = [h for h in ["ID", "Club", "Statut", "Score /10"] + CHAMPS_SUIVI if h not in entetes]
        if manquants:
            raise ErreurCRM(f"Colonnes attendues absentes de l'onglet Clubs : {manquants}")
        self.entetes = entetes  # nom -> lettre
        self.clubs: list[dict] = []
        for lig in sorted(l for l in lignes if l > 1):
            idc = self.cells.get(f"{entetes['ID']}{lig}", {}).get("v")
            if idc in (None, ""):
                continue
            club = {"_ligne": lig}
            for nom, col in entetes.items():
                club[nom] = self.cells.get(f"{col}{lig}", {}).get("v")
            self.clubs.append(club)
        self.par_id = {}
        for c in self.clubs:
            self.par_id.setdefault(int(c["ID"]), []).append(c)

    def _charger_listes(self):
        cells = self.classeur.cellules(ONGLET_LISTES)
        par_col: dict[str, dict[int, object]] = {}
        for coord, c in cells.items():
            col, lig = split_ref(coord)
            par_col.setdefault(col, {})[lig] = c["v"]

        def colonne(entete):
            for col, vals in par_col.items():
                if str(vals.get(1, "")).strip() == entete:
                    return [vals[k] for k in sorted(vals) if k > 1 and vals[k] not in (None, "")]
            return []

        self.statuts = [str(x) for x in colonne("Statuts")]
        self.canaux_envoi = [str(x) for x in colonne("Canaux d’envoi")]
        self.reponses = [str(x) for x in colonne("Réponse")]
        valeurs = None
        for col, vals in par_col.items():
            if str(vals.get(1, "")).strip() == "Valeur":
                valeurs = vals
        lab_col = next(c for c, v in par_col.items() if str(v.get(1, "")).strip() == "Paramètre")
        self.params = {}
        for lig, lab in par_col[lab_col].items():
            if lig > 1 and valeurs and isinstance(valeurs.get(lig), (int, float)):
                self.params[str(lab)] = valeurs[lig]
        self.delai_relance = int(self._param("Délai de relance", 7))
        self.objectif_semaine = int(self._param("Objectif premiers contacts", 10))
        self.seuils = (self._param("Seuil A+", 8.9), self._param("Seuil A (", 8), self._param("Seuil B", 6.5))
        if not self.statuts:
            raise ErreurCRM("Liste des statuts introuvable dans l'onglet Listes (colonne « Statuts »).")

    def _param(self, prefixe, defaut):
        for k, v in self.params.items():
            if k.startswith(prefixe):
                return v
        return defaut

    # ── valeurs dérivées (réplique des formules de l'onglet Clubs) ──

    def priorite(self, c) -> str:
        if c["Statut"] in STATUTS_FERMES:
            return ""
        s = c["Score /10"] if isinstance(c["Score /10"], (int, float)) else 0
        a_plus, a, b = self.seuils
        return "A+" if s >= a_plus else "A" if s >= a else "B" if s >= b else "C"

    def relance_due(self, c):
        if c["Statut"] not in STATUTS_SUIVI_RELANCE:
            return None
        base = serial_vers_date(c["Dernier contact"]) or serial_vers_date(c["Date 1er contact"])
        return base + dt.timedelta(days=self.delai_relance) if base else None

    @staticmethod
    def _reseau_ok(v) -> bool:
        v = str(v or "")
        return v != "" and "introuvable" not in v.lower() and v != "À vérifier"

    def joignable(self, c) -> bool:
        return (self._reseau_ok(c.get("Instagram exact")) or self._reseau_ok(c.get("Facebook exact / nom page"))
                or "@" in str(c.get("Email public") or ""))

    def contact_a_utiliser(self, c) -> str:
        email = str(c.get("Email public") or "")
        if c.get("Canal recommandé") == "Email" and "@" in email:
            return "Email " + email
        if self._reseau_ok(c.get("Instagram exact")):
            return "IG " + str(c["Instagram exact"])
        if self._reseau_ok(c.get("Facebook exact / nom page")):
            return "FB " + str(c["Facebook exact / nom page"])
        return "Email " + email if "@" in email else ""

    def pret_a_envoyer(self, c) -> bool:
        msg = str(c.get("Message prêt à copier") or "")
        return c["Statut"] == "À contacter" and msg != "" and "[Prénom]" not in msg and self.joignable(c)

    def alerte(self, c) -> str:
        st, msg = c["Statut"], str(c.get("Message prêt à copier") or "")
        if st in ("Contacté", "Relancé", "En échange", "Devis envoyé") and not c.get("Date 1er contact"):
            return "Date 1er contact manquante"
        if st in STATUTS_SUIVI_RELANCE and c.get("Réponse reçue") == "Oui":
            return "Réponse reçue : statut à mettre à jour"
        if st == "À contacter" and "entente" in str(c.get("Type structure") or "").lower():
            return "Entente non qualifiée"
        if st == "À contacter" and c.get("Canal recommandé") == "Email" and "@" not in str(c.get("Email public") or ""):
            return "Canal Email sans adresse"
        if st == "À contacter" and c.get("Canal recommandé") == "Instagram" and "@" not in str(c.get("Instagram exact") or ""):
            return "Canal Instagram sans compte"
        if st == "À contacter" and "[Prénom]" in msg:
            return "Prénom à compléter dans le message"
        return ""

    def prochain_pas_date(self, c):
        m = re.match(r"\s*(\d{1,2}/\d{1,2}/\d{4})", str(c.get("Prochain pas") or ""))
        return parse_date(m.group(1), strict=False) if m else None

    # ── recherche ──

    def chercher(self, requete: str, limite: int = 8) -> list[tuple[int, dict]]:
        q = requete.strip()
        if q.isdigit() and int(q) in self.par_id:
            return [(100, c) for c in self.par_id[int(q)]]
        qn, qsig = normaliser(q), mots_significatifs(q)
        res = []
        for c in self.clubs:
            nom = normaliser(c["Club"])
            score = 0
            if qn == nom:
                score = 100
            elif qn and qn in nom:
                score = 85
            ig = normaliser(c.get("Instagram exact"))
            if qn.startswith("@") and qn in ig.split():
                score = max(score, 95)
            sig = mots_significatifs(c["Club"])
            if qsig and sig:
                communs = sum(1 for m in qsig if any(m == s or (len(m) > 3 and s.startswith(m)) for s in sig))
                if communs:
                    score = max(score, 50 + int(40 * communs / len(qsig)) - 3 * max(0, len(sig) - communs))
                ratio = difflib.SequenceMatcher(None, " ".join(qsig), " ".join(sig)).ratio()
                score = max(score, int(ratio * 80))
            if score >= 45:
                res.append((score, c))
        res.sort(key=lambda x: (-x[0], x[1]["Club"]))
        return res[:limite]

    def club(self, id_club: int, nom_attendu: str | None = None) -> dict:
        lst = self.par_id.get(int(id_club), [])
        if not lst:
            raise ErreurCRM(f"Aucun club avec l'ID {id_club}.")
        if len(lst) > 1:
            raise ErreurCRM(f"ID {id_club} présent sur plusieurs lignes ({[c['_ligne'] for c in lst]}) : doublon à corriger avant toute écriture.")
        c = lst[0]
        if nom_attendu is not None:
            if not normaliser(nom_attendu) or normaliser(nom_attendu) not in normaliser(c["Club"]):
                raise ErreurCRM(f"Contrôle d'identité échoué : l'ID {id_club} correspond à « {c['Club']} », "
                                f"pas à « {nom_attendu} ». Rien n'a été écrit.")
        return c


# ─────────────────────────────── écriture ──────────────────────────────────

def _valeur_xml(coord: str, style: str | None, valeur) -> str:
    s = f' s="{style}"' if style is not None else ""
    if valeur is None or valeur == "":
        return f'<c r="{coord}"{s}/>'
    if isinstance(valeur, dt.date):
        return f'<c r="{coord}"{s} t="n"><v>{date_vers_serial(valeur)}</v></c>'
    if isinstance(valeur, (int, float)) and not isinstance(valeur, bool):
        return f'<c r="{coord}"{s} t="n"><v>{valeur}</v></c>'
    return f'<c r="{coord}"{s} t="inlineStr"><is><t xml:space="preserve">{xml_echapper(str(valeur))}</t></is></c>'


def patcher_feuille(xml: str, modifs: dict[str, object]) -> str:
    """Remplace uniquement les éléments <c> ciblés. Refuse toute cellule à formule."""
    for coord, valeur in modifs.items():
        motif = re.compile(rf'<c r="{coord}"(?P<attrs>[^>]*?)(?:/>|>(?P<corps>.*?)</c>)', re.S)
        m = motif.search(xml)
        if m:
            if m.group("corps") and "<f" in m.group("corps"):
                raise ErreurCRM(f"La cellule {coord} contient une formule : écriture refusée.")
            st = re.search(r'\bs="(\d+)"', m.group("attrs"))
            nouveau = _valeur_xml(coord, st.group(1) if st else None, valeur)
            xml = xml[:m.start()] + nouveau + xml[m.end():]
            continue
        # Cellule absente : insertion dans la ligne existante, à la bonne position.
        col, lig = split_ref(coord)
        mr = re.search(rf'<row r="{lig}"[^>]*?(?:/>|>(?P<corps>.*?)</row>)', xml, re.S)
        if not mr or mr.group(0).endswith("/>"):
            raise ErreurCRM(f"Ligne {lig} introuvable pour la cellule {coord} : écriture refusée.")
        corps_debut = mr.start("corps")
        pos = mr.end("corps")
        for mc in re.finditer(r'<c r="([A-Z]+)\d+"', mr.group("corps")):
            if col_index(mc.group(1)) > col_index(col):
                pos = corps_debut + mc.start()
                break
        # style : celui de la même colonne en ligne 2 si disponible
        ms = re.search(rf'<c r="{col}2"[^>]*?\bs="(\d+)"', xml)
        xml = xml[:pos] + _valeur_xml(coord, ms.group(1) if ms else None, valeur) + xml[pos:]
    return xml


# [^<]* : une formule ou une valeur échappée en XML ne contient jamais « < » → la regex
# ne peut pas déborder sur la cellule suivante (et reste linéaire).
RE_CACHE_FORMULE = re.compile(r'(<c\b[^>]*>)(<f\b[^>]*/>|<f\b[^>]*>[^<]*</f>)<v>[^<]*</v>(</c>)')


def invalider_caches(xml: str) -> str:
    """Retire la valeur en cache des cellules à formule (la formule reste intacte) :
    Excel, LibreOffice et Google Sheets recalculent alors tout à l'ouverture,
    au lieu d'afficher des compteurs périmés."""
    return RE_CACHE_FORMULE.sub(r"\1\2\3", xml)


def _est_feuille(nom: str) -> bool:
    return nom.startswith("xl/worksheets/sheet") and nom.endswith(".xml")


def ecrire_classeur(crm: CRM, modifs_par_champ: dict[str, object], club: dict, meta: dict) -> dict:
    """Écrit, vérifie, journalise. Retourne le rapport. Lève ErreurCRM sinon."""
    chemin = crm.chemin
    dossier = chemin.parent
    for verrou in (dossier / f"~${chemin.name}", dossier / f".~lock.{chemin.name}#"):
        if verrou.exists():
            raise ErreurCRM(f"Le fichier semble ouvert dans Excel/LibreOffice ({verrou.name}). "
                            "Fermez-le puis relancez : rien n'a été écrit.")
    if sha256(chemin) != crm.classeur.sha:
        raise ErreurCRM("Le fichier a changé depuis sa lecture : relancez la commande. Rien n'a été écrit.")

    lig = club["_ligne"]
    modifs = {}
    for champ, val in modifs_par_champ.items():
        if champ not in CHAMPS_SUIVI + CHAMPS_INFO:
            raise ErreurCRM(f"Champ non modifiable par l'outil : {champ}")
        coord = f"{crm.entetes[champ]}{lig}"
        if crm.cells.get(coord, {}).get("f"):
            raise ErreurCRM(f"{champ} ({coord}) est une formule : écriture refusée.")
        modifs[coord] = val

    src = zipfile.ZipFile(io.BytesIO(crm.classeur.octets))
    chemin_feuille = crm.classeur.onglets[ONGLET_CLUBS]
    xml = src.read(chemin_feuille).decode("utf-8")
    nouveau_xml = patcher_feuille(xml, modifs)
    wb_xml = src.read("xl/workbook.xml").decode("utf-8")
    if "fullCalcOnLoad" not in wb_xml:  # force le recalcul des formules à l'ouverture
        wb_xml = re.sub(r"<calcPr\b", '<calcPr fullCalcOnLoad="1"', wb_xml, count=1) if "<calcPr" in wb_xml \
            else wb_xml.replace("</workbook>", '<calcPr fullCalcOnLoad="1"/></workbook>')

    # Sauvegarde avant écriture
    horo = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    dossier_sauv = dossier / "sauvegardes"
    dossier_sauv.mkdir(exist_ok=True)
    sauvegarde = dossier_sauv / f"{chemin.stem}.{horo}.avant.xlsx"
    shutil.copy2(chemin, sauvegarde)

    fd, tmp = tempfile.mkstemp(suffix=".xlsx", dir=dossier)
    os.close(fd)
    tmp = Path(tmp)
    try:
        with zipfile.ZipFile(tmp, "w") as dst:
            for info in src.infolist():
                data = src.read(info.filename)
                if info.filename == chemin_feuille:
                    data = invalider_caches(nouveau_xml).encode("utf-8")
                elif _est_feuille(info.filename):
                    data = invalider_caches(data.decode("utf-8")).encode("utf-8")
                elif info.filename == "xl/workbook.xml":
                    data = wb_xml.encode("utf-8")
                dst.writestr(info, data, compress_type=info.compress_type)
        verifier_ecriture(crm, tmp, modifs)
        os.replace(tmp, chemin)
    except Exception:
        tmp.unlink(missing_ok=True)
        raise
    # Relecture du fichier final
    verifier_ecriture(crm, chemin, modifs)

    avant = {champ: club.get(champ) for champ in modifs_par_champ}
    for k, v in avant.items():
        if k in CHAMPS_DATE:
            avant[k] = fr(serial_vers_date(v)) if v else v
    apres = {k: (fr(v) if isinstance(v, dt.date) else v) for k, v in modifs_par_champ.items()}
    entree = {
        "horodatage": dt.datetime.now().isoformat(timespec="seconds"),
        "fichier": chemin.name, "club_id": int(club["ID"]), "club": club["Club"], "ligne": lig,
        **meta, "avant": avant, "apres": apres,
        "sha_avant": crm.classeur.sha, "sha_apres": sha256(chemin), "sauvegarde": sauvegarde.name,
    }
    with open(dossier / "journal-crm.jsonl", "a", encoding="utf-8") as j:
        j.write(json.dumps(entree, ensure_ascii=False) + "\n")
    return entree


def verifier_ecriture(crm: CRM, chemin: Path, modifs: dict[str, object]):
    nouveau = Classeur(chemin)
    cells = nouveau.cellules(ONGLET_CLUBS)
    for coord, attendu in modifs.items():
        lu = cells.get(coord, {}).get("v")
        if isinstance(attendu, dt.date):
            ok = isinstance(lu, (int, float)) and serial_vers_date(lu) == attendu
        else:
            ok = (lu if lu is not None else "") == (attendu if attendu is not None else "")
        if not ok:
            raise ErreurCRM(f"Vérification échouée sur {coord} : attendu {attendu!r}, lu {lu!r}. Fichier d'origine conservé.")
    # Tous les onglets : mêmes formules partout, mêmes valeurs saisies hors cellules ciblées.
    for onglet in crm.classeur.onglets:
        avant = crm.cells if onglet == ONGLET_CLUBS else crm.classeur.cellules(onglet)
        apres = cells if onglet == ONGLET_CLUBS else nouveau.cellules(onglet)
        for coord, c in avant.items():
            if onglet == ONGLET_CLUBS and coord in modifs:
                continue
            n = apres.get(coord)
            identique = n is not None and n["f"] == c["f"] and (c["f"] is not None or n["v"] == c["v"])
            if not identique:
                raise ErreurCRM(f"Vérification échouée : {onglet}!{coord} a changé alors qu'elle n'était pas ciblée.")
    # Graphiques, tableaux, styles, chaînes partagées… : identiques à l'octet près.
    a, b = zipfile.ZipFile(io.BytesIO(crm.classeur.octets)), zipfile.ZipFile(chemin)
    if sorted(a.namelist()) != sorted(b.namelist()):
        raise ErreurCRM("Vérification échouée : la liste des composants du fichier a changé.")
    for nom in a.namelist():
        if _est_feuille(nom) or nom == "xl/workbook.xml":
            continue
        if a.read(nom) != b.read(nom):
            raise ErreurCRM(f"Vérification échouée : {nom} a été modifié.")


# ─────────────────────────────── affichage ─────────────────────────────────

def entete_rapport(crm: CRM) -> str:
    m = dt.datetime.fromtimestamp(crm.chemin.stat().st_mtime)
    return (f"Fichier : {crm.chemin.name} (modifié le {m:%d/%m/%Y %H:%M}, empreinte {crm.classeur.sha[:10]})\n"
            f"Date de référence : {fr(crm.aujourd_hui)}")


def ligne_club(crm: CRM, c: dict, extra: str = "") -> str:
    return (f"[ID {c['ID']}] {c['Club']} — {c['Statut']}"
            f"{' · prio ' + crm.priorite(c) if crm.priorite(c) else ''} · score {c['Score /10']}"
            f" · {c.get('Niveau') or ''} {c.get('Divisions') or ''}{extra}")


def cmd_verifier(crm: CRM, a):
    print(entete_rapport(crm))
    print(f"Onglets ({len(crm.classeur.onglets)}) : {', '.join(crm.classeur.onglets)}")
    print(f"Clubs : {len(crm.clubs)} lignes · {len(crm.entetes)} colonnes")
    print(f"Statuts autorisés (Listes) : {', '.join(crm.statuts)}")
    print(f"Canaux d'envoi (Listes) : {', '.join(crm.canaux_envoi)}")
    print(f"Paramètres : délai de relance {crm.delai_relance} j · objectif {crm.objectif_semaine} premiers contacts/semaine · seuils A+/A/B {crm.seuils}")
    formules = sorted({split_ref(k)[0] for k, c in crm.cells.items() if c['f']}, key=col_index)
    noms = {v: k for k, v in crm.entetes.items()}
    print("Colonnes calculées (protégées) : " + ", ".join(f"{l} {noms.get(l, '')}" for l in formules))
    doublons = [i for i, l in crm.par_id.items() if len(l) > 1]
    print(f"IDs en double : {doublons or 'aucun'}")
    for verrou in (crm.chemin.parent / f"~${crm.chemin.name}", crm.chemin.parent / f".~lock.{crm.chemin.name}#"):
        if verrou.exists():
            print(f"⚠ Fichier ouvert ailleurs ({verrou.name}) : écritures bloquées tant qu'il l'est.")
    print("ACCÈS LECTURE : OK")


def cmd_chercher(crm: CRM, a):
    res = crm.chercher(" ".join(a.texte), a.n)
    if not res:
        print(f"Aucun club ne correspond à « {' '.join(a.texte)} ».")
        return
    for score, c in res:
        print(f"{score:>3} %  " + ligne_club(crm, c, f" · {c.get('Instagram exact') or ''}"))
    if len(res) > 1 and res[0][0] - res[1][0] < 10 or res[0][0] < 70:
        print("⚠ AMBIGU : plusieurs correspondances proches ou correspondance faible. Confirmer l'ID avant toute mise à jour.")
    else:
        print(f"Meilleure correspondance : ID {res[0][1]['ID']} ({res[0][1]['Club']}).")


CHAMPS_FICHE = [
    "Niveau", "Divisions", "Poule(s)", "Type structure", "Statut", "Score /10", "Historique Klubik",
    "Canal recommandé", "Instagram exact", "Confiance IG", "Facebook exact / nom page", "Email public", "Site",
    "Contact (prénom nom)", "Rôle du contact", "Signal récent / transformation", "Diagnostic / pain point",
    "Angle commercial dominant", "Action maintenant", "Date 1er contact", "Canal utilisé", "Dernier contact",
    "Réponse reçue", "Prochain pas", "Confiance analyse", "Notes", "Message prêt à copier",
    "Message v1 (archive)", "Variante test",
]


def cmd_fiche(crm: CRM, a):
    c = crm.club(a.id)
    print(entete_rapport(crm))
    print(f"FICHE — [ID {c['ID']}] {c['Club']} (ligne {c['_ligne']} de l'onglet Clubs)")
    for k in CHAMPS_FICHE:
        v = c.get(k)
        if k in CHAMPS_DATE:
            v = fr(serial_vers_date(v))
        if v not in (None, ""):
            print(f"- {k} : {v}")
    print("Calculé :")
    print(f"- Priorité : {crm.priorite(c) or '—'} · Joignable : {'Oui' if crm.joignable(c) else 'Non'} · "
          f"Contact à utiliser : {crm.contact_a_utiliser(c) or '—'} · Prêt à envoyer : {'Oui' if crm.pret_a_envoyer(c) else 'Non'}")
    due = crm.relance_due(c)
    if due:
        print(f"- Relance due le : {fr(due)}{' (EN RETARD)' if due <= crm.aujourd_hui else ''}")
    if crm.alerte(c):
        print(f"- Alerte : {crm.alerte(c)}")
    print(f"- Renseignement : {statut_intel(int(c['ID']), crm.aujourd_hui)} (détail : commande `intel {c['ID']}`)")
    j = lire_journal(crm, int(c["ID"]))
    if j:
        print("Journal des modifications (outil) :")
        for e in j:
            print(f"- {e['horodatage']} · {e.get('type')} · {e.get('resume') or ''} · {e['apres']}")


def stats(crm: CRM) -> dict:
    cs = crm.clubs
    st = {}
    for c in cs:
        st[c["Statut"]] = st.get(c["Statut"], 0) + 1
    contactes = sum(1 for c in cs if c["Statut"] in ("Contacté", "Relancé", "En échange", "Devis envoyé", "Sans suite")
                    or (c["Statut"] == "Client" and c.get("Date 1er contact")))
    repondu = sum(1 for c in cs if c["Statut"] in ("En échange", "Devis envoyé")
                  or (c["Statut"] == "Client" and c.get("Date 1er contact")) or c.get("Réponse reçue") == "Oui")
    lundi = crm.aujourd_hui - dt.timedelta(days=crm.aujourd_hui.weekday())
    semaine = [c for c in cs if (d := serial_vers_date(c.get("Date 1er contact"))) and lundi <= d <= crm.aujourd_hui]
    return {
        "actifs": len(cs) - st.get("Exclu", 0),
        "joignables": sum(1 for c in cs if crm.joignable(c) and c["Statut"] != "Exclu"),
        "contactes": contactes, "ont_repondu": repondu, "clients": st.get("Client", 0),
        "relances_en_retard": sum(1 for c in cs if (d := crm.relance_due(c)) and d <= crm.aujourd_hui),
        "statuts": dict(sorted(st.items(), key=lambda x: -x[1])),
        "premiers_contacts_semaine": len(semaine), "lundi": lundi,
        "prets": sum(1 for c in cs if crm.pret_a_envoyer(c)),
    }


def cmd_point(crm: CRM, a):
    s = stats(crm)
    print(entete_rapport(crm))
    print("FAITS (calculés depuis l'onglet Clubs) :")
    print(f"- Clubs actifs {s['actifs']} · joignables {s['joignables']} · contactés {s['contactes']} · "
          f"ont répondu {s['ont_repondu']} · clients {s['clients']} · relances en retard {s['relances_en_retard']}")
    print("- Statuts : " + " · ".join(f"{k} {v}" for k, v in s["statuts"].items()))
    print(f"- Premiers contacts depuis le lundi {fr(s['lundi'])} : {s['premiers_contacts_semaine']} / objectif {crm.objectif_semaine}")
    print(f"- « À contacter » avec message prêt à envoyer (sans [Prénom]) : {s['prets']}")
    cmd_relances(crm, a, entete=False)
    alertes = {}
    for c in crm.clubs:
        if (al := crm.alerte(c)):
            alertes[al] = alertes.get(al, 0) + 1
    if alertes:
        print("ALERTES (règles de la colonne Alerte) : " + " · ".join(f"{k} {v}" for k, v in alertes.items()))


def cmd_relances(crm: CRM, a, entete=True):
    if entete:
        print(entete_rapport(crm))
    horizon = crm.aujourd_hui + dt.timedelta(days=getattr(a, "horizon", 7))
    retard, avenir, rdv = [], [], []
    for c in crm.clubs:
        d = crm.relance_due(c)
        if d and d <= crm.aujourd_hui:
            retard.append((d, c))
        elif d and d <= horizon:
            avenir.append((d, c))
        p = crm.prochain_pas_date(c)
        if p and p <= horizon and c["Statut"] not in STATUTS_FERMES - {"Client"}:
            rdv.append((p, c))
    print(f"RELANCES EN RETARD ({len(retard)}) :")
    for d, c in sorted(retard, key=lambda x: x[0]):
        print(f"- dues le {fr(d)} ({(crm.aujourd_hui - d).days} j) · " + ligne_club(crm, c, _suivi(crm, c)))
    print(f"RELANCES À VENIR d'ici le {fr(horizon)} ({len(avenir)}) :")
    for d, c in sorted(avenir, key=lambda x: x[0]):
        print(f"- le {fr(d)} · " + ligne_club(crm, c, _suivi(crm, c)))
    print(f"PROCHAINS PAS DATÉS d'ici le {fr(horizon)} ({len(rdv)}) :")
    for d, c in sorted(rdv, key=lambda x: x[0]):
        print(f"- le {fr(d)} · " + ligne_club(crm, c, f" · {c['Prochain pas']}"))


def _suivi(crm, c):
    return (f" · 1er contact {fr(serial_vers_date(c.get('Date 1er contact'))) or '?'}"
            f" · dernier {fr(serial_vers_date(c.get('Dernier contact'))) or '—'}"
            f" · canal {c.get('Canal utilisé') or 'INCONNU'} · contact : {crm.contact_a_utiliser(c) or '—'}")


def cmd_prioritaires(crm: CRM, a):
    print(entete_rapport(crm))
    cands = [c for c in crm.clubs if c["Statut"] == "À contacter"]
    if a.niveau:
        cands = [c for c in cands if normaliser(a.niveau) in normaliser(c.get("Niveau"))]
    if a.division:
        cands = [c for c in cands if normaliser(a.division) in normaliser(c.get("Divisions"))]
    if a.prets:
        cands = [c for c in cands if crm.pret_a_envoyer(c)]
    cands.sort(key=lambda c: (-(c["Score /10"] or 0), int(c["ID"])))
    print(f"À CONTACTER — {len(cands)} clubs correspondent ; top {min(a.n, len(cands))} par score :")
    for c in cands[:a.n]:
        extra = (f" · {crm.contact_a_utiliser(c) or 'NON JOIGNABLE'} · prêt : {'Oui' if crm.pret_a_envoyer(c) else 'Non'}"
                 f" · {statut_intel(int(c['ID']), crm.aujourd_hui)}"
                 f"{' · ⚠ ' + crm.alerte(c) if crm.alerte(c) else ''}")
        print("- " + ligne_club(crm, c, extra))
        if a.details:
            print(f"    angle : {c.get('Angle commercial dominant') or '—'}")
            print(f"    action : {c.get('Action maintenant') or '—'}")


def cmd_qualite(crm: CRM, a):
    print(entete_rapport(crm))
    def groupes(cle):
        g = {}
        for c in crm.clubs:
            k = cle(c)
            if k:
                g.setdefault(k, []).append(c)
        return [v for v in g.values() if len(v) > 1]
    print("DOUBLONS POSSIBLES (à vérifier, rien n'est fusionné automatiquement) :")
    n = 0
    for titre, cle in [("nom", lambda c: normaliser(c["Club"])),
                       ("Instagram", lambda c: normaliser(c.get("Instagram exact")) if "@" in str(c.get("Instagram exact") or "") else None),
                       ("email", lambda c: str(c.get("Email public") or "").lower() if "@" in str(c.get("Email public") or "") else None)]:
        for g in groupes(cle):
            n += 1
            print(f"- même {titre} : " + " | ".join(f"ID {c['ID']} {c['Club']} ({c['Statut']})" for c in g))
    if not n:
        print("- aucun")
    print("INCOHÉRENCES DE SUIVI :")
    k = 0
    for c in crm.clubs:
        pb = []
        if c["Statut"] in ("Contacté", "Relancé", "En échange", "Devis envoyé") and not c.get("Canal utilisé"):
            pb.append("canal du contact non renseigné")
        d1, dl = serial_vers_date(c.get("Date 1er contact")), serial_vers_date(c.get("Dernier contact"))
        if d1 and dl and dl < d1:
            pb.append("dernier contact antérieur au 1er contact")
        if (d1 and d1 > crm.aujourd_hui) or (dl and dl > crm.aujourd_hui):
            pb.append("date de contact dans le futur")
        if c["Statut"] == "Relancé" and not dl:
            pb.append("statut Relancé sans date de dernier contact")
        if c["Statut"] in ("À contacter", "À qualifier") and d1:
            pb.append("date de 1er contact renseignée mais statut non contacté")
        if crm.alerte(c) in ("Date 1er contact manquante", "Réponse reçue : statut à mettre à jour"):
            pb.append(crm.alerte(c))
        if pb:
            k += 1
            print(f"- ID {c['ID']} {c['Club']} ({c['Statut']}) : " + " ; ".join(pb))
    if not k:
        print("- aucune")
    a_contacter = [c for c in crm.clubs if c["Statut"] == "À contacter"]
    print("INFORMATIONS MANQUANTES (clubs « À contacter ») :")
    print(f"- non joignables (aucun IG/FB/email confirmé) : {sum(1 for c in a_contacter if not crm.joignable(c))}")
    print(f"- sans message préparé : {sum(1 for c in a_contacter if not c.get('Message prêt à copier'))}")
    print(f"- message avec [Prénom] à compléter : {sum(1 for c in a_contacter if '[Prénom]' in str(c.get('Message prêt à copier') or ''))}")
    print(f"- sans interlocuteur nommé : {sum(1 for c in a_contacter if not c.get('Contact (prénom nom)'))}")
    print(f"- canal recommandé « À vérifier » : {sum(1 for c in a_contacter if c.get('Canal recommandé') == 'À vérifier')}")


# ─────────────────────────── renseignement (Jojo) ──────────────

# Dossiers produits par Jojo, liés à l'ID du club, hors du xlsx
# (aucun changement de structure du CRM) : data/intelligence/<ID>_<AAAA-MM-JJ>.json
DOSSIER_INTEL = Path(os.environ.get("KLUBIK_INTEL_DOSSIER", RACINE / "data" / "intelligence"))
CATEGORIES_INTEL = {"identite", "dirigeants", "sportif", "actualite", "communication"}
FIABILITES = {"haute", "moyenne", "faible"}
STATUTS_FAIT = {"verifie", "interpretation"}
FRAICHEUR = ((30, "FRAIS"), (90, "À REVÉRIFIER"))  # au-delà : PÉRIMÉ
ACTUALITE_ANCIENNE_JOURS = 180


def _date_iso(v):
    if v in (None, ""):
        return None
    try:
        return dt.date.fromisoformat(str(v))
    except ValueError:
        return False


def valider_dossier(d: dict, aujourd_hui: dt.date) -> tuple[list[str], list[str]]:
    """Retourne (erreurs bloquantes, avertissements)."""
    err, avert = [], []
    for cle in ("club_id", "club", "verifie_le", "sources_consultees", "faits", "top3", "ne_pas_utiliser", "limites"):
        if cle not in d:
            err.append(f"champ obligatoire absent : {cle}")
    if err:
        return err, avert
    v = _date_iso(d["verifie_le"])
    if not v:
        err.append("verifie_le doit être une date AAAA-MM-JJ")
    elif v > aujourd_hui:
        err.append("verifie_le est dans le futur")
    ids = {}
    for f in d["faits"]:
        fid = f.get("id", "?")
        ids[fid] = f
        for cle in ("fait", "categorie", "source_url", "fiabilite", "statut"):
            if not f.get(cle):
                err.append(f"fait {fid} : champ {cle} manquant")
        if f.get("source_url") and not str(f["source_url"]).startswith(("http://", "https://")):
            err.append(f"fait {fid} : source_url n'est pas une URL")
        if f.get("categorie") and f["categorie"] not in CATEGORIES_INTEL:
            err.append(f"fait {fid} : catégorie hors liste ({', '.join(sorted(CATEGORIES_INTEL))})")
        if f.get("fiabilite") and f["fiabilite"] not in FIABILITES:
            err.append(f"fait {fid} : fiabilité hors liste (haute/moyenne/faible)")
        if f.get("statut") and f["statut"] not in STATUTS_FAIT:
            err.append(f"fait {fid} : statut hors liste (verifie/interpretation)")
        df = _date_iso(f.get("date_fait"))
        if df is False:
            err.append(f"fait {fid} : date_fait doit être AAAA-MM-JJ ou null")
        elif df and df > aujourd_hui:
            err.append(f"fait {fid} : date_fait dans le futur")
        elif f.get("categorie") == "actualite":
            if not df:
                avert.append(f"fait {fid} : actualité sans date — ne pas la présenter comme récente")
            elif (aujourd_hui - df).days > ACTUALITE_ANCIENNE_JOURS:
                avert.append(f"fait {fid} : actualité de plus de {ACTUALITE_ANCIENNE_JOURS} jours ({df}) — ancienne")
    if len(d["top3"]) > 3:
        err.append("top3 contient plus de 3 éléments")
    for t in d["top3"]:
        f = ids.get(t.get("fait_id"))
        if not f:
            err.append(f"top3 : fait_id {t.get('fait_id')} inexistant")
            continue
        if f.get("statut") != "verifie":
            avert.append(f"top3 : {t['fait_id']} est une interprétation, pas un fait vérifié")
        if f.get("fiabilite") == "faible":
            avert.append(f"top3 : {t['fait_id']} a une fiabilité faible")
        for cle in ("interet", "angle", "accroche"):
            if not t.get(cle):
                err.append(f"top3 {t['fait_id']} : champ {cle} manquant")
    if not d["top3"] and not d.get("aucune_info_pertinente"):
        err.append("top3 vide : renseigner aucune_info_pertinente = true si rien de fiable n'a été trouvé")
    for p in d.get("interlocuteurs", []):
        if not p.get("source_url"):
            err.append(f"interlocuteur {p.get('nom', '?')} : source_url obligatoire")
    return err, avert


def dossiers_intel(id_club: int | None = None) -> dict[int, list[Path]]:
    out: dict[int, list[Path]] = {}
    if not DOSSIER_INTEL.exists():
        return out
    for p in DOSSIER_INTEL.glob("*_*.json"):
        m = re.fullmatch(r"(\d+)_(\d{4}-\d{2}-\d{2})", p.stem)
        if m and (id_club is None or int(m.group(1)) == id_club):
            out.setdefault(int(m.group(1)), []).append(p)
    for k in out:
        out[k].sort()
    return out


def fraicheur(verifie_le: dt.date, aujourd_hui: dt.date) -> str:
    age = (aujourd_hui - verifie_le).days
    for seuil, libelle in FRAICHEUR:
        if age <= seuil:
            return f"{libelle} ({age} j)"
    return f"PÉRIMÉ ({age} j)"


def charger_intel(id_club: int, aujourd_hui: dt.date):
    """Dernier dossier du club : (chemin, dossier, fraîcheur) ou None."""
    lst = dossiers_intel(id_club).get(id_club)
    if not lst:
        return None
    p = lst[-1]
    try:
        d = json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise ErreurCRM(f"Dossier {p.name} illisible (JSON invalide) : {e}")
    v = _date_iso(d.get("verifie_le")) or None
    return p, d, (fraicheur(v, aujourd_hui) if v else "date de vérification invalide")


def statut_intel(id_club: int, aujourd_hui: dt.date) -> str:
    try:
        r = charger_intel(id_club, aujourd_hui)
    except ErreurCRM:
        return "dossier illisible"
    return f"intel {r[2]}" if r else "pas d'intel"


def cmd_intel(crm: CRM, a):
    c = crm.club(a.id)
    r = charger_intel(int(c["ID"]), crm.aujourd_hui)
    print(f"RENSEIGNEMENT — [ID {c['ID']}] {c['Club']}")
    if not r:
        print("Aucun dossier. À demander à Jojo.")
        return
    p, d, fr_ = r
    print(f"Dossier : {DOSSIER_INTEL.name}/{p.name} · vérifié le {d.get('verifie_le')} · fraîcheur : {fr_}")
    if int(d.get("club_id", -1)) != int(c["ID"]):
        print(f"⚠ Le dossier indique club_id {d.get('club_id')} : incohérence, ne pas l'utiliser.")
    err, avert = valider_dossier(d, crm.aujourd_hui)
    for e in err:
        print(f"✗ {e}")
    for w in avert:
        print(f"⚠ {w}")
    if d.get("aucune_info_pertinente"):
        print("Aucune information fiable et pertinente trouvée (selon le dossier).")
    faits = {f["id"]: f for f in d["faits"] if "id" in f}
    for i, t in enumerate(d.get("top3", []), 1):
        f = faits.get(t.get("fait_id"), {})
        print(f"\n{i}. {f.get('fait')}")
        print(f"   Source : {f.get('source_nom') or ''} {f.get('source_url')} · date : {f.get('date_fait') or 'non datée'}"
              f" · fiabilité : {f.get('fiabilite')} · {f.get('statut')}")
        print(f"   Intérêt : {t.get('interet')}")
        print(f"   Angle Klubik : {t.get('angle')}")
        print(f"   Accroche : {t.get('accroche')}")
    for cle, titre in (("accroche_recommandee", "Accroche recommandée"), ("objectif_personnalisation", "Objectif")):
        if d.get(cle):
            print(f"\n{titre} : {d[cle]}")
    if d.get("arguments"):
        print("Arguments : " + " · ".join(d["arguments"]))
    if d.get("interlocuteurs"):
        print("Interlocuteurs publics : " + " · ".join(
            f"{x.get('nom')} ({x.get('role')}, source {x.get('source_url')})" for x in d["interlocuteurs"]))
    if d.get("ne_pas_utiliser"):
        print("Ne pas utiliser : " + " · ".join(f"{x.get('element')} ({x.get('raison')})" for x in d["ne_pas_utiliser"]))
    print(f"Limites : {d.get('limites')}")
    print(f"Fichier complet (lisible par Bililou) : {p}")


def cmd_intel_liste(crm: CRM, a):
    tous = dossiers_intel()
    if not tous:
        print("Aucun dossier de renseignement.")
        return
    for cid, lst in sorted(tous.items()):
        nom = crm.par_id.get(cid, [{"Club": "ID INCONNU DANS LE CRM"}])[0]["Club"]
        print(f"[ID {cid}] {nom} · {len(lst)} version(s) · {statut_intel(cid, crm.aujourd_hui)}")


def cmd_intel_verifier(crm: CRM, a):
    cible = Path(a.cible)
    if not cible.exists() and a.cible.isdigit():
        r = charger_intel(int(a.cible), crm.aujourd_hui)
        if not r:
            raise ErreurCRM(f"Aucun dossier pour l'ID {a.cible}.")
        cible = r[0]
    try:
        d = json.loads(cible.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        raise ErreurCRM(f"Dossier illisible : {e}")
    err, avert = valider_dossier(d, crm.aujourd_hui)
    if not err:
        c = crm.club(int(d["club_id"]))
        if normaliser(d["club"]) not in normaliser(c["Club"]) and normaliser(c["Club"]) not in normaliser(d["club"]):
            err.append(f"club « {d['club']} » ≠ CRM « {c['Club']} » pour l'ID {d['club_id']}")
        m = re.fullmatch(r"(\d+)_(\d{4}-\d{2}-\d{2})", cible.stem)
        if not m or int(m.group(1)) != int(d["club_id"]) or m.group(2) != d["verifie_le"]:
            err.append(f"nom de fichier attendu : {d['club_id']}_{d['verifie_le']}.json")
    for e in err:
        print(f"✗ {e}")
    for w in avert:
        print(f"⚠ {w}")
    if err:
        raise ErreurCRM(f"dossier {cible.name} NON VALIDE ({len(err)} erreur(s)).")
    print(f"DOSSIER VALIDE : {cible.name} ({len(d['faits'])} faits, {len(d['top3'])} accroches, {len(avert)} avertissement(s)).")


def lire_journal(crm: CRM, id_club: int | None = None) -> list[dict]:
    p = crm.chemin.parent / "journal-crm.jsonl"
    if not p.exists():
        return []
    out = [json.loads(l) for l in p.read_text(encoding="utf-8").splitlines() if l.strip()]
    return [e for e in out if id_club is None or e.get("club_id") == id_club]


def cmd_journal(crm: CRM, a):
    j = lire_journal(crm, a.club)
    if not j:
        print("Journal vide (aucune écriture effectuée par l'outil).")
    for e in j[-a.n:]:
        print(f"{e['horodatage']} · ID {e['club_id']} {e['club']} · {e.get('type')} · avant {e['avant']} → après {e['apres']} · sauvegarde {e['sauvegarde']}")


# ─────────────────────────────── enregistrer ───────────────────────────────

TYPES = ["premier-contact", "relance", "reponse", "rdv", "devis", "client", "sans-suite", "note",
         "prochain-pas", "statut", "info"]
SENTIMENTS = ["positif", "neutre", "question", "refus-poli", "refus-definitif"]


def ajout_note(notes, date: dt.date, texte: str) -> str:
    entree = f"{fr(date)} : {texte}"
    notes = str(notes or "").strip()
    return f"{notes} | {entree}" if notes else entree


def planifier(crm: CRM, c: dict, a) -> tuple[dict, list[str]]:
    """Construit les modifications selon les règles de l'onglet Listes. Lève ErreurCRM si interdit."""
    t = a.type
    st = c["Statut"]
    date = parse_date(a.date) if a.date else crm.aujourd_hui
    if date > crm.aujourd_hui and t not in ("prochain-pas",):
        raise ErreurCRM(f"La date {fr(date)} est dans le futur : une interaction ne peut pas être enregistrée avant d'avoir eu lieu.")
    resume = (a.resume or "").strip()
    avert = []
    m: dict[str, object] = {}

    def exiger_canal():
        if not a.canal:
            raise ErreurCRM(f"--canal obligatoire pour « {t} » (valeurs : {', '.join(crm.canaux_envoi)}).")
        if a.canal not in crm.canaux_envoi:
            raise ErreurCRM(f"Canal « {a.canal} » hors liste. Valeurs autorisées : {', '.join(crm.canaux_envoi)}.")

    def prochain_pas():
        if a.prochain_pas or a.date_prochain_pas:
            dp = parse_date(a.date_prochain_pas) if a.date_prochain_pas else None
            txt = (a.prochain_pas or "Recontacter").strip()
            m["Prochain pas"] = f"{fr(dp)} – {txt}" if dp else txt
            m["Action maintenant"] = m["Prochain pas"]

    if st == "Exclu" and t not in ("note", "info", "statut"):
        raise ErreurCRM(f"{c['Club']} est « Exclu » (règle Listes : jamais de message). Aucune interaction enregistrée.")

    if t == "premier-contact":
        exiger_canal()
        if st == "Client":
            raise ErreurCRM("Club client : pas de premier contact de prospection (règle : suivi / upsell uniquement).")
        if st in ("Contacté", "Relancé", "En échange", "Devis envoyé", "Sans suite"):
            raise ErreurCRM(f"Statut actuel « {st} » : ce club a déjà été contacté. Utiliser --type relance ou reponse.")
        if c.get("Date 1er contact"):
            raise ErreurCRM("Date 1er contact déjà renseignée : refus d'écraser l'historique.")
        if st == "À qualifier":
            if not a.forcer:
                raise ErreurCRM("Statut « À qualifier » (règle Listes : pas d'envoi tant que l'entité n'est pas confirmée). "
                                "Si le club a bien été contacté, relancer avec --forcer.")
            avert.append("Club « À qualifier » passé en Contacté sur demande explicite (--forcer).")
        due = date + dt.timedelta(days=crm.delai_relance)
        m.update({"Statut": "Contacté", "Date 1er contact": date, "Canal utilisé": a.canal, "Dernier contact": date,
                  "Action maintenant": f"Attendre la réponse – relance prévue le {fr(due)}"})
        hist = str(c.get("Historique Klubik") or "")
        if hist.startswith("Jamais contacté"):  # on garde la suite éventuelle (ex. « – concept fictif »)
            m["Historique Klubik"] = hist.replace("Jamais contacté", f"Contacté le {fr(date)} ({a.canal})", 1)
        m["Notes"] = ajout_note(c.get("Notes"), date, f"premier contact {a.canal}" + (f" – {resume}" if resume else ""))
    elif t == "relance":
        exiger_canal()
        if st not in STATUTS_SUIVI_RELANCE:
            raise ErreurCRM(f"Relance possible seulement depuis Contacté/Relancé (statut actuel : « {st} »).")
        if not c.get("Date 1er contact"):
            avert.append("Date 1er contact manquante : à compléter (le CRM affiche déjà une alerte).")
        if not c.get("Canal utilisé"):
            avert.append("Canal du 1er contact inconnu : non renseigné automatiquement (il pourrait différer de celui de la relance).")
        due = date + dt.timedelta(days=crm.delai_relance)
        m.update({"Statut": "Relancé", "Dernier contact": date,
                  "Action maintenant": f"Attendre la réponse – prochaine relance possible le {fr(due)}"})
        m["Notes"] = ajout_note(c.get("Notes"), date, f"relance {a.canal}" + (f" – {resume}" if resume else ""))
    elif t == "reponse":
        if not resume:
            raise ErreurCRM("--resume obligatoire : résumer fidèlement la réponse reçue.")
        if a.sentiment not in SENTIMENTS:
            raise ErreurCRM(f"--sentiment obligatoire : {' | '.join(SENTIMENTS)}.")
        # Règles de l'onglet Listes : « En échange » = le club a répondu, même par un refus poli ;
        # « Sans suite » = refus explicite (définitif) ou demande de ne plus être contacté.
        if st == "Client":
            avert.append("Club déjà client : statut conservé.")
        elif a.sentiment == "refus-definitif":
            m["Statut"] = "Sans suite"
            m["Action maintenant"] = "Ne plus relancer (refus explicite)"
        else:
            m["Statut"] = "En échange" if st != "Devis envoyé" else "Devis envoyé"
            if a.sentiment == "refus-poli" and not (a.prochain_pas or a.date_prochain_pas):
                m["Action maintenant"] = "Ne pas relancer sans élément nouveau (refus poli)"
        m.update({"Réponse reçue": "Oui", "Dernier contact": date})
        if a.canal:
            exiger_canal()
        m["Notes"] = ajout_note(c.get("Notes"), date, f"réponse reçue ({a.sentiment}{', ' + a.canal if a.canal else ''}) – {resume}")
        prochain_pas()
        if a.sentiment in ("positif", "neutre", "question") and "Prochain pas" not in m:
            avert.append("Aucun prochain pas renseigné : en proposer un (--prochain-pas, --date-prochain-pas).")
    elif t in ("rdv", "devis", "client", "sans-suite"):
        cible = {"rdv": "En échange", "devis": "Devis envoyé", "client": "Client", "sans-suite": "Sans suite"}[t]
        if st == "À contacter" and t != "sans-suite":
            avert.append("Le club n'avait aucun contact enregistré : vérifier l'historique (date du 1er contact ?).")
        m["Statut"] = cible
        if t != "sans-suite":
            m["Dernier contact"] = date
        libelle = {"rdv": "rendez-vous / échange", "devis": "devis envoyé", "client": "devient client",
                   "sans-suite": "classé sans suite"}[t]
        m["Notes"] = ajout_note(c.get("Notes"), date, libelle + (f" – {resume}" if resume else ""))
        if t == "client":
            m["Action maintenant"] = "Client Klubik – suivi / upsell uniquement"
        if t == "sans-suite":
            m["Action maintenant"] = "Ne plus relancer (sans suite)"
        prochain_pas()
    elif t == "note":
        if not resume:
            raise ErreurCRM("--resume obligatoire pour une note.")
        m["Notes"] = ajout_note(c.get("Notes"), date, resume)
    elif t == "prochain-pas":
        if not (a.prochain_pas or a.date_prochain_pas):
            raise ErreurCRM("--prochain-pas et/ou --date-prochain-pas obligatoire.")
        prochain_pas()
    elif t == "statut":
        if a.statut not in crm.statuts:
            raise ErreurCRM(f"Statut « {a.statut} » hors liste. Valeurs : {', '.join(crm.statuts)}.")
        if not resume:
            raise ErreurCRM("--resume obligatoire : motif du changement de statut.")
        m["Statut"] = a.statut
        m["Notes"] = ajout_note(c.get("Notes"), date, f"statut {st} → {a.statut} – {resume}")
    elif t == "info":
        if a.champ not in CHAMPS_INFO:
            raise ErreurCRM(f"--champ doit être l'un de : {', '.join(CHAMPS_INFO)}.")
        if not a.valeur:
            raise ErreurCRM("--valeur obligatoire.")
        actuel = c.get(a.champ)
        if actuel not in (None, "", "À vérifier") and not a.remplacer and "introuvable" not in str(actuel).lower():
            raise ErreurCRM(f"« {a.champ} » contient déjà « {actuel} » : ajouter --remplacer pour l'écraser (ancienne valeur journalisée).")
        if not a.source:
            raise ErreurCRM("--source obligatoire (d'où vient l'information ? ex. « Timothé, DM du 26/10 »). On n'invente aucune donnée.")
        m[a.champ] = a.valeur
        m["Notes"] = ajout_note(c.get("Notes"), date, f"{a.champ} = {a.valeur} (source : {a.source})")
    else:
        raise ErreurCRM(f"Type inconnu : {t}")

    # Validation finale contre les listes de l'onglet Listes
    if "Statut" in m and m["Statut"] not in crm.statuts:
        raise ErreurCRM(f"Statut « {m['Statut']} » absent de l'onglet Listes : règle à mettre à jour avant écriture.")
    if "Réponse reçue" in m and crm.reponses and m["Réponse reçue"] not in crm.reponses:
        raise ErreurCRM("Valeur de réponse hors liste.")
    # Ne garder que les vraies modifications
    m = {k: v for k, v in m.items() if not _identique(c.get(k), v)}
    return m, avert


def _identique(ancien, nouveau) -> bool:
    if isinstance(nouveau, dt.date):
        return serial_vers_date(ancien) == nouveau
    return (ancien if ancien is not None else "") == nouveau


def cmd_enregistrer(crm: CRM, a):
    c = crm.club(a.club, a.nom)
    modifs, avert = planifier(crm, c, a)
    print(entete_rapport(crm))
    print(f"CLUB : [ID {c['ID']}] {c['Club']} (ligne {c['_ligne']}) · statut actuel « {c['Statut']} »")
    if not modifs:
        print("Aucune modification nécessaire (valeurs déjà à jour). Rien n'a été écrit.")
        return
    print("PLAN DE MODIFICATION :")
    for k, v in modifs.items():
        av = c.get(k)
        if k in CHAMPS_DATE:
            av = fr(serial_vers_date(av))
        apres = fr(v) if isinstance(v, dt.date) else v
        print(f"- {k} ({crm.entetes[k]}{c['_ligne']}) : « {av if av not in (None, '') else '(vide)'} » → « {apres} »")
    for w in avert:
        print(f"⚠ {w}")
    if "Statut" in modifs and modifs["Statut"] in STATUTS_SUIVI_RELANCE:
        base = modifs.get("Dernier contact") or serial_vers_date(c.get("Dernier contact"))
        if isinstance(base, dt.date):
            print(f"→ Relance due (formule du fichier) : {fr(base + dt.timedelta(days=crm.delai_relance))}")
    if not a.appliquer:
        print("SIMULATION : rien n'a été écrit. Pour appliquer après validation : relancer la même commande avec --appliquer.")
        return
    rapport = ecrire_classeur(crm, modifs, c, {"type": a.type, "resume": a.resume, "canal": a.canal})
    print(f"ÉCRIT ET VÉRIFIÉ : {len(modifs)} cellule(s) modifiée(s), relues dans le fichier. "
          f"Sauvegarde avant écriture : sauvegardes/{rapport['sauvegarde']} · journal : journal-crm.jsonl")


def cmd_structure(crm: CRM, a):
    print(entete_rapport(crm))
    noms = {v: k for k, v in crm.entetes.items()}
    for lettre in sorted(noms, key=col_index):
        nom = noms[lettre]
        vals = [c.get(nom) for c in crm.clubs]
        rempli = sum(1 for v in vals if v not in (None, ""))
        formule = any(crm.cells.get(f"{lettre}{c['_ligne']}", {}).get("f") for c in crm.clubs[:5])
        role = "calculée" if formule else ("suivi (modifiable)" if nom in CHAMPS_SUIVI else
                                           "info (complétable)" if nom in CHAMPS_INFO else "lecture seule")
        print(f"{lettre:>3} {nom} — {rempli}/{len(vals)} remplis — {role}")


# ─────────────────────────────── CLI ───────────────────────────────────────

def construire_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="klubik_crm", description="Accès fiable au fichier de prospection Klubik.")
    p.add_argument("--fichier", default=os.environ.get("KLUBIK_CRM_FICHIER", str(FICHIER_DEFAUT)),
                   help="chemin du xlsx (défaut : data/klubik-prospection-master.xlsx ou $KLUBIK_CRM_FICHIER)")
    p.add_argument("--aujourdhui", help="date de référence JJ/MM/AAAA (tests)")
    sp = p.add_subparsers(dest="cmd", required=True)
    sp.add_parser("verifier", help="contrôle d'accès et de structure")
    sp.add_parser("structure", help="colonnes de l'onglet Clubs et leur rôle")
    s = sp.add_parser("chercher", help="retrouver un club (nom, @instagram ou ID)")
    s.add_argument("texte", nargs="+"); s.add_argument("--n", type=int, default=8)
    s = sp.add_parser("fiche", help="fiche complète d'un club"); s.add_argument("id", type=int)
    s = sp.add_parser("point", help="synthèse chiffrée de la prospection"); s.add_argument("--horizon", type=int, default=7)
    s = sp.add_parser("relances", help="relances en retard / à venir"); s.add_argument("--horizon", type=int, default=7)
    s = sp.add_parser("prioritaires", help="clubs à contacter, triés par score")
    s.add_argument("--n", type=int, default=10); s.add_argument("--niveau"); s.add_argument("--division")
    s.add_argument("--prets", action="store_true", help="seulement les messages prêts à envoyer")
    s.add_argument("--details", action="store_true")
    sp.add_parser("qualite", help="doublons, incohérences, informations manquantes")
    s = sp.add_parser("intel", help="dernier dossier de renseignement d'un club"); s.add_argument("id", type=int)
    sp.add_parser("intel-liste", help="clubs ayant un dossier de renseignement, avec fraîcheur")
    s = sp.add_parser("intel-verifier", help="valider un dossier (chemin du JSON ou ID du club)"); s.add_argument("cible")
    s = sp.add_parser("journal", help="modifications effectuées par l'outil")
    s.add_argument("--club", type=int); s.add_argument("--n", type=int, default=30)
    s = sp.add_parser("enregistrer", help="préparer (simulation) ou appliquer une mise à jour")
    s.add_argument("--club", type=int, required=True, help="ID du club (colonne A)")
    s.add_argument("--nom", required=True, help="fragment du nom attendu (contrôle d'identité)")
    s.add_argument("--type", required=True, choices=TYPES)
    s.add_argument("--date", help="date de l'interaction (défaut : aujourd'hui)")
    s.add_argument("--canal"); s.add_argument("--resume"); s.add_argument("--sentiment")
    s.add_argument("--prochain-pas"); s.add_argument("--date-prochain-pas")
    s.add_argument("--statut"); s.add_argument("--champ"); s.add_argument("--valeur"); s.add_argument("--source")
    s.add_argument("--remplacer", action="store_true"); s.add_argument("--forcer", action="store_true")
    s.add_argument("--appliquer", action="store_true", help="écrit réellement (sinon simulation)")
    return p


COMMANDES = {
    "verifier": cmd_verifier, "structure": cmd_structure, "chercher": cmd_chercher, "fiche": cmd_fiche,
    "point": cmd_point, "relances": cmd_relances, "prioritaires": cmd_prioritaires, "qualite": cmd_qualite,
    "journal": cmd_journal, "enregistrer": cmd_enregistrer,
    "intel": cmd_intel, "intel-liste": cmd_intel_liste, "intel-verifier": cmd_intel_verifier,
}


def main(argv=None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    a = construire_parser().parse_args(argv)
    try:
        jour = parse_date(a.aujourdhui) if a.aujourdhui else None
        crm = CRM(Path(a.fichier), jour)
        COMMANDES[a.cmd](crm, a)
        return 0
    except ErreurCRM as e:
        print(f"ÉCHEC : {e}")
        return 2


if __name__ == "__main__":
    sys.exit(main())
