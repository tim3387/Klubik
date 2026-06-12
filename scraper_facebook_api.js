/**
 * scraper_facebook_api.js
 *
 * Cherche les pages Facebook de chaque club encore sans données
 * via l'API Graph de Facebook (gratuite).
 *
 * Pour chaque club sans Facebook :
 *   → recherche dans l'API : "nom du club handball"
 *   → tente de matcher le résultat avec le nom du club
 *   → récupère : URL Facebook + nombre d'abonnés
 *   → si une page Instagram Business est liée : la récupère aussi
 *
 * AVANT DE LANCER :
 *   Renseigne ton APP_ID et APP_SECRET ci-dessous (Settings > Basic sur developers.facebook.com)
 *
 * UTILISATION :
 *   node scraper_facebook_api.js
 *
 * Peut être relancé : reprend depuis klubik_graph_enrichi.csv si existant.
 */

const https  = require('https');
const fs     = require('fs');
const path   = require('path');

// Lecture du .env sans dépendance externe
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx > 0) process.env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  });
}

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const APP_ID      = process.env.FB_APP_ID     || '';
const ACCESS_TOKEN = process.env.FB_USER_TOKEN || `${APP_ID}|${process.env.FB_APP_SECRET || ''}`;
const API_VERSION  = 'v21.0';
const INPUT_CSV    = path.join(__dirname, 'klubik_social_enrichi.csv');
const OUTPUT_CSV   = path.join(__dirname, 'klubik_graph_enrichi.csv');
const DELAY_MS     = 500;   // délai entre appels API (évite le rate limit)
const SAVE_EVERY   = 50;    // sauvegarde tous les N clubs

// Indices des colonnes
const COL_NOM      = 0;
const COL_VILLE    = 6;
const COL_FB       = 3;
const COL_IG       = 4;
const COL_LICENCES = 10;
// On ajoute une colonne "Abonnés FB" à la fin (colonne 19)
const COL_FB_FANS  = 19;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function toCsvLine(cols) {
  return cols.map(c => {
    const s = String(c === undefined || c === null ? '' : c);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }).join(',');
}

// Normalise un nom pour la comparaison : minuscules, sans accents, sans mots inutiles
function normaliser(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // accents
    .replace(/\b(handball|club|association|sportive|omnisports|as|us|hb|hbc|hbs|hbf|asc|usv|asm|les|de|du|la|le|les|et|des|l)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Score de correspondance entre le nom du club et un résultat de recherche (0 à 1)
function scoreCorrespondance(nomClub, nomResultat, villeClub) {
  const nc = normaliser(nomClub);
  const nr = normaliser(nomResultat);
  const ville = normaliser(villeClub || '');

  const motsClub    = nc.split(' ').filter(m => m.length > 2);
  const motsResultat = nr.split(' ').filter(m => m.length > 2);

  if (motsClub.length === 0) return 0;

  let communs = 0;
  for (const mot of motsClub) {
    if (motsResultat.includes(mot) || nr.includes(mot)) communs++;
  }

  // Bonus si la ville est dans le nom du résultat
  let bonusVille = 0;
  if (ville && ville.length > 2 && (nr.includes(ville) || normaliser(nomResultat).includes(ville))) {
    bonusVille = 0.3;
  }

  return Math.min(1, (communs / motsClub.length) + bonusVille);
}

function apiGet(endpoint) {
  return new Promise((resolve) => {
    const url = `https://graph.facebook.com/${API_VERSION}/${endpoint}`;
    const parsedUrl = new URL(url);

    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve({ ok: true, data: JSON.parse(body) }); }
        catch (e) { resolve({ ok: false, data: null }); }
      });
    });

    req.on('error', () => resolve({ ok: false, data: null }));
    req.setTimeout(10000, () => { req.destroy(); resolve({ ok: false, data: null }); });
    req.end();
  });
}

let debugCompteur = 0;

async function chercherPageFacebook(nomClub, villeClub) {
  const query = encodeURIComponent(`${nomClub} handball`);
  const fields = 'name,link,fan_count,instagram_business_account';
  const endpoint = `search?type=page&q=${query}&fields=${fields}&limit=5&access_token=${ACCESS_TOKEN}`;

  const { ok, data } = await apiGet(endpoint);

  // Afficher les 5 premières réponses brutes pour diagnostiquer
  if (debugCompteur < 5) {
    debugCompteur++;
    console.log(`\n  [DEBUG #${debugCompteur}] Club: "${nomClub}"`);
    if (!ok || !data) {
      console.log(`  → Requête échouée (pas de réponse)`);
    } else if (data.error) {
      console.log(`  → Erreur API: ${JSON.stringify(data.error)}`);
    } else if (!data.data || data.data.length === 0) {
      console.log(`  → API retourne 0 résultat`);
    } else {
      console.log(`  → ${data.data.length} résultat(s) reçus :`);
      data.data.forEach((p, i) => {
        const score = scoreCorrespondance(nomClub, p.name, villeClub);
        console.log(`     ${i+1}. "${p.name}" — score: ${Math.round(score*100)}% — ${p.link || '(pas de lien)'}`);
      });
    }
    console.log('');
  }

  if (!ok || !data || data.error || !data.data || data.data.length === 0) {
    return null;
  }

  // Trouver le meilleur résultat
  let meilleur = null;
  let meilleurScore = 0;

  for (const page of data.data) {
    const score = scoreCorrespondance(nomClub, page.name, villeClub);
    if (score > meilleurScore) {
      meilleurScore = score;
      meilleur = page;
    }
  }

  // Seuil minimum de confiance
  if (meilleurScore < 0.4) return null;

  return { page: meilleur, score: meilleurScore };
}

