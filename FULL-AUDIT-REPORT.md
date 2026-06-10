# Audit SEO Complet — Klubik
**Date :** 9 juin 2026  
**Type de site :** Site vitrine one-page — Agence de marketing sportif pour clubs amateurs  
**Stack :** HTML5 / CSS3 / JS vanilla  
**Pages analysées :** index.html, mentions-legales.html, cgv.html, cgu.html

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
