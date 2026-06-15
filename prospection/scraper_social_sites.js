/**
 * scraper_social_sites.js
 *
 * Pour chaque club ayant un site web dans klubik_final.csv,
 * scrape la page d'accueil pour y trouver les liens Facebook et Instagram.
 *
 * Ne touche pas aux données existantes — comble uniquement les cases vides.
 * Résultat : klubik_social_enrichi.csv (n'écrase jamais l'original).
 *
 * UTILISATION :
 *   node scraper_social_sites.js
 *
 * Peut être relancé : reprend depuis klubik_social_enrichi.csv si existant.
 */

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const INPUT_CSV  = path.join(__dirname, 'klubik_final.csv');
const OUTPUT_CSV = path.join(__dirname, 'klubik_social_enrichi.csv');
const DELAY_MS   = 800;    // délai entre requêtes (évite les bans)
const SAVE_EVERY = 100;    // sauvegarde tous les N clubs traités
const TIMEOUT_MS = 12000;  // timeout par requête
const MAX_BYTES  = 150000; // on lit max ~150ko par page (le header/footer suffit)
// ──────────────────────────────────────────────────────────────────────────────

// Indices des colonnes dans klubik_final.csv
const COL_NOM  = 0;
const COL_SITE = 2;
const COL_FB   = 3;
const COL_IG   = 4;

// URLs Facebook à ignorer (partage, tracking, widgets...)
const FB_EXCLUDES  = ['sharer', '/plugins/', '/dialog/', 'login.php', '/share?', 'intent/', '.js', '/feed/'];
// URLs Instagram à ignorer (posts individuels, explore...)
const IG_EXCLUDES  = ['/p/', '/reel/', '/stories/', '/explore/', '/accounts/', '.js'];

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

function normaliserUrl(url) {
  if (!url) return '';
  url = url.trim();
  if (!url.startsWith('http')) url = 'https://' + url;
  return url;
}

function fetchAvecRedirections(url, compteur = 0) {
  return new Promise((resolve) => {
    if (compteur > 5) return resolve({ status: 0, body: '' });

    let parsedUrl;
    try { parsedUrl = new URL(url); }
    catch (e) { return resolve({ status: 0, body: '' }); }

    const isHttps = parsedUrl.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: (parsedUrl.pathname || '/') + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9',
      },
      rejectUnauthorized: false, // accepte les certificats SSL expirés (fréquent chez les clubs)
    };

    const req = lib.request(options, (res) => {
      // Suivi des redirections
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        try {
          const redirectUrl = new URL(res.headers.location, url).toString();
          resolve(fetchAvecRedirections(redirectUrl, compteur + 1));
        } catch (e) {
          resolve({ status: 0, body: '' });
        }
        return;
      }

      let body = '';
      let bytesLus = 0;
      res.setEncoding('utf8');

      res.on('data', chunk => {
        bytesLus += chunk.length;
        if (bytesLus <= MAX_BYTES) body += chunk;
        else res.destroy(); // on a assez lu
      });
      res.on('end',  () => resolve({ status: res.statusCode, body }));
      res.on('close',() => resolve({ status: res.statusCode, body }));
    });

    req.on('error', () => resolve({ status: 0, body: '' }));
    req.setTimeout(TIMEOUT_MS, () => { req.destroy(); resolve({ status: 0, body: '' }); });
    req.end();
  });
}

function extraireLiensReseaux(html) {
  const resultat = { facebook: '', instagram: '' };
  const pattern = /href=["']([^"'<>\s]{5,300})["']/gi;
  let match;

  while ((match = pattern.exec(html)) !== null) {
    const raw   = match[1];
    const lower = raw.toLowerCase();

    if (!resultat.facebook && (lower.includes('facebook.com/') || lower.includes('fb.com/'))) {
      if (raw.startsWith('http') && !FB_EXCLUDES.some(ex => lower.includes(ex))) {
        resultat.facebook = raw.replace(/\/$/, '');
      }
    }

    if (!resultat.instagram && lower.includes('instagram.com/')) {
      if (raw.startsWith('http') && !IG_EXCLUDES.some(ex => lower.includes(ex))) {
        resultat.instagram = raw.replace(/\/$/, '');
      }
    }

    if (resultat.facebook && resultat.instagram) break;
  }

  return resultat;
}

