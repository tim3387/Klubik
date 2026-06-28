# Audit SEO Complet — Klubik (v2)
**Date :** 28 juin 2026  
**Type de site :** Site vitrine one-page — Agence de marketing sportif pour clubs amateurs  
**Stack :** HTML5 / CSS3 / JS vanilla  
**Pages analysées :** index.html, formation-canva.html, mentions-legales.html, cgv.html, cgu.html, confidentialite.html, robots.txt, sitemap.xml, script.js, style.css

---

## Score de santé SEO global : 58 / 100

> ⬇️ Score en baisse vs audit v1 (74/100) — la grille de scoring v2 inclut E-E-A-T, GEO et contenu, qui pénalisent le portfolio vide et l'absence de preuve sociale.

| Catégorie | Poids | Score | Points |
|---|---|---|---|
| SEO Technique | 25% | 65/100 | 16.3 |
| Qualité du contenu (E-E-A-T) | 25% | 45/100 | 11.3 |
| SEO On-Page | 20% | 75/100 | 15.0 |
| Schémas / Données structurées | 10% | 50/100 | 5.0 |
| Performance (Core Web Vitals) | 10% | 60/100 | 6.0 |
| Images | 5% | 60/100 | 3.0 |
| Référencement IA (GEO) | 5% | 35/100 | 1.8 |
| **TOTAL** | **100%** | | **58.3 / 100** |

---

## 🔴 Top 5 — Problèmes critiques (à corriger immédiatement)

1. **Lien Stripe brisé** sur `formation-canva.html` — CTA de vente pointe vers `LIEN_STRIPE_FORMATION` (placeholder non remplacé) → personne ne peut acheter la formation
2. **`formation-canva.html` absent du sitemap.xml** — page de vente principale, Google ne la connaît pas officiellement
3. **Pas de consentement cookie (RGPD/CNIL)** — Google Analytics chargé sans bannière → infraction CNIL, amende potentielle
4. **CLS potentiel sur le logo** — dimensions HTML (`width="120" height="40"`) vs CSS (`height: 52px`) créent un décalage visuel au chargement
5. **Portfolio entièrement vide** — section placeholder = zéro preuve sociale, zéro crédibilité

## 🟡 Top 5 — Gains rapides (quick wins, < 30 min chacun)

1. Ajouter `formation-canva.html` au sitemap (5 min)
2. Corriger le lien Stripe de la formation (2 min)
3. Épingler `lucide@0.475.0` dans `index.html` (2 min, déjà fait dans formation-canva.html)
4. Corriger les dimensions du logo HTML pour coller au CSS (5 min)
5. Exclure `calendrier-editorial/`, `outils/`, `contrats/` du crawl via robots.txt (10 min)

---

## 1. SEO TECHNIQUE — 65/100

### ✅ Points forts
- `robots.txt` correct, référence le sitemap
- Balises canoniques sur `index.html` et `formation-canva.html`
- `lang="fr"` sur toutes les pages
- HTTPS via Netlify (canonicals en https)
- `rel="noopener nofollow"` sur les liens Stripe
- `rel="noopener"` sur les liens WhatsApp
- `preconnect` pour Google Fonts

### ❌ Problèmes détectés

**Critique**
- **`formation-canva.html` absent du sitemap.xml** — page revenue non indexée officiellement
- **Pas de cookie banner RGPD** — `G-PDBNFLX6NJ` se charge sans consentement → infraction CNIL

**Élevé**
- **Favicon manquant** — pas de balise `<link rel="icon">` sur aucune page
- **`og:image` non vérifiable** — `assets/images/og-image.jpg` référencée mais non trouvée dans le projet

**Moyen**
- **Pages internes exposées** : `calendrier-editorial/`, `outils/`, `contrats/` sont dans le repo et potentiellement indexables. À bloquer via robots.txt sauf intention délibérée
- **`<section class="kubo-intro">` sans `id`** — impossible d'y linker directement
- **Section `#fondateur`** absente de la navbar et du footer — introuvable sans scrolling

### Sitemap — état actuel

