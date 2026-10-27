# Klubik AI HQ

Application web privée (PWA, iPhone d'abord) qui héberge l'équipe d'agents IA de Klubik : **Kung** (manager), **Popi** (CRM), **Jojo** (club intelligence), **Bililou** (copywriter).
Elle tourne dans le cloud : ton ordinateur peut rester éteint.

> Statut : première version. Le moteur, le CRM, l'authentification et l'interface sont testés.
> **Les réponses réelles des agents n'ont pas encore été testées** : elles ont besoin de la clé API Claude, qui n'est pas configurée.

## Architecture

```
iPhone / ordinateur (Safari, PWA)
        │  HTTPS, cookie de session signé
        ▼
Render — service web Node (Next.js 15)          ← toujours allumé (offre Starter)
  ├─ pages + API (toutes privées sauf /login, /setup, /api/health)
  └─ moteur des missions (même processus) : file de tâches en base,
     1 étape = 1 appel Claude + outils, sauvegardée de façon atomique
        │                                   │
        ▼                                   ▼
Supabase Postgres (Francfort)          API Claude (Anthropic)
  CRM (source officielle), journal,      Opus 5.5, recherche/lecture web
  conversations, missions, actions,      (côté Anthropic, pour Jojo)
  coûts, archive du fichier Excel
```

- **Persistance** : chaque message, mission, étape et proposition est en base. Fermer Safari ne change rien. Après un redémarrage du serveur, une étape interrompue reprend à l'expiration de son bail (15 min). Elle échoue proprement après 5 interruptions.
- **Délégation** : Kung appelle l'outil `deleguer`, ce qui crée des tâches enfants pour Popi, Jojo ou Bililou. Elles s'exécutent en parallèle. Kung reprend quand toutes ont répondu, y compris en cas d'échec : il reçoit alors l'erreur.
- **Validation** : aucun agent n'écrit dans le CRM et aucun n'envoie de message. Popi *propose* une mise à jour (avant → après), Bililou *enregistre* un brouillon. Dans « Actions », tu valides, refuses, copies, ou confirmes « J'ai envoyé ». Seule cette confirmation enregistre le contact dans le CRM, selon les règles de l'onglet Listes.
- **Verrou de version** : si une fiche a changé entre la proposition et ta validation, rien n'est écrit.
- **Journal** : chaque écriture est relue après coup, et sa vérification est consignée dans `crm_journal`.

## Ce qui fonctionne et ce qui est testé

| Fonction | État |
|---|---|
| Connexion, mot de passe via /setup, session 30 jours, blocage après 5 échecs | ✅ testé (navigateur + tests unitaires) |
| Import du fichier Excel : aperçu → confirmation → vérification de chaque cellule | ✅ testé sur le vrai fichier (727 clubs, 0 écart) |
| Règles CRM (priorités, relances, alertes, mises à jour) | ✅ parité avec l'outil Python validé (> 50 000 cellules comparées) |
| Export Excel (fichier d'origine + valeurs à jour, formules recalculées) | ✅ testé, ouvert et recalculé par LibreOffice |
| Moteur : délégation parallèle, reprise après coupure, erreurs réseau, plafonds de coût | ✅ testé avec un **faux** modèle scripté (aucun appel réel) |
| Validation des actions (CRM, brouillons, « J'ai envoyé ») | ✅ testé |
| Réponses réelles des agents, recherche web de Jojo | ⏳ à tester dès que la clé API sera configurée |
| Avatars officiels | ⏳ emplacements prêts (`avatar` dans `src/lib/agents/definitions.ts`) |
| Pièces jointes (captures d'écran dans le chat) | ❌ pas encore disponible |
| Envoi de messages aux clubs | ❌ volontairement impossible : c'est toi qui envoies |

## Coûts

| Poste | Type | Montant |
|---|---|---|
| Render Starter (serveur toujours allumé, 512 Mo) | fixe | 7 $/mois |
| Supabase Free (Postgres 500 Mo) | fixe | 0 $ |
| API Claude Opus 5.5 | à l'usage | 4 $ / M tokens en entrée, 20 $ / M en sortie (cache : 0,20 $ / M en lecture) |
| Recherche web (Jojo) | à l'usage | 10 $ / 1 000 recherches |

Garde-fous intégrés :
- plafond mensuel de 30 $ ;
- plafond par mission de 3 $ ;
- 30 étapes maximum par tâche ;
- coût estimé visible dans Réglages.

Fixe aussi une limite de dépense dans la console Anthropic : c'est la protection officielle.

## Déploiement (faisable depuis l'iPhone)

Les secrets se saisissent **uniquement** dans les tableaux de bord Supabase, Render et Anthropic, jamais dans une conversation.

1. **Supabase** : crée un projet, région *Central EU (Frankfurt)*. Choisis un mot de passe de base solide et garde-le dans ton trousseau. Ensuite, *Connect* → copie la chaîne **Session pooler**.
2. **Anthropic** : dans la console, crée une clé API (*API keys*). Fixe une limite de dépense mensuelle (*Limits*).
3. **Render** : *New* → *Blueprint* → choisis le dépôt GitHub `Klubik` et la branche. Render lit `render.yaml` et te demande :
   - `DATABASE_URL` : la chaîne Supabase. Remplace `[YOUR-PASSWORD]` par ton mot de passe, en encodant les caractères spéciaux.
   - `ANTHROPIC_API_KEY` : tu peux la laisser vide et l'ajouter plus tard.
   - `OWNER_EMAIL` : ton email.

   `SESSION_SECRET` et `SETUP_TOKEN` sont générés automatiquement. Valide : c'est l'étape payante (Starter, 7 $/mois).
4. Une fois le service *Live* : dans Render → *Environment*, copie la valeur de `SETUP_TOKEN`. Ouvre ensuite `https://<ton-service>.onrender.com/setup` et choisis ton mot de passe (12 caractères minimum). La page se désactive ensuite.
5. Connecte-toi → **Réglages** → importe `klubik-prospection-master-v9.xlsx` → vérifie l'aperçu → confirme. À partir de là, **la base est la source officielle**. Le fichier Excel devient une archive, et l'export « Télécharger en Excel » sert de sauvegarde.
6. Safari → Partager → **Sur l'écran d'accueil**.

Le schéma de la base s'applique tout seul au démarrage du serveur : il n'y a pas de migration à lancer.

## Sécurité

- Un seul compte. Mot de passe haché avec scrypt. Cookie de session `httpOnly`, `Secure` et `SameSite=Lax`, signé HMAC-SHA256.
- Toutes les pages et API sont privées. Le middleware ferme l'accès, et chaque route API revérifie la session.
- Les clés restent côté serveur, en variables d'environnement. La base est accessible uniquement par le serveur : RLS est activé sans politique, ce qui coupe l'API publique de Supabase.
- Les agents ont des droits limités : chacun n'a que ses outils, et aucun n'écrit dans le CRM sans ta validation.
- Le contenu lu sur le web est traité comme une donnée, jamais comme une instruction.
- En-têtes : `X-Frame-Options: DENY` et `noindex`.
- Limite connue : le blocage après 5 échecs vaut aussi globalement. Quelqu'un qui connaît l'adresse peut donc te bloquer la connexion 15 minutes. Il ne peut pas entrer pour autant.

## Développement local

```bash
cd klubik-ai-hq
npm ci
cp .env.example .env.local   # puis renseigner une base Postgres locale
npm run dev
npm run typecheck
npm test                      # tests unitaires (auth) ; les suivants s'activent avec :
# KLUBIK_TEST_DB=postgres://…/base_jetable   (ENTIÈREMENT vidée par les tests)
# KLUBIK_XLSX=…/klubik-prospection-master-v9.xlsx   KLUBIK_REF=…/ref
```

Les agents reprennent les prompts et les règles de `klubik-ai/` (la V1 sous Claude Code). Les connaissances partagées se trouvent dans `knowledge/`.
