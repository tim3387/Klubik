/**
 * Scraper de contacts clubs handball via Apify
 * Extrait : emails directs + noms des dirigeants (président, secrétaire)
 * depuis les sites web de chaque club.
 *
 * Usage :
 *   node scraper_contacts_apify.js           → test 20 clubs
 *   node scraper_contacts_apify.js --all     → tous les clubs (2 423)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });
const APIFY_TOKEN = process.env.APIFY_TOKEN;
const CSV_INPUT  = path.join(__dirname, 'klubik_scored.csv');
const CSV_OUTPUT = path.join(__dirname, 'klubik_contacts_enrichis.csv');

const TEST_MODE = !process.argv.includes('--all');
const TEST_LIMIT = 20;

// ─── Lecture CSV ──────────────────────────────────────────────────────────────

function parseCSV(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split('\n').filter(l => l.trim());
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const obj = {};
    headers.forEach((h, i) => { obj[h.trim()] = (values[i] || '').trim(); });
    return obj;
  });
}

function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// ─── Appel API Apify ─────────────────────────────────────────────────────────

function apifyRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.apify.com',
      path: path + (path.includes('?') ? '&' : '?') + 'token=' + APIFY_TOKEN,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = https.request(options, res => {
      let out = '';
      res.on('data', d => { out += d; });
      res.on('end', () => {
        try { resolve(JSON.parse(out)); }
        catch (e) { resolve(out); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Fonction de scraping injectée dans Apify ─────────────────────────────────
// Apify cheerio-scraper exécute cette fonction côté serveur pour chaque page

const PAGE_FUNCTION = `
async function pageFunction(context) {
  const { $, request, log, enqueueRequest } = context;

  const texte = $('body').text();
  const html   = $('body').html() || '';

  // Désobfuscation des emails masqués (anti-spam courant)
  const desobfusquer = (src) => src
    .replace(/\\[at\\]|\\{at\\}|\\(at\\)|\\s+at\\s+/gi, '@')
    .replace(/\\[dot\\]|\\{dot\\}|\\(dot\\)|\\s+dot\\s+/gi, '.')
    .replace(/\\[arobase\\]|\\{arobase\\}/gi, '@')
    .replace(/&#64;/g, '@')
    .replace(/&#46;/g, '.');

  const srcDesobf = desobfusquer(texte + ' ' + html);

  // Emails via liens mailto
  const mailtoEmails = [];
  $('a[href^="mailto:"]').each((_, el) => {
    const email = $(el).attr('href').replace('mailto:', '').split('?')[0].trim().toLowerCase();
    if (email && email.includes('@')) mailtoEmails.push(email);
  });

  // Emails dans le texte (incluant les versions désobfusquées)
  const emailRegex = /[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}/g;
  const textEmails = (srcDesobf.match(emailRegex) || []).map(e => e.toLowerCase());

  const emails = [...new Set([...mailtoEmails, ...textEmails])].filter(e =>
    !e.includes('ffhandball') &&
    !e.includes('@sentry') &&
    !e.includes('@wixpress') &&
    !e.includes('@example') &&
    !e.includes('noreply') &&
    !e.includes('no-reply') &&
    !e.match(/\\.(png|jpg|gif|svg|webp)$/) &&
    !e.startsWith('schema@') &&
    !e.startsWith('support@') &&
    e.includes('.') &&
    e.length < 80
  );

  // Dirigeants : recherche multi-patterns dans le texte et dans les cellules HTML
  const srcBrut = texte + ' ' + html.replace(/<[^>]+>/g, ' ');

  const patterns = {
    president: [
      /pr[ée]sident(?:e)?\\s*[:\\-–]\\s*([A-ZÀÁÂÄÇÉÈÊËÎÏÔÙÛÜ][a-zA-ZÀ-ÿ'\\-]+(?:\\s+[A-ZÀÁÂÄÇÉÈÊËÎÏÔÙÛÜ][a-zA-ZÀ-ÿ'\\-]+)+)/gi,
      /([A-ZÀÁÂÄÇÉÈÊËÎÏÔÙÛÜ][a-zA-ZÀ-ÿ'\\-]+(?:\\s+[A-ZÀÁÂÄÇÉÈÊËÎÏÔÙÛÜ][a-zA-ZÀ-ÿ'\\-]+)+)\\s*(?:[-–])\\s*pr[ée]sident(?:e)?/gi,
    ],
    secretaire: [
      /secr[ée]taire(?:\\s+g[ée]n[ée]ral(?:e)?)?\\s*[:\\-–]\\s*([A-ZÀÁÂÄÇÉÈÊËÎÏÔÙÛÜ][a-zA-ZÀ-ÿ'\\-]+(?:\\s+[A-ZÀÁÂÄÇÉÈÊËÎÏÔÙÛÜ][a-zA-ZÀ-ÿ'\\-]+)+)/gi,
      /([A-ZÀÁÂÄÇÉÈÊËÎÏÔÙÛÜ][a-zA-ZÀ-ÿ'\\-]+(?:\\s+[A-ZÀÁÂÄÇÉÈÊËÎÏÔÙÛÜ][a-zA-ZÀ-ÿ'\\-]+)+)\\s*(?:[-–])\\s*secr[ée]taire/gi,
    ],
  };

  const extraire = (regexList) => {
    for (const regex of regexList) {
      let m;
      while ((m = regex.exec(srcBrut)) !== null) {
        const nom = m[1].trim();
        if (nom.length > 4 && nom.length < 50 && nom.split(' ').length >= 2) return nom;
      }
    }
    return null;
  };

  // Mise en file des pages contact/bureau (seulement depuis la page d'accueil)
  if (request.userData.isHomepage) {
    const subpages = ['/contact', '/bureau', '/le-club', '/notre-club', '/club', '/equipe', '/presentation', '/comite-directeur'];
    const base = new URL(request.url).origin;
    for (const sub of subpages) {
      await enqueueRequest({ url: base + sub, userData: { ...request.userData, isHomepage: false } });
    }
  }

  return {
    url:          request.url,
    siteOriginal: request.userData.siteOriginal,
    nomClub:      request.userData.nomClub,
    emails,
    president:    extraire(patterns.president),
    secretaire:   extraire(patterns.secretaire),
  };
}
`;

// ─── Lancement du run Apify ───────────────────────────────────────────────────

async function lancerScraper(clubs) {
  console.log(`\n📋 Clubs à traiter : ${clubs.length}`);

  const startUrls = clubs.map(c => ({
    url: c['Site web'].replace(/\/$/, ''),
    userData: {
      siteOriginal: c['Site web'],
      nomClub: c['Nom du club'],
      isHomepage: true,
    },
  }));

  const input = {
    startUrls,
    pageFunction: PAGE_FUNCTION,
    maxPagesPerCrawl: clubs.length * 8, // homepage + 7 sous-pages max par club
    maxConcurrency: 10,
    pageLoadTimeoutSecs: 15,
    ignoreSslErrors: true,
    useApifyProxy: false,
  };

  console.log('🚀 Lancement du run Apify (cheerio-scraper)...');
  const run = await apifyRequest('POST', '/v2/acts/apify~cheerio-scraper/runs', input);

  if (!run.data || !run.data.id) {
    console.error('❌ Erreur au lancement :', JSON.stringify(run, null, 2));
    process.exit(1);
  }

  const runId = run.data.id;
  console.log(`✅ Run créé : ${runId}`);
  console.log(`🔗 https://console.apify.com/actors/runs/${runId}`);

  // Attendre la fin du run
  let status = 'RUNNING';
  let dots = 0;
  while (['RUNNING', 'READY'].includes(status)) {
    await sleep(5000);
    const check = await apifyRequest('GET', `/v2/actor-runs/${runId}`, null);
    status = check.data.status;
    process.stdout.write(`\r⏳ En cours... ${++dots * 5}s (statut: ${status})   `);
  }
  console.log(`\n🏁 Run terminé avec statut : ${status}`);

  if (status !== 'SUCCEEDED') {
    console.error('❌ Le run a échoué. Vérifie dans la console Apify.');
    process.exit(1);
  }

  // Récupérer les résultats
  const datasetId = run.data.defaultDatasetId ||
    (await apifyRequest('GET', `/v2/actor-runs/${runId}`, null)).data.defaultDatasetId;

  console.log('📥 Récupération des résultats...');
  const dataset = await apifyRequest('GET', `/v2/datasets/${datasetId}/items?limit=50000`, null);
  const items = Array.isArray(dataset) ? dataset : (dataset.data?.items || []);
  console.log(`✅ ${items.length} pages scrapées`);
  return items;
}

// ─── Fusion des résultats avec le CSV ─────────────────────────────────────────

function fusionner(clubs, items) {
  // Regrouper les résultats par nomClub
  const parClub = {};
  for (const item of items) {
    if (!item.nomClub) continue;
    if (!parClub[item.nomClub]) parClub[item.nomClub] = { emails: [], presidents: [], secretaires: [] };
    parClub[item.nomClub].emails.push(...(item.emails || []));
    if (item.president)  parClub[item.nomClub].presidents.push(item.president);
    if (item.secretaire) parClub[item.nomClub].secretaires.push(item.secretaire);
  }

  // Dédoublonner et nettoyer
  for (const club of Object.values(parClub)) {
    club.emails = [...new Set(club.emails)];
    club.presidents = [...new Set(club.presidents)];
    club.secretaires = [...new Set(club.secretaires)];
  }

  // Enrichir le CSV
  let trouves = 0;
  const enrichis = clubs.map(club => {
    const nom = club['Nom du club'];
    const data = parClub[nom];
    if (data) {
      const emailPrincipal = data.emails[0] || '';
      const autresEmails = data.emails.slice(1).join(' | ');
      if (emailPrincipal) trouves++;
      return {
        ...club,
        'Email direct':   emailPrincipal,
        'Autres emails':  autresEmails,
        'Président nom':  data.presidents[0] || '',
        'Secrétaire nom': data.secretaires[0] || '',
      };
    }
    return { ...club, 'Email direct': '', 'Autres emails': '', 'Président nom': '', 'Secrétaire nom': '' };
  });

  console.log(`\n📊 Emails directs trouvés : ${trouves} / ${clubs.filter(c => c['Site web']).length} clubs avec site web`);
  return enrichis;
}

// ─── Export CSV ───────────────────────────────────────────────────────────────

function exporterCSV(clubs) {
  const headers = [
    ...Object.keys(clubs[0]).filter(h => !['Email direct','Autres emails','Président nom','Secrétaire nom'].includes(h)),
    'Email direct', 'Autres emails', 'Président nom', 'Secrétaire nom'
  ];
  const lines = [headers.join(',')];
  for (const club of clubs) {
    lines.push(headers.map(h => escapeCSV(club[h])).join(','));
  }
  fs.writeFileSync(CSV_OUTPUT, lines.join('\n'), 'utf8');
  console.log(`\n💾 Fichier exporté : ${CSV_OUTPUT}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('📂 Lecture du CSV...');
  const tousLesClubs = parseCSV(CSV_INPUT);
  const avecSite = tousLesClubs.filter(c => {
    const url = c['Site web'];
    if (!url || !url.startsWith('http')) return false;
    try {
      const parsed = new URL(url);
      // Exclure URLs vides (juste http://) et pages Facebook/Instagram
      return parsed.hostname.length > 3 &&
             !parsed.hostname.includes('facebook.com') &&
             !parsed.hostname.includes('instagram.com') &&
             !parsed.hostname.includes('twitter.com');
    } catch { return false; }
  });

  const clubs = TEST_MODE ? avecSite.slice(0, TEST_LIMIT) : avecSite;

  if (TEST_MODE) {
    console.log(`\n⚠️  MODE TEST — ${TEST_LIMIT} clubs seulement.`);
    console.log('   Lance avec --all pour traiter tous les clubs.\n');
    console.log('Clubs testés :');
    clubs.forEach(c => console.log(`  - ${c['Nom du club']} → ${c['Site web']}`));
  }

  const items = await lancerScraper(clubs);
  const enrichis = fusionner(tousLesClubs, items);
  exporterCSV(enrichis);

  console.log('\n✅ Terminé !');
  console.log(`📁 Résultat : ${CSV_OUTPUT}`);
}

// Pour relire un run existant sans relancer le scraper :
// node scraper_contacts_apify.js --dataset <datasetId>
if (process.argv.includes('--dataset')) {
  const idx = process.argv.indexOf('--dataset');
  const datasetId = process.argv[idx + 1];
  (async () => {
    console.log(`📥 Lecture du dataset existant : ${datasetId}`);
    const raw = await apifyRequest('GET', `/v2/datasets/${datasetId}/items?limit=50000`, null);
    const items = Array.isArray(raw) ? raw : (raw.items || []);
    console.log(`✅ ${items.length} pages récupérées`);
    const clubs = parseCSV(CSV_INPUT);
    const enrichis = fusionner(clubs, items);
    exporterCSV(enrichis);
  })().catch(err => { console.error(err); process.exit(1); });
} else {
  main().catch(err => {
    console.error('Erreur fatale :', err);
    process.exit(1);
  });
}