| Page | Dans sitemap | Priorité | Statut |
|---|---|---|---|
| `index.html` | ✅ | 1.0 | OK |
| `formation-canva.html` | ❌ | — | **À AJOUTER** |
| `mentions-legales.html` | ✅ | 0.3 | OK |
| `cgv.html` | ✅ | 0.3 | OK |
| `cgu.html` | ✅ | 0.3 | OK |
| `confidentialite.html` | ✅ | 0.3 | OK |
| `guide-image-pro/guide-image-pro.html` | ✅ | 0.7 | OK |
| `calendrier-editorial/*` | ❌ | — | À exclure (robots.txt) |
| `outils/*`, `contrats/*` | ❌ | — | À exclure (robots.txt) |

---

## 2. QUALITÉ DU CONTENU (E-E-A-T) — 45/100

### ✅ Points forts
- Section Fondateur avec backstory authentique (clubs réels mentionnés : Haillan, JA Isle, Saint-Médard, Saint-Flour, Saint-Étienne)
- 6 cibles clairement définies
- Pricing transparent (5 packs avec prix publics)
- Process en 4 étapes décrit
- Contacts multiples visibles
- Pages légales complètes

### ❌ Problèmes détectés

**Critique**
- **Portfolio entièrement vide** — "Les visuels arrivent bientôt" = aucune preuve d'avoir travaillé avec un club. C'est le signal E-E-A-T le plus manquant.

**Élevé**
- **Zéro témoignage client** — aucun avis, aucune citation, aucune note
- **Pas de photo du fondateur** — placeholder "Photo à venir" nuit à la crédibilité personnelle
- **Pas de FAQ** — questions fréquentes non traitées = opportunité SEO manquée
- **Aucune preuve de résultat** — pas de stat, pas de chiffre ("X clubs accompagnés", "X visuels livrés")

**Moyen**
- **Pas de contenu éditorial** — impossible de construire une autorité sur "marketing sportif clubs amateurs" sans contenu régulier
- **Page formation sans preuve** — aucun témoignage, aucune note, aucune capture d'écran de la formation

---

## 3. SEO ON-PAGE — 75/100

### ✅ Points forts

| Page | Title | Meta desc | H1 | Sémantique |
|---|---|---|---|---|
| `index.html` | ✅ 54 chars | ✅ 172 chars | ✅ 1 seule | ✅ |
| `formation-canva.html` | ✅ 47 chars | ✅ 152 chars | ✅ 1 seule | ✅ |

- Hiérarchie H1 → H2 → H3 respectée
- Open Graph complet sur les deux pages principales
- Balises sémantiques HTML5 correctes

### ❌ Problèmes

**Élevé**
- **H1 index.html générique** : "On aide les clubs amateurs à avoir une image plus professionnelle." — aucun mot-clé cible ("agence marketing sportif", "logo club amateur") n'y apparaît
- **Title index.html** : "Klubik — Marketing sportif pour clubs amateurs" — correct mais le mot "agence" manque

**Moyen**
- **`formation-canva.html`** : meta Twitter Card incomplète (pas de `twitter:image` ni `twitter:description`)
- **Section `#fondateur`** sans lien depuis la navigation principale

---

## 4. SCHÉMAS / DONNÉES STRUCTURÉES — 50/100

### index.html — problèmes

```json
// Actuel
{ "@type": ["Organization", "LocalBusiness"], ... }
```

- ❌ `LocalBusiness` sans `address` — invalide selon Google (adresse physique obligatoire)
- ❌ Double type `["Organization", "LocalBusiness"]` — LocalBusiness hérite d'Organization, redondance
- ❌ `offers` sur Organization — à placer sur un type `Service`
- ❌ `serviceType` — propriété non standard de LocalBusiness

### formation-canva.html — problèmes

Le type `Course` est une bonne base, mais :
- ❌ Manque `educationalCredentialAwarded`
- ❌ Manque `image` pour le cours
- ❌ Manque `coursePrerequisites` ("Aucun prérequis")
- ❌ Manque `teaches` (liste des compétences)
- ❌ Manque `aggregateRating` (à ajouter quand des avis existent)

### Schémas manquants sur index.html
- `Person` pour le fondateur (Timothé Leclercq)
- `FAQPage` (quand une FAQ sera créée)
- `Service` pour chaque prestation

---

## 5. PERFORMANCE (Core Web Vitals estimée) — 60/100

### ✅ Points forts
- CSS + JS en un seul fichier chacun
- Animations via IntersectionObserver (non bloquant)
- Google Analytics en `async`
- `preconnect` pour Google Fonts

