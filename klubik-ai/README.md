# Klubik AI — V1

Trois agents Claude Code qui travaillent sur **votre** fichier de prospection :

- **Manager** (agent principal) : c'est à lui que vous parlez. Il fait le point, priorise, délègue et
  vous présente des messages prêts à valider.
- **CRM Manager** : retrouve les clubs, vérifie, enregistre les contacts/relances/réponses. Seul à écrire.
- **Copywriter** : rédige les brouillons (DM, emails, SMS, relances, réponses aux objections).

Rien n'est jamais envoyé automatiquement. Rien n'est écrit dans le fichier sans votre autorisation.

## Installation (une fois)

1. **Python 3.10+** installé (`python3 --version`, ou `py --version` sous Windows). Aucune librairie à installer.
2. Copier le fichier de prospection (l'unique version vivante) ici :
   `klubik-ai/data/klubik-prospection-master.xlsx`
   (ou définir `KLUBIK_CRM_FICHIER=chemin/vers/le/fichier.xlsx`).
3. Vérifier l'accès : depuis `klubik-ai/`, `python3 crm/klubik_crm.py verifier` → doit finir par `ACCÈS LECTURE : OK`.
4. Lancer `claude` **depuis le dossier `klubik-ai/`** et accepter la fenêtre « faire confiance à ce dossier »
   (sinon les autorisations de lecture du projet sont ignorées et Claude vous demandera chaque commande).

## Lancer les agents

```bash
cd klubik-ai
claude
```

L'en-tête affiche `@manager` : vous parlez directement au Manager (réglage `"agent": "manager"` dans
`.claude/settings.json`). Pour travailler sur le code du site, lancez plutôt `claude` depuis la racine du dépôt.

## Au quotidien

Parlez normalement, par exemple :

- « Fais-moi le point sur la prospection. »
- « Quels clubs dois-je relancer cette semaine ? »
- « Prépare un premier message pour Annecy CSAV. »
- « Voici la réponse du président de X : "…". Propose une réponse. »
- « J'ai envoyé un DM Instagram à ALC Longvic aujourd'hui. »
- « Ajoute au CRM : le contact chez Rueil est Paul Martin, responsable comm (il me l'a dit par DM). »
- « Quels prospects sont les plus intéressants actuellement ? »
- « Qu'est-ce qu'on pourrait améliorer dans notre prospection ? »
- « Manager, regarde notre fichier de prospection, indique-moi les clubs à relancer, prépare les
  messages adaptés et donne-moi tes recommandations. »

Le cycle normal :
1. Le Manager vous propose des brouillons → vous les copiez-collez et les envoyez **vous-même**.
2. Vous lui dites ce que vous avez **réellement** envoyé → le CRM Manager prépare la mise à jour
   (simulation affichée), puis Claude Code vous demande l'autorisation d'écrire → vous acceptez.
3. La réponse finit par « ÉCRIT ET VÉRIFIÉ » : la modification est faite et relue dans le fichier.

**Fermez le fichier dans Excel** avant de demander une mise à jour (l'outil refuse d'écrire sinon).

## Sécurité intégrée

| Garde-fou | Où |
|---|---|
| Simulation par défaut, écriture seulement avec `--appliquer` | `crm/klubik_crm.py` |
| Autorisation demandée à chaque écriture (`--appliquer`, `--remplacer`, `--forcer`) | `.claude/settings.json` (`ask`) |
| Contrôle d'identité du club (ID + fragment du nom) | outil |
| Formules, graphiques, tableaux, autres onglets jamais modifiés (vérifié après chaque écriture) | outil |
| Sauvegarde avant écriture + journal avant/après | `data/sauvegardes/`, `data/journal-crm.jsonl` |
| Aucune commande de suppression ; pas d'ajout/suppression de colonnes ou d'onglets | outil |
| Copywriter sans accès au fichier ni au shell | `.claude/agents/copywriter.md` |
| `data/` exclu de git, `/klubik-ai/*` bloqué sur le site public | `.gitignore`, `netlify.toml` |

Revenir en arrière : fermer Excel, remplacer le fichier par la sauvegarde voulue de `data/sauvegardes/`.

## Fichiers

```
klubik-ai/
├── CLAUDE.md                     règles communes à tous les agents
├── .claude/settings.json         agent principal + permissions
├── .claude/agents/               manager.md · crm-manager.md · copywriter.md
├── connaissances/                offre, style et ton, règles de prospection (sourcées)
├── crm/klubik_crm.py             accès au fichier (lecture, recherche, mises à jour sûres)
├── crm/tests/test_crm.py         14 tests, toujours sur copie temporaire
└── data/                         VOTRE fichier + sauvegardes + journal (hors git)
```
