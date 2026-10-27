# Klubik AI HQ

Application web privée (PWA, iPhone d'abord) qui héberge l'équipe d'agents IA de Klubik : **Kung** (manager), **Popi** (CRM), **Jojo** (club intelligence), **Bililou** (copywriter). Elle tourne dans le cloud : ton ordinateur peut rester éteint.

> **Statut.** Le moteur, le CRM, la sécurité, les sauvegardes et l'interface sont testés.
> Les tests du moteur et de bout en bout ont tourné avec un **faux modèle** qui reproduit le protocole de l'API Claude.
> **La qualité des réponses réelles des agents n'a donc pas encore été évaluée** : il faut pour cela la clé API.

## Architecture

```
iPhone / ordinateur (Safari, PWA)
        │  HTTPS, cookie de session signé + cookie « appareil de confiance »
        ▼
Render — service web Node (Next.js 15), offre Starter, toujours allumé
  ├─ pages + API (toutes privées sauf /login, /setup, /api/health)
  ├─ moteur des missions : file de tâches en base, 1 étape = 1 appel Claude + outils, sauvegardée atomiquement
  └─ tâches de fond : sauvegardes automatiques, purge des captures expirées
        │                         │                               │
        ▼                         ▼                               ▼
Supabase Postgres (Francfort)   API Claude (Anthropic)          Stockage S3 externe (Backblaze B2)
  CRM officiel, journal,          Sonnet 5.5 / Haiku 5.5,         sauvegardes chiffrées, toutes
  conversations, missions,        Opus 5.5 à la demande,          versions conservées, relues
  captures, 30 sauvegardes        recherche web (Jojo)            après chaque envoi
```

## Ce que fait l'application

| Fonction | Détail |
|---|---|
| **Agents** | Chat avec chacun des 4 agents, historique synchronisé iPhone ↔ ordinateur. Kung délègue en parallèle et attend les résultats. |
| **Missions persistantes** | Tout est en base : fermer Safari ne change rien. Après une coupure de la base, une mission reprend dès son retour. Après un redémarrage du serveur, elle reprend à l'expiration de son bail. |
| **Captures d'écran** | Bouton image dans le chat. L'iPhone redimensionne l'image (2048 px max) et la réencode en JPEG, ce qui supprime la géolocalisation et les métadonnées. Kung transmet les captures à Bililou et Popi (`captures`). Elles sont conservées 180 jours (réglable), puis seules leurs métadonnées restent. |
| **Validation** | Aucun agent n'écrit dans le CRM, aucun n'envoie de message. L'écran « Actions » liste les mises à jour à valider et les brouillons à copier. « J'ai envoyé » enregistre le contact selon les règles de l'onglet Listes. |
| **Popi sans IA** | Boutons ⚡ (Point du jour, Relances, À contacter, Qualité, Chercher un club). Le résultat est calculé par les règles du CRM : 0 $, aucun appel au modèle. |
| **CRM** | Import vérifié cellule par cellule (727 clubs, 0 écart). Verrou de version et journal. Export Excel fidèle (formules recalculées). **Comparer un fichier Excel avec la base** pour vérifier l'absence de divergence. |
| **Sauvegardes** | Automatiques : chaque jour, et dans l'heure qui suit une modification du CRM, plus après l'import et avant une restauration. Chiffrées en AES-256-GCM. 30 versions gardées en base, toutes gardées en externe, chaque copie externe relue et vérifiée. Restauration en 2 temps (aperçu puis mot de passe). Reconstruction complète d'une base perdue depuis l'iPhone. |
| **Coûts** | Modèle par agent et plafonds réglables dans l'app. Coût réel de chaque mission affiché à la fin (tokens facturés × tarifs publics). Alertes à 80 % puis 100 % du plafond mensuel. |
| **Sécurité** | Appareils de confiance : une attaque ne peut pas bloquer tes appareils. Révocation des appareils, déconnexion générale, changement de mot de passe, protection contre les requêtes venant d'autres sites. |
| **Diagnostic** | Réglages → mémoire, moteur, base, sauvegardes (aussi en JSON sur `/api/diagnostic`). |

## Modèles et coûts

| Poste | Type | Prix |
|---|---|---|
| Render Starter (512 Mo, toujours allumé) | fixe | 7 $/mois |
| Supabase Free (Postgres 500 Mo) | fixe | 0 $ |
| Backblaze B2 (10 Go gratuits ; environ 1,1 Mo par sauvegarde) | fixe | 0 $ au début ; au-delà de 10 Go, voir le tarif B2 |
| Claude Sonnet 5.5 : Kung, Jojo, Bililou | à l'usage | 2 $ / M tokens en entrée, 10 $ / M en sortie |
| Claude Haiku 5.5 : Popi | à l'usage | 0,10 $ / 0,50 $ par M tokens (prompt ≤ 100 000 tokens) |
| Claude Opus 5.5 : « réflexion approfondie », sur demande, message par message | à l'usage | 4 $ / 20 $ par M tokens |
| Recherche web (Jojo) | à l'usage | 10 $ / 1 000 recherches |

Estimations, à confirmer par les premières missions réelles :

| Mission | Coût estimé |
|---|---|
| Réponse instantanée de Popi | 0 $ |
| Question simple à Kung | 0,02 à 0,05 $ |
| Capture Instagram analysée, mise à jour CRM et réponse proposée | 0,10 à 0,25 $ |
| Recherche Jojo sur un club | 0,20 à 0,50 $ |

Le plafond par mission (3 $ par défaut) peut couper une mission « 5 clubs avec recherche » : relève-le dans Réglages ou procède par lots. Fixe aussi une limite de dépense dans la console Anthropic : c'est la protection officielle, côté facturation.

## Déploiement (faisable depuis l'iPhone)

Les secrets se saisissent **uniquement** dans les tableaux de bord Supabase, Backblaze, Anthropic et Render, jamais dans une conversation.

1. **Supabase** : nouveau projet, région *Central EU (Frankfurt)*. Mot de passe de base solide, à garder dans ton trousseau. Puis *Connect* → copie la chaîne **Session pooler**.
2. **Backblaze B2** : crée un compte (formule gratuite) et un bucket **privé**.
   - Puis *Application Keys* : crée une clé limitée à ce bucket, en **lecture + écriture, sans suppression**.
   - Note l'*Endpoint* du bucket, le *keyID* et l'*applicationKey*. Cette dernière ne s'affiche qu'une fois.
3. **Anthropic** : dans la console, crée une clé API et fixe une limite de dépense mensuelle.
4. **Render** : *New* → *Blueprint* → dépôt `Klubik`, branche du projet. Render lit `render.yaml` et demande :
   - `DATABASE_URL` : la chaîne Supabase, avec ton mot de passe ; encode les caractères spéciaux.
   - `ANTHROPIC_API_KEY`.
   - `OWNER_EMAIL`.
   - Les 5 variables `BACKUP_S3_…` : endpoint, région (la partie entre `s3.` et `.backblazeb2.com`), bucket, keyID, applicationKey.

   `SESSION_SECRET`, `SETUP_TOKEN` et `BACKUP_KEY` sont générés automatiquement. Valide : c'est l'étape payante (7 $/mois).
5. **Indispensable** : Render → *Environment* → copie `BACKUP_KEY` dans ton trousseau iCloud. Sans elle, les sauvegardes externes sont illisibles si le compte Render disparaît. L'app affiche l'empreinte de la clé dans Réglages, pour vérifier que c'est la bonne.
6. Copie aussi `SETUP_TOKEN`, ouvre `https://<ton-service>.onrender.com/setup` et choisis ton mot de passe (12 caractères minimum). La page se désactive ensuite.
7. Connecte-toi → **Réglages** → importe `klubik-prospection-master-v9.xlsx` → aperçu → confirmation. Une première sauvegarde est faite tout de suite.
8. **Bascule** : Réglages → « Comparer un fichier Excel avec la base » avec le fichier resté sur ton ordinateur. Le résultat doit être « Aucune divergence ». À partir de là, **le CRM cloud est la seule source officielle** : n'écris plus dans le fichier, ni avec Klubik AI V1 (Claude Code).
9. Safari → Partager → **Sur l'écran d'accueil**. Puis Réglages → Diagnostic : la mémoire doit rester loin des 512 Mo, et le moteur et la base doivent être actifs.

## En cas de problème

- **Base injoignable** (panne, mise en pause Supabase) : l'app affiche « Service momentanément indisponible ». Rien n'est perdu. Les missions reprennent automatiquement au retour de la base, sans redémarrage. Si Supabase a mis le projet en pause, rouvre-le dans son tableau de bord.
- **Base perdue** :
  1. Crée un nouveau projet Supabase.
  2. Remplace `DATABASE_URL` dans Render.
  3. Repasse par `/setup`.
  4. Réglages affiche alors les sauvegardes externes : Restaurer → aperçu → mot de passe. Testé : les 727 clubs reviennent identiques, avec la même empreinte, ainsi que les conversations, les actions et l'historique.
- **Erreur dans le CRM** : Réglages → Sauvegardes → choisis une version → aperçu (nombre de clubs différents) → mot de passe. L'état actuel est sauvegardé juste avant. Le journal n'est jamais effacé.
- **Render disparu** : avec la clé `BACKUP_KEY`, depuis un ordinateur : `BACKUP_KEY=… npm run backup:decrypt fichier.khqbk`. Tu obtiens `clubs.csv` (lisible dans Excel / Numbers) et `sauvegarde.json`.

## Sécurité

- Un seul compte. Mot de passe haché avec scrypt. Cookies `httpOnly`, `Secure` et `SameSite=Lax`, signés en HMAC-SHA256. Origine vérifiée pour toute requête qui modifie des données.
- **Limitation des tentatives sans blocage provocable.**
  - Un appareil où tu t'es déjà connecté a son propre compteur.
  - Les inconnus sont limités par IP (15 min, puis 30 min, jusqu'à 24 h).
  - Un plafond global (50 échecs par heure) suspend uniquement les connexions depuis un **nouvel** appareil.
  - Testé : après une attaque répartie sur 60 adresses, l'iPhone de confiance se reconnecte normalement.
- Révocation d'un appareil et « déconnecter les autres appareils » : effet immédiat, contrôle côté serveur à chaque page.
- Clés côté serveur uniquement. RLS activé sans politique sur Supabase : l'API publique de Supabase n'a accès à rien.
- Agents aux droits limités. Restauration protégée par mot de passe. Sauvegardes chiffrées : la clé de stockage B2 sans droit de suppression empêche un serveur compromis d'effacer l'historique des sauvegardes.

## Tests

```bash
npm run typecheck
npm test   # sans variables : tests unitaires d'authentification uniquement
# Tests complets (bases jetables, ENTIÈREMENT vidées) :
# KLUBIK_TEST_DB=… KLUBIK_TEST_DB2=… KLUBIK_TEST_S3=http://localhost:5055 (ex. moto_server)
# KLUBIK_XLSX=…/klubik-prospection-master-v9.xlsx KLUBIK_REF=…/ref npm test
```

| Fichier | Ce qu'il vérifie |
|---|---|
| `crm-parity` | Parité avec l'outil Python (> 50 000 cellules). |
| `engine` | Délégation parallèle, modèles par agent, coût réel, captures transmises, reprise, plafonds, validation, export Excel. |
| `security` | Vraies routes : blocage par IP, attaque répartie, appareils de confiance, révocation, mot de passe. |
| `backup` | Chiffrement, copie externe vérifiée, planification, restauration du CRM, reconstruction d'une base perdue, script de secours. |
| `auth` | Unités de session et de mot de passe. |

Les agents reprennent les prompts et les règles de `klubik-ai/` (la V1 sous Claude Code). Les connaissances partagées se trouvent dans `knowledge/`.