### ❌ Risques

**LCP (Largest Contentful Paint)**
- Vidéo `hero-kubo.mp4` sans attribut `poster` → zone noire pendant le chargement
- Fix : `poster="assets/images/kubo-poster.jpg"`

**CLS (Cumulative Layout Shift)**
- Logo navbar : HTML `width="120" height="40"` mais CSS `height: 52px; width: auto` → mismatch → CLS
- Logo footer : HTML `width="100" height="33"` mais CSS `height: 60px` → CLS

**Scripts tiers**
- `lucide@latest` dans index.html → résolution DNS non cachée, version imprévisible
- EmailJS et Lucide sans hash SRI (`integrity`) → risque sécurité

**Animation orbital**
- `requestAnimationFrame` tourne en continu même hors viewport — recommandé : suspendre avec IntersectionObserver

---

## 6. IMAGES — 60/100

### ✅ Points forts
- Quasi toutes les "images" du hero sont du HTML/CSS pur → 0 requête image dans le hero
- `loading="lazy"` sur le logo footer
- SVGs inline pour les icônes

### ❌ Problèmes
- `og:image` référencée mais fichier non trouvé dans le projet
- Vidéo sans `poster` → contenu invisible pendant le chargement
- `logo.png` en PNG → SVG ou WebP serait plus léger
- Dimensions logo HTML ≠ CSS → CLS

---

## 7. RÉFÉRENCEMENT IA (GEO) — 35/100

### ✅ Points forts
- Structure sémantique claire
- Pricing explicite
- Biographie fondateur avec détails réels

### ❌ Manques critiques
- **Pas de `llms.txt`** — les crawlers IA (ClaudeBot, GPTBot, PerplexityBot) n'ont pas de guide de navigation
- **Pas de FAQ** — format idéal pour les réponses directes des IA
- **Aucune statistique ou donnée chiffrée** à citer
- **Pas de contenu éditorial** — les IA citent des contenus informatifs, pas des landing pages
- **Zéro mention externe connue**

---

## Récapitulatif des fichiers

| Fichier | Rôle | Statut |
|---|---|---|
| `index.html` | Landing page principale | ⚠️ Logo CLS, H1 générique |
| `formation-canva.html` | Page vente formation | 🔴 Lien Stripe brisé, absent sitemap |
| `robots.txt` | Directives crawlers | ✅ OK |
| `sitemap.xml` | Index pages | ⚠️ formation-canva manquante |
| `script.js` | JS | ✅ OK |
| `style.css` | Styles | ✅ OK |
| Pages légales (4) | Légal | ✅ OK |
| `guide-image-pro/` | Guide gratuit | ✅ Dans sitemap |
| `calendrier-editorial/` | Outil interne | ⚠️ À exclure |
| `outils/`, `contrats/` | Outils internes | ⚠️ À exclure |

---

*Audit v2 — 28/06/2026 — Analyse statique complète (index.html + formation-canva.html + tous fichiers config)*

---

## Score SEO Global : 74 / 100 *(était 51/100)*

| Catégorie | Poids | Score | Contribution | Évolution |
|---|---|---|---|---|
| SEO Technique | 25% | 85/100 | 21/25 | +9 ↑ |
| Qualité du contenu | 25% | 65/100 | 16/25 | = |
| On-Page SEO | 20% | 88/100 | 18/20 | +4 ↑ |
| Schema / Données structurées | 10% | 70/100 | 7/10 | +7 ↑ |
| Performance (Core Web Vitals) | 10% | 65/100 | 6/10 | +1 ↑ |
| Images | 5% | 65/100 | 3/5 | +1 ↑ |
| Accessibilité IA (GEO) | 5% | 50/100 | 2.5/5 | +1 ↑ |
| **TOTAL** | 100% | — | **74/100** | **+23** ↑ |

---

## Résumé Exécutif

Le site est maintenant dans un état solide pour un lancement. Les problèmes critiques bloquants ont tous été résolus : meta description, schema.org, robots.txt, sitemap.xml, formulaire accessible et balises Open Graph pour les partages sociaux. Les points restants sont des optimisations de second rang (favicon, image OG, poster vidéo, mentions légales à compléter).

### Problèmes restants classés par priorité

