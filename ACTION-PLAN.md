# Plan d'action — Klubik
**Mis à jour le :** 03 juillet 2026  
**Score SEO actuel :** ~70/100 (après correctifs session 03/07)  
**Objectif SEO :** 80/100

---

## ✅ CRITIQUE — Tout résolu

- [x] **Lien formation** : CTA final `formation-canva.html` → `https://buy.stripe.com/dRm14maix7xr1pK8502go06`
- [x] **Favicon** : `favicon.png` à la racine + balise `<link rel="icon">` dans les 6 pages HTML
- [x] **CLS logo** : attributs HTML alignés sur le CSS — navbar `208×52`, footer `240×60` (ratio 4:1, logo 1000×250px)
- [x] **robots.txt** : `Disallow` ajouté pour `calendrier-editorial/`, `outils/`, `contrats/`, `prospection/`, `FULL-AUDIT-REPORT.md`, `ACTION-PLAN.md`, `CLAUDE.md`, `PACKS DESIGN GRAPHIC SPORT.pdf`
- [x] **og:image** : `assets/images/og-image.png` déposé, balises `og:image` + `twitter:image` mises à jour dans `index.html` et `formation-canva.html`
- [x] **Carte upsell "Pack Formation + Templates" supprimée** : produit inexistant retiré de `formation-canva.html`

---

## 🟡 PRIORITÉ HAUTE — À traiter avant de scaler

### 1. Portfolio vide — frein conversion n°1
**Fichier :** `index.html` section `#portfolio`  
**Problème :** Affiche encore le placeholder "Les visuels arrivent bientôt".  
**Action :** Ajouter au minimum 1 vraie réalisation (logo, maillot ou template Instagram). Une seule suffit à crédibiliser la page.

---

### 4. Section Formateur — formation-canva.html
**Fichier :** `formation-canva.html`  
**Problème :** Placeholder "Prénom NOM" + aucune photo → crédibilité nulle pour vendre une formation.  
**Action :** Rédiger la bio + ajouter une photo (même la photo fondateur déjà utilisée sur index.html convient).

---

### 5. Témoignages
**Problème :** Zéro témoignage sur le site. Section `hidden` dans `formation-canva.html`, rien sur `index.html`.  
**Action :** Dès les premières ventes ou réalisations, collecter 2-3 avis et les intégrer. C'est le levier E-E-A-T le plus impactant.

---

## ⚪ BACKLOG

- **Poster vidéo hero** : capture de la première frame → `assets/images/hero-poster.jpg` (LCP mobile)
- **llms.txt** à la racine — citabilité IA (ChatGPT, Claude, Perplexity)
- **Schéma `Person`** pour Timothé Leclercq (fondateur)
- **Page 404** personnalisée
- **Auto-hébergement police Inter** (−2 connexions DNS, gain LCP)
- **Logo en WebP** avec balise `<picture>` (gain performance)

---

## Historique des corrections

### Session 02/07/2026
- Lien formation Stripe corrigé
- Favicon ajouté (6 pages)
- CLS logo corrigé (208×52 / 240×60)
- robots.txt : Disallow sur dossiers et fichiers internes

### Sessions 30/06–01/07/2026
- Photo fondateur intégrée (crédit Julie Salles — ojunix.fr)
- Textes section Fondateur & Kubo mis à jour
- Fixes mobiles Kubo (H2, sous-titre, phrase cachée)
- Popup guide image pro + EmailJS
- Schéma `Course` dans formation-canva.html
- guide-image-pro.html ajouté au sitemap.xml

### Sessions 28–29/06/2026
- formation-canva.html ajouté au sitemap.xml (priorité 0.9)
- Google Analytics conditionnel au consentement RGPD
- Bandeau cookie RGPD (fond blanc, texte sportif)
- Lucide Icons épinglé à 0.475.0
- FAQ accordéon (5 Q&A + schéma FAQPage JSON-LD)
- Schéma Organization corrigé

### Avant le 28/06/2026
- Meta description, robots.txt, sitemap.xml, canonical tags
- Balises Open Graph + Twitter Card
- Schema Organization + LocalBusiness + 5 Offer
- Bouton burger accessible (aria-expanded, aria-label)
- rel="noopener nofollow" sur les liens Stripe
- Formulaire contact branché Formspree
- Mentions légales complétées

---

## Impact estimé

| Catégorie | 28/06 | 01/07 | 02/07 | Objectif |
|---|---|---|---|---|
| SEO Technique | 65 | 72 | 80 | 90 |
| E-E-A-T / Contenu | 45 | 55 | 55 | 70 |
| On-Page SEO | 75 | 78 | 80 | 85 |
| Schémas | 50 | 65 | 65 | 75 |
| Performance | 60 | 62 | 68 | 78 |
| GEO | 35 | 40 | 40 | 55 |
| **Score global** | **58** | **~65** | **~68** | **80** |
