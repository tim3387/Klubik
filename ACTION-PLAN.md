# Plan d'action — Klubik
**Mis à jour le :** 03 juillet 2026  
**Score SEO actuel :** ~59/100 (audit 5 agents, pondéré)  
**Objectif SEO :** 80/100

> **Note sur le score :** Les scores précédents (~72) étaient des estimations optimistes. L'audit multi-agents du 03/07 donne des mesures plus précises par catégorie. Le plus grand écart est sur E-E-A-T (estimé 60, mesuré 41) et les schémas (estimé 65, mesuré 52).

---

## ✅ CRITIQUE — Tout résolu

- [x] Lien formation Stripe corrigé (`formation-canva.html`)
- [x] Favicon + balise `<link rel="icon">` dans les 6 pages HTML
- [x] CLS logo : navbar `208×52`, footer `240×60`
- [x] robots.txt : Disallow sur dossiers et fichiers internes
- [x] og:image : `assets/images/og-image.png` sur les 2 pages
- [x] Carte upsell "Pack Formation + Templates" supprimée
- [x] Témoignages : sections `hidden` + bouton Trustpilot visible
- [x] `[hidden] { display: none !important }` au reset CSS

---

## ✅ RAPIDE — Tout résolu

- [x] Logo navbar + footer `href="#"` → `href="/"`
- [x] `defer` sur Lucide + EmailJS + script.js (index.html + formation-canva.html)
- [x] Twitter Card complète sur formation-canva.html (title/description/image)
- [x] Instagram `target="_blank" rel="noopener noreferrer"`
- [x] robots.txt : espace encodé `/PACKS%20DESIGN%20GRAPHIC%20SPORT.pdf`
- [x] sitemap.xml : lastmod → `2026-07-03`

---

## ✅ PRIORITÉ HAUTE — Items résolus

- [x] Badge "À venir" supprimé de la carte formation (section dédiée existante plus bas)
- [x] Schéma Course complété : `instructor`, `image`, `url`, `courseMode`, `educationalCredentialAwarded`, `seller`
- [x] Google Fonts non-bloquant (`media="print" onload`) + graisses réduites de 7 à 5 sur les 2 pages
- [x] Schéma WebSite ajouté sur index.html
- [x] FAQPage JSON-LD ajouté sur formation-canva.html (6 vraies Q&A)

---

## 🟡 PRIORITÉ HAUTE — En attente

### 1. Portfolio — frein conversion n°1 ⏳ presta en cours
**Fichier :** `index.html` section `#portfolio`  
Dès réception des visuels → intégrer au minimum 3 réalisations (logo, maillot, template Instagram).

### 2. Formateur Tom MELLÉ ⏳ tournage à venir
**Fichier :** `formation-canva.html` section `#formateur`  
Timothé Leclercq en placeholder. Remplacer par photo + bio de Tom dès que disponibles.  
**Bio rédigée :** joueur N1 à Bruges 33 Handball, ex-responsable comm Saint-Médard HB et Eysines HBC.

### 3. Témoignages — activer dès 1 avis Trustpilot
**Fichier :** `index.html` + `formation-canva.html`, section `#avis`  
Dès 1 avis reçu → retirer `hidden` sur les 2 sections + remplir les cartes (nom/rôle/texte/initiale).  
**Lien collecte :** `https://fr.trustpilot.com/evaluate/klubik.pro`

### 4. Photo fondateur — JPEG → WebP ⏳ export à faire
**Fichier :** `index.html` ~l.500, `formation-canva.html` ~l.1010  
Exporter `fondateur.webp` depuis Canva/Lightroom, puis me le donner → je mets le code `<picture>` en place.

### 5. Poster vidéo Kubo ⏳ export à faire
**Fichier :** `index.html` balise `<video class="hero-video">`  
Capturer la 1ère frame de `hero-kubo.mp4` → `assets/images/hero-kubo-poster.webp` → me la donner.

---

## ✅ BACKLOG — Items résolus

- [x] `llms.txt` créé à la racine (citabilité IA : ChatGPT, Claude, Perplexity)
- [x] Schéma `Person` Timothé Leclercq ajouté sur index.html
- [x] `og:site_name` sur index.html + formation-canva.html
- [x] Orbital `document.hidden` : boucle `requestAnimationFrame` pausée si onglet inactif

## ⚪ BACKLOG — Restant

- [x] **Page 404** personnalisée (`404.html` créée, noindex, navbar + footer + bouton retour accueil)
- **Auto-hébergement police Inter** (−2 connexions DNS, gain LCP)
- **Logo en WebP** avec balise `<picture>`
- **IndexNow** — notification instantanée Bing/Yandex
- **Email pro** `@klubik.pro` au lieu de Gmail (décision commerciale)

---

## Historique des corrections

### Session 03/07/2026
- Audit SEO complet 5 agents : Technique 71, E-E-A-T 41, Schémas 52, Performance 62, GEO 45 → score global ~59/100
- Google Fonts non-bloquant + 2 graisses supprimées (300/500)
- Schéma Course complété, FAQPage ajouté sur formation-canva.html, WebSite ajouté sur index.html
- `defer` sur tous les scripts tiers, logo `href="/"`, Twitter Card formation, Instagram sécurisé
- robots.txt espace encodé, sitemap lastmod mis à jour
- Badge "À venir" formation supprimé
- Bouton Trustpilot visible, grilles témoignages masquées via `hidden`
- og:image, `[hidden]` reset CSS, carte upsell supprimée

### Session 02/07/2026
- Lien formation Stripe, favicon (6 pages), CLS logo, robots.txt Disallow

### Sessions 28/06–01/07/2026
- Photo fondateur, section Kubo, FAQ accordéon, schémas Organization/Course/FAQPage (v1)
- Google Analytics RGPD, bandeau cookie, Lucide épinglé, guide image pro, sitemap

### Avant le 28/06/2026
- Meta, canonical, Open Graph, Twitter Card, schema Organization
- Formulaire Formspree, mentions légales, burger accessible

---

## Scores par catégorie (audit 03/07/2026)

| Catégorie | Poids | 28/06 | 01/07 | 03/07 (audit) | Objectif |
|---|---|---|---|---|---|
| SEO Technique | 25% | 65 | 72 | **71** | 90 |
| E-E-A-T / Contenu | 25% | 45 | 55 | **41** | 70 |
| On-Page SEO | 20% | 75 | 78 | **75** | 85 |
| Schémas | 10% | 50 | 65 | **52** | 75 |
| Performance | 10% | 60 | 62 | **62** | 78 |
| GEO / Citabilité IA | 5% | 35 | 40 | **45** | 55 |
| Images | 5% | 40 | 42 | **38** | 70 |
| **Score global (pondéré)** | | **~58** | **~65** | **~59** | **80** |