#### Medium
- [ ] Pas de favicon
- [ ] Image `og-image.jpg` (1200×630px) non encore créée → partages WhatsApp/Facebook sans visuel
- [ ] Vidéo hero sans attribut `poster` → risque d'écran noir au chargement
- [ ] Mentions légales avec placeholders non remplis (`[SIRET]`, `[Adresse]`, etc.)
- [ ] `rel="nofollow"` absent sur les liens Stripe

#### Low
- [ ] Logo PNG → convertir en WebP
- [ ] `<link rel="preload">` sur la police Inter
- [ ] `llms.txt` pour l'accessibilité IA
- [ ] Témoignages clients (signaux E-E-A-T)
- [ ] Liens réseaux sociaux dans le footer

---

## 1. SEO Technique

### 1.1 Crawlabilité et indexabilité

| Élément | Statut | Détail |
|---|---|---|
| `robots.txt` | ✅ OK | Créé — autorise tous les robots, référence le sitemap |
| `sitemap.xml` | ✅ OK | Créé — 4 URLs avec priorités et fréquences |
| Canonical tags | ✅ OK | Ajoutés sur les 4 pages |
| `lang` HTML | ✅ OK | `<html lang="fr">` présent sur toutes les pages |
| Balises `noindex` | ✅ OK | Pas de balise bloquant l'indexation |
| Favicon | ❌ ABSENT | Aucun fichier favicon défini |

### 1.2 Balises meta essentielles

| Page | `<title>` | `<meta description>` | Canonical |
|---|---|---|---|
| index.html | ✅ | ✅ Ajoutée | ✅ Ajouté |
| mentions-legales.html | ✅ | ✅ | ✅ Ajouté |
| cgv.html | ✅ | ✅ | ✅ Ajouté |
| cgu.html | ✅ | ✅ | ✅ Ajouté |

### 1.3 Open Graph / Réseaux sociaux

| Balise | Statut |
|---|---|
| `og:title`, `og:description`, `og:url`, `og:type` | ✅ Ajoutés |
| `og:image` | ⚠️ Tag présent, mais `og-image.jpg` pas encore créée |
| `og:locale` | ✅ `fr_FR` |
| `twitter:card`, `twitter:title`, `twitter:image` | ✅ Ajoutés |

> **À faire :** Créer `assets/images/og-image.jpg` en 1200×630px (logo + fond, sur Canva). Sans ce fichier, les partages afficheront toujours un aperçu vide.

### 1.4 Structure des sections

- ✅ Balises sémantiques correctement utilisées : `<nav>`, `<section>`, `<footer>`
- ✅ `<main>` ajouté dans `index.html` — encapsule toutes les sections de contenu
- ✅ Pages légales avaient déjà `<main>`

### 1.5 Fichier vidéo

- ✅ Renommé : `hero kubo.mp4` → `hero-kubo.mp4` (espace supprimé)
- ✅ Référence mise à jour dans `index.html`
- ⚠️ Attribut `poster` toujours absent — risque d'écran noir au chargement sur mobile

---

## 2. Qualité du contenu (E-E-A-T)

### 2.1 Structure des titres

| Page | H1 | H2 | H3 | Hiérarchie |
|---|---|---|---|---|
| index.html | ✅ 1 seul | ✅ 7 (un par section) | ✅ Présents | ✅ OK |
| Pages légales | ✅ 1 seul | ✅ Numérotés | — | ✅ OK |

### 2.2 Qualité du contenu par section

| Section | Qualité | Remarque |
|---|---|---|
| Hero | ✅ Bon | Message clair, CTA visible |
| Services | ✅ Bon | 6 services avec listes détaillées |
| Pour qui | ✅ Bon | 6 cibles définies |
| Pourquoi Klubik | ✅ Bon | 4 arguments développés |
| Portfolio | ⚠️ VIDE | Placeholder — thin content |
| Process | ✅ Bon | 4 étapes claires |
| Packs | ✅ Bon | Tarifs lisibles et structurés |
| Contact | ✅ Bon | Formulaire + coordonnées multiples |

### 2.3 Signaux E-E-A-T

