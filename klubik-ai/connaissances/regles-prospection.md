# Règles de prospection Klubik

## 1. Règles internes (onglet « Listes » du fichier — elles font foi)

| Statut | Quand l'utiliser |
|---|---|
| À qualifier | Entité qui porte la communication ou contact non confirmé (ententes, conventions). **Pas d'envoi.** |
| À contacter | Club qualifié, jamais contacté. Candidat à l'envoi. |
| Contacté | Premier message envoyé, pas de réponse. Date 1er contact + Canal utilisé renseignés. |
| Relancé | Au moins une relance envoyée, toujours sans réponse. Dernier contact renseigné. |
| En échange | Le club a répondu (même refus poli ou question). Réponse reçue = Oui. |
| Devis envoyé | Une proposition chiffrée est partie. |
| Client | Commande signée ou relation client existante. **Jamais de cold : suivi / upsell uniquement.** |
| Sans suite | Refus explicite ou abandon après relances. |
| Exclu | Hors cible (réserve de club pro, besoin déjà couvert…). **Jamais de message.** |

Autres règles du fichier : 1 club = 1 ligne · ne jamais deviner un @ (écrire « À vérifier ») · ententes non
fusionnées automatiquement · délai de relance **7 jours** · objectif **10 premiers contacts / semaine**.

Règle proposée (non encore écrite dans le fichier, à valider par Timothé) : **2 relances maximum** sans
réponse, puis « Sans suite ». Le fichier ne compte pas les relances ; le compte se fait via les notes datées.

## 2. Cadre légal (France) — ce qui est établi et ce qui ne l'est pas

Établi :
- Email/SMS vers un **professionnel** (B2B) : pas de consentement préalable exigé, si le message concerne
  son activité professionnelle, si l'expéditeur est identifié et si la personne peut s'opposer simplement et
  gratuitement (régime d'opposition, art. L34-5 du Code des postes et des communications électroniques ;
  doctrine CNIL). Les adresses **génériques** de structure (contact@club…) désignent la structure, pas une
  personne.
- Le droit d'opposition est absolu : un « stop », « ne plus me contacter » → statut « Exclu » ou
  « Sans suite » + note, et plus aucun message, jamais.

Incertain (à vérifier avant tout envoi en volume, idéalement auprès de la CNIL) :
- Un **président bénévole** d'association contacté sur son **adresse ou numéro personnel** est-il un
  « professionnel » au sens de la loi ? Ce n'est pas tranché clairement. Prudence : privilégier les canaux
  officiels du club (compte Instagram/Facebook du club, email générique du club) et ne pas utiliser de
  coordonnées personnelles trouvées par recoupement.
- Des sources secondaires évoquent une refonte des fiches CNIL en 2026 ; non confirmé par une source officielle.

Pratique Klubik qui en découle :
- Chaque email : identité claire (Timothé Leclercq, Klubik) + une phrase simple permettant de refuser.
- Pas de coordonnées personnelles ajoutées au CRM sans qu'elles aient été communiquées par la personne
  ou publiées par elle à titre officiel ; toujours indiquer la source.
- **Aucun envoi automatisé** : Claude rédige des brouillons, Timothé envoie lui-même.
  ⚠ Le script historique `prospection/prospection_apps_script.js` envoie des emails en masse via Gmail sans
  validation unitaire : il contredit cette règle et ne doit pas être utilisé avec ce système.

Sources : [CNIL — fiche BPI « Améliorez et maîtrisez votre relation client »](https://WWW.CNIL.FR/sites/cnil/files/atoms/files/bpi-cnil-rgpd_fiche_2_ameliorez-maitrisez-votre-relation-client_0.pdf) ·
[CCI Paris IDF — prospection par voie électronique](https://www.entreprises.cci-paris-idf.fr/fiches-pratiques/prospection-commerciale-par-voie-electronique) ·
[donneespersonnelles.fr — prospection commerciale et RGPD](https://donneespersonnelles.fr/prospection-commerciale-rgpd)
