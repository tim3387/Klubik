# Plan d'action — Klubik
**Mis à jour le :** 03 juillet 2026  
**Score SEO actuel :** ~72/100  
**Objectif SEO :** 80/100

---

## ✅ CRITIQUE — Tout résolu

- [x] **Lien formation** : CTA final `formation-canva.html` → `https://buy.stripe.com/dRm14maix7xr1pK8502go06`
- [x] **Favicon** : `favicon.png` à la racine + balise `<link rel="icon">` dans les 6 pages HTML
- [x] **CLS logo** : attributs HTML alignés sur le CSS — navbar `208×52`, footer `240×60` (ratio 4:1, logo 1000×250px)
- [x] **robots.txt** : `Disallow` sur dossiers et fichiers internes
- [x] **og:image** : `assets/images/og-image.png` + balises mises à jour
- [x] **Carte upsell "Pack Formation + Templates"** : supprimée (produit inexistant)

---

## 🟡 PRIORITÉ HAUTE — À traiter avant de scaler

### 1. Portfolio vide — frein conversion n°1
**Fichier :** `index.html` section `#portfolio`  
**Problème :** Affiche encore le placeholder "Les visuels arrivent bientôt".  
**Action :** Ajouter au minimum 1 vraie réalisation (logo, maillot ou template Instagram).

---

### 2. Témoignages — dès les premiers avis Trustpilot
**Fichier :** `index.html` et `formation-canva.html`, section `#avis`  
**État actuel :** Sections `hidden`, structure et design prêts (3 cartes par page).  
**Action :** Dès 1 avis reçu sur Trustpilot → retirer `hidden` sur les 2 sections + remplir nom/rôle/texte/initiale dans les cartes.  
**Lien collecte :** `https://fr.trustpilot.com/evaluate/klubik.pro`

---

### 3. Formateur Tom MELLÉ — formation-canva.html
**Fichier :** `formation-canva.html` section `#formateur`  
**État actuel :** Timothé Leclercq en placeholder temporaire (photo + bio).  
**Action :** Remplacer par la photo de Tom + bio dès que disponibles.  
**Bio rédigée :** joueur N1 à Bruges 33 Handball, ex-responsable comm Saint-Médard HB et Eysines HBC.

---

## ⚪ BACKLOG

- **Poster vidéo hero** : capture première frame → `assets/images/hero-poster.jpg` (LCP mobile)
- **llms.txt** à la racine — citabilité IA (ChatGPT, Claude, Perplexity)
- **Schéma `Person`** pour Timothé Leclercq (fondateur)
- **Page 404** personnalisée
- **Auto-hébergement police Inter** (−2 connexions DNS, gain LCP)
- **Logo en WebP** avec balise `<picture>` (gain performance)

---

## Historique des corrections

### Session 03/07/2026
- og:image ajoutée (`og-image.png`)
- Carte upsell "Pack Formation + Templates" supprimée
- Section formateur remplie (Timothé Leclercq temporaire, photo fondateur, crédit Julie Salles)
- Section témoignages créée sur index.html + formation-canva.html (hidden, design prêt)
- Compte Trustpilot créé, meta tag vérification dans index.html
- Bouton "Laisser un avis" intégré dans les sections témoignages
- `[hidden] { display: none !important; }` ajouté au reset CSS
- Styles `.testi-*` ajoutés dans style.css

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

| Catégorie | 28/06 | 01/07 | 03/07 | Objectif |
|---|---|---|---|---|
| SEO Technique | 65 | 72 | 82 | 90 |
| E-E-A-T / Contenu | 45 | 55 | 60 | 70 |
| On-Page SEO | 75 | 78 | 80 | 85 |
| Schémas | 50 | 65 | 65 | 75 |
| Performance | 60 | 62 | 68 | 78 |
| GEO | 35 | 40 | 42 | 55 |
| **Score global** | **58** | **~65** | **~72** | **80** |