| Signal | Statut |
|---|---|
| Identité de l'agence | ⚠️ Partiel — mentions légales à compléter |
| Témoignages / avis clients | ❌ Absent — à ajouter dès les premières réalisations |
| Portfolio de réalisations | ❌ Vide — section placeholder |
| Coordonnées visibles | ✅ Téléphone, email, WhatsApp, Instagram |
| Tarifs transparents | ✅ Packs bien détaillés avec prix affichés |

### 2.4 Mentions légales

- ⚠️ Placeholders à remplir : `[Forme juridique]`, `[Adresse complète]`, `[SIRET]`, `[Prénom Nom directeur]`

---

## 3. On-Page SEO

### 3.1 Balises de titres

| Page | Title | Longueur | Évaluation |
|---|---|---|---|
| index.html | `Klubik — Marketing sportif pour clubs amateurs` | 47 car. | ✅ |
| mentions-legales.html | `Mentions légales — Klubik` | 26 car. | ✅ |
| cgv.html | `Conditions Générales de Vente — Klubik` | 38 car. | ✅ |
| cgu.html | `Conditions Générales d'Utilisation — Klubik` | 44 car. | ✅ |

### 3.2 Formulaire de contact

| Champ | Label associé |
|---|---|
| Prénom & Nom | ✅ `for="name"` / `id="name"` |
| Email | ✅ `for="email"` / `id="email"` |
| Votre club | ✅ `for="club"` / `id="club"` |
| Votre besoin | ✅ `for="service"` / `id="service"` |
| Message | ✅ `for="message"` / `id="message"` |

### 3.3 Liens externes

- ✅ `rel="noopener"` présent sur tous les liens externes
- ⚠️ `rel="nofollow"` absent sur les liens Stripe — à ajouter

---

## 4. Schema.org / Données structurées

| Schema | Statut | Détail |
|---|---|---|
| `Organization` | ✅ Ajouté | Nom, URL, logo, téléphone, email, réseaux |
| `LocalBusiness` | ✅ Ajouté | Zone de service : France |
| `Offer` (×5) | ✅ Ajouté | Les 5 packs avec prix en EUR |
| `FAQPage` | ❌ Non applicable | Pas de section FAQ sur le site |
| `BreadcrumbList` | ❌ Non prioritaire | Site one-page, peu pertinent ici |
| `Review` / `AggregateRating` | ❌ À ajouter | Dès que des avis clients seront disponibles |

---

## 5. Performance (Core Web Vitals)

*Évaluation statique — site non encore déployé.*

### Risques CLS (Cumulative Layout Shift)

- ✅ `width`/`height` ajoutés sur les logos → navigateur réserve l'espace
- ⚠️ Vidéo hero toujours sans `width`/`height` et sans `poster`

### Risques LCP (Largest Contentful Paint)

- ⚠️ Vidéo sans `poster` → la zone reste vide jusqu'au chargement de la vidéo
- ⚠️ Google Fonts externe (potentiellement render-blocking)

### Points positifs

- ✅ Event listeners avec `{ passive: true }` sur le scroll
- ✅ Pas de librairies tierces lourdes
- ✅ JS vanilla minimal

---

## 6. Images

| Élément | Alt | Width/Height | Format | Lazy |
|---|---|---|---|---|
| Logo navbar | ✅ | ✅ `120×40` | PNG (→ WebP) | ❌ |
| Logo footer | ✅ | ✅ `100×33` | PNG (→ WebP) | ✅ |
| Vidéo hero | N/A | ❌ Absent | MP4 | N/A |

---

## 7. Accessibilité (a11y)

| Élément | Statut |
|---|---|
| Formulaire : labels liés | ✅ Corrigé |
| Bouton burger `aria-expanded` | ✅ Corrigé (dynamique JS) |
| Bouton burger `aria-label` | ✅ Dynamique ("Ouvrir/Fermer le menu") |
| Système orbital `aria-hidden` | ✅ OK |
| Navigation clavier | ✅ Focus visible |

---

## 8. Accessibilité IA (GEO)

| Critère | Statut |
|---|---|
| `robots.txt` (autorise GPTBot / ClaudeBot) | ✅ — `Allow: /` couvre tous les robots |
| Données structurées schema.org | ✅ Ajoutées |
| `llms.txt` | ❌ Non créé |
| Contenu factuellement citable | ⚠️ Limité (pas de témoignages, stats, chiffres) |
| Structure en passages lisibles | ✅ Bonne structure sémantique |