async function main() {
  // Reprendre depuis le fichier enrichi si existant, sinon depuis l'original
  const sourceFichier = fs.existsSync(OUTPUT_CSV) ? OUTPUT_CSV : INPUT_CSV;
  const estReprise = sourceFichier === OUTPUT_CSV;

  if (estReprise) {
    console.log('\n📂 Fichier enrichi détecté → reprise depuis klubik_social_enrichi.csv');
  }

  const contenu = fs.readFileSync(sourceFichier, 'utf8');
  const lignes  = contenu.split('\n');
  const header  = lignes[0];
  const dataLignes = lignes.slice(1).filter(l => l.trim());

  const clubs = dataLignes.map(l => parseCsvLine(l));

  // Clubs à traiter : ont un site web ET manquent FB ou IG
  const aTraiter = clubs
    .map((cols, i) => ({ cols, i }))
    .filter(({ cols }) => {
      const site = cols[COL_SITE]?.trim();
      const fb   = cols[COL_FB]?.trim();
      const ig   = cols[COL_IG]?.trim();
      return site && (!fb || !ig);
    });

  const avecSite    = clubs.filter(c => c[COL_SITE]?.trim()).length;
  const dejaFb      = clubs.filter(c => c[COL_FB]?.trim()).length;
  const dejaIg      = clubs.filter(c => c[COL_IG]?.trim()).length;

  console.log(`\n📊 Total clubs         : ${clubs.length}`);
  console.log(`🌐 Avec site web       : ${avecSite}`);
  console.log(`📘 Avec Facebook déjà  : ${dejaFb}`);
  console.log(`📷 Avec Instagram déjà : ${dejaIg}`);
  console.log(`🔍 À scraper           : ${aTraiter.length}`);
  console.log(`\nDémarrage dans 3 secondes...\n`);
  await sleep(3000);

  let fbTrouves  = 0;
  let igTrouves  = 0;
  let sitesOk    = 0;
  let sitesFails = 0;

  for (let j = 0; j < aTraiter.length; j++) {
    const { cols } = aTraiter[j];
    const nom  = (cols[COL_NOM] || '').substring(0, 32).padEnd(32);
    const site = normaliserUrl(cols[COL_SITE]);

    process.stdout.write(`[${j + 1}/${aTraiter.length}] ${nom} `);

    const { status, body } = await fetchAvecRedirections(site);

    if (status === 200 && body) {
      sitesOk++;
      const trouvé = extraireLiensReseaux(body);
      const updates = [];

      if (trouvé.facebook && !cols[COL_FB]?.trim()) {
        cols[COL_FB] = trouvé.facebook;
        updates.push('FB');
        fbTrouves++;
      }
      if (trouvé.instagram && !cols[COL_IG]?.trim()) {
        cols[COL_IG] = trouvé.instagram;
        updates.push('IG');
        igTrouves++;
      }

      process.stdout.write(
        updates.length
          ? `→ ✅ ${updates.join(' + ')}\n`
          : `→ ○  aucun lien réseau trouvé\n`
      );
    } else {
      sitesFails++;
      process.stdout.write(`→ ❌ inaccessible (HTTP ${status})\n`);
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
  console.log(`   📷 Instagram trouvés : +${igTrouves}`);
  console.log(`   🌐 Sites accessibles : ${sitesOk}`);
  console.log(`   ❌ Sites inaccessibles : ${sitesFails}`);
  console.log(`   📄 Fichier de sortie : klubik_social_enrichi.csv`);
  console.log('══════════════════════════════════════════\n');
}

main().catch(console.error);
