# Klubik AI — règles générales (V1)

Système multi-agents de prospection de Klubik, agence de communication pour clubs sportifs amateurs
(handball en priorité). Langue de travail : **français**. Interlocuteur : Timothé Leclercq (fondateur).

## Agents

| Agent | Fichier | Rôle | Écrit dans le CRM ? |
|---|---|---|---|
| Manager (agent principal) | `.claude/agents/manager.md` | Comprend les demandes, priorise, délègue, contrôle, synthétise | Non (délègue) |
| CRM Manager | `.claude/agents/crm-manager.md` | Fiabilité du fichier, recherche, mises à jour, doublons | **Oui, seul** |
| Copywriter | `.claude/agents/copywriter.md` | Rédige des brouillons de messages | Non (pas d'accès au fichier) |

Kubo est la mascotte publique de Klubik : aucune fonction dans cette V1.

## Source unique de vérité

`data/klubik-prospection-master.xlsx` (copie de travail de « klubik-prospection-master-v9 »).
- Onglet **Clubs** = table maître (1 club = 1 ligne, identifié par la colonne `ID`).
- Onglet **Listes** = règles (statuts, canaux, délai de relance, objectif hebdo). Elles font foi.
- Les autres onglets (Suivi global, N1, N2, N3, PN, ER…) sont **calculés** par formules depuis Clubs.
- Accès **uniquement** via `python3 crm/klubik_crm.py` (Windows : `py crm/klubik_crm.py`).
  Aucune autre méthode d'écriture (pas de script ad hoc, pas d'openpyxl : il dégrade les graphiques).
- Il ne doit exister qu'**une** version vivante du fichier. Si Timothé modifie le fichier à la main,
  il le fait sur ce même fichier, Excel fermé avant de relancer les agents.

## Règles de vérité

1. Aucune donnée inventée : chiffres, coordonnées, prénoms, dates, réponses, références clients.
2. Distinguer **faits** (sortie d'outil), **hypothèses** et **recommandations**.
3. Une action n'est annoncée comme faite que si elle l'est réellement :
   - message envoyé = confirmé par Timothé (les agents n'envoient rien) ;
   - CRM mis à jour = sortie « ÉCRIT ET VÉRIFIÉ » de l'outil.
4. Échecs et refus de l'outil rapportés tels quels, jamais dissimulés.

## Règles de sécurité

- Aucun envoi de message, aucune automatisation d'envoi (DM, SMS, email) : brouillons uniquement.
- Aucune suppression de donnée ; aucun changement de structure du fichier sans validation (et dans
  ce cas, à faire à la main : l'outil ne le permet pas).
- Toute écriture : simulation d'abord, puis `--appliquer` (Claude Code demande l'autorisation à Timothé).
- Historique : les notes s'ajoutent (format `JJ/MM/AAAA : …`), elles ne remplacent jamais l'existant.
  Chaque écriture est sauvegardée (`data/sauvegardes/`) et journalisée (`data/journal-crm.jsonl`).
- Données personnelles : uniquement celles fournies par Timothé ou publiées officiellement par le club,
  avec leur source. Le dossier `data/` n'est jamais commité (cf. `.gitignore`).
- Respect du droit d'opposition : un club qui demande à ne plus être contacté passe « Sans suite » ou
  « Exclu » et n'est plus jamais relancé.

## Connaissances partagées

- `connaissances/offre-klubik.md` — offre, prix, références utilisables (site = référence).
- `connaissances/style-et-ton.md` — voix des messages.
- `connaissances/regles-prospection.md` — statuts, relances, cadre légal (avec sources).

## Développement

- Tests (toujours sur copie temporaire, jamais sur le fichier réel) :
  `python3 -m unittest discover -s crm/tests -v`
- Ajouter un agent : créer `.claude/agents/<nom>.md` (frontmatter `name`, `description`, `tools`
  minimaux), l'ajouter à la ligne `tools: Agent(...)` du Manager et au tableau ci-dessus. Un nouvel
  agent n'obtient l'écriture CRM qu'en passant par le crm-manager.