async function main() {
  // Vérifier la config
  if (!ACCESS_TOKEN || ACCESS_TOKEN.startsWith('|')) {
    console.error('\n❌ FB_USER_TOKEN manquant dans le fichier .env !\n');
    process.exit(1);
  }

  // Tester la connexion API
  console.log(`\n🔑 Token lu (20 premiers chars): "${ACCESS_TOKEN.substring(0, 20)}..."`);
  console.log('\n🔌 Test de connexion à l\'API Facebook...');
  const testResult = await apiGet(`me?fields=name&access_token=${ACCESS_TOKEN}`);
  if (!testResult.ok || testResult.data?.error) {
    console.error('❌ Erreur d\'authentification. Vérifie ton App ID et App Secret.');
    console.error(JSON.stringify(testResult.data?.error || testResult.data, null, 2));
    process.exit(1);
  }
  console.log('✅ Connexion API réussie\n');

  // Charger depuis le fichier enrichi existant ou depuis le fichier source
  const sourceFichier = fs.existsSync(OUTPUT_CSV) ? OUTPUT_CSV : INPUT_CSV;
  if (sourceFichier === OUTPUT_CSV) {
    console.log('📂 Reprise depuis klubik_graph_enrichi.csv\n');
  }

  const contenu = fs.readFileSync(sourceFichier, 'utf8');
  const lignes  = contenu.split('\n');
  const headerOriginal = lignes[0];
  // Ajouter la colonne Abonnés FB si pas encore présente
  const header = headerOriginal.includes('Abonnés FB')
    ? headerOriginal
    : headerOriginal.trimEnd() + ',Abonnés FB';

  const dataLignes = lignes.slice(1).filter(l => l.trim());
  const clubs = dataLignes.map(l => {
    const cols = parseCsvLine(l);
    // S'assurer que la colonne Abonnés FB existe
    while (cols.length <= COL_FB_FANS) cols.push('');
    return cols;
  });

  // Clubs cibles : Facebook manquant
  const aTraiter = clubs
    .map((cols, i) => ({ cols, i }))
    .filter(({ cols }) => !cols[COL_FB]?.trim());

  console.log(`📊 Total clubs         : ${clubs.length}`);
  console.log(`📘 Sans Facebook       : ${aTraiter.length}`);
  console.log(`\nDémarrage dans 3 secondes...\n`);
  await sleep(3000);

  let fbTrouves  = 0;
  let igTrouves  = 0;
  let nonTrouves = 0;
  let erreurs    = 0;

  for (let j = 0; j < aTraiter.length; j++) {
    const { cols } = aTraiter[j];
    const nom   = cols[COL_NOM]  || '';
    const ville = cols[COL_VILLE] || '';
    const nomAffiche = nom.substring(0, 32).padEnd(32);

    process.stdout.write(`[${j + 1}/${aTraiter.length}] ${nomAffiche} `);

    const resultat = await chercherPageFacebook(nom, ville);

    if (resultat) {
      const { page, score } = resultat;

      if (page.link && !cols[COL_FB]?.trim()) {
        cols[COL_FB] = page.link;
        fbTrouves++;
      }

      if (page.fan_count !== undefined) {
        cols[COL_FB_FANS] = String(page.fan_count);
      }

      // Instagram Business lié à la page Facebook
      if (page.instagram_business_account?.id && !cols[COL_IG]?.trim()) {
        cols[COL_IG] = `https://www.instagram.com/${page.instagram_business_account.username || page.instagram_business_account.id}`;
        igTrouves++;
      }

      const fans = page.fan_count !== undefined ? ` (${page.fan_count} abonnés)` : '';
      const scoreAff = Math.round(score * 100);
      process.stdout.write(`→ ✅ trouvé [${scoreAff}%]${fans}\n`);
    } else {
      nonTrouves++;
      process.stdout.write(`→ ○  non trouvé\n`);
    }

    // Sauvegarde intermédiaire
    if ((j + 1) % SAVE_EVERY === 0) {
      const sortie = [header, ...clubs.map(c => toCsvLine(c))].join('\n');
      fs.writeFileSync(OUTPUT_CSV, sortie, 'utf8');
      console.log(`\n  💾 Sauvegarde [${j + 1}/${aTraiter.length}] — FB: +${fbTrouves}  IG: +${igTrouves}\n`);
    }

    await sleep(DELAY_MS);
  }

  // Sauvegarde finale
  const sortie = [header, ...clubs.map(c => toCsvLine(c))].join('\n');
  fs.writeFileSync(OUTPUT_CSV, sortie, 'utf8');

  console.log('\n══════════════════════════════════════════');
  console.log('🎉 Terminé !');
  console.log(`   📘 Facebook trouvés  : +${fbTrouves}`);
  console.log(`   📷 Instagram trouvés : +${igTrouves} (comptes Business liés)`);
  console.log(`   ○  Non trouvés       : ${nonTrouves}`);
  console.log(`   📄 Fichier de sortie : klubik_graph_enrichi.csv`);
  console.log('══════════════════════════════════════════\n');
}

main().catch(console.error);
