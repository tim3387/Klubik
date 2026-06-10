/**
 * scraper_ffhb.js
 *
 * Scrape les pages clubs FFHB pour extraire les données complètes :
 * email, site web, adresse, réseaux sociaux, nb licenciés.
 *
 * Les données sont embarquées directement dans le HTML de chaque page
 * (attribut JSON du <smartfire-component>), pas besoin de JS.
 *
 * UTILISATION :
 *   node scraper_ffhb.js
 *
 * Le script reprend là où il s'est arrêté (sauvegarde toutes les SAVE_EVERY requêtes).
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const INPUT_CSV  = path.join(__dirname, 'clubs_handball_france.csv');
const OUTPUT_CSV = path.join(__dirname, 'clubs_ffhb_enrichis.csv');
const DELAY_MS   = 600;   // délai entre requêtes (600ms ≈ 3713 clubs en ~40 min)
const SAVE_EVERY = 50;    // sauvegarde tous les N clubs traités
// ──────────────────────────────────────────────────────────────────────────────

// Correspondance code département → région
const DEPT_TO_REGION = {
  '01':'Auvergne-Rhône-Alpes','03':'Auvergne-Rhône-Alpes','07':'Auvergne-Rhône-Alpes',
  '15':'Auvergne-Rhône-Alpes','26':'Auvergne-Rhône-Alpes','38':'Auvergne-Rhône-Alpes',
  '42':'Auvergne-Rhône-Alpes','43':'Auvergne-Rhône-Alpes','63':'Auvergne-Rhône-Alpes',
  '69':'Auvergne-Rhône-Alpes','73':'Auvergne-Rhône-Alpes','74':'Auvergne-Rhône-Alpes',
  '21':'Bourgogne-Franche-Comté','25':'Bourgogne-Franche-Comté','39':'Bourgogne-Franche-Comté',
  '58':'Bourgogne-Franche-Comté','70':'Bourgogne-Franche-Comté','71':'Bourgogne-Franche-Comté',
  '89':'Bourgogne-Franche-Comté','90':'Bourgogne-Franche-Comté',
  '22':'Bretagne','29':'Bretagne','35':'Bretagne','56':'Bretagne',
  '18':'Centre-Val de Loire','28':'Centre-Val de Loire','36':'Centre-Val de Loire',
  '37':'Centre-Val de Loire','41':'Centre-Val de Loire','45':'Centre-Val de Loire',
  '2A':'Corse','2B':'Corse',
  '08':'Grand Est','10':'Grand Est','51':'Grand Est','52':'Grand Est',
  '54':'Grand Est','55':'Grand Est','57':'Grand Est','67':'Grand Est',
  '68':'Grand Est','88':'Grand Est',
  '971':'Guadeloupe','972':'Martinique','973':'Guyane','974':'La Réunion','976':'Mayotte',
  '02':'Hauts-de-France','59':'Hauts-de-France','60':'Hauts-de-France',
  '62':'Hauts-de-France','80':'Hauts-de-France',
  '75':'Île-de-France','77':'Île-de-France','78':'Île-de-France','91':'Île-de-France',
  '92':'Île-de-France','93':'Île-de-France','94':'Île-de-France','95':'Île-de-France',
  '14':'Normandie','27':'Normandie','50':'Normandie','61':'Normandie','76':'Normandie',
  '16':'Nouvelle-Aquitaine','17':'Nouvelle-Aquitaine','19':'Nouvelle-Aquitaine',
  '23':'Nouvelle-Aquitaine','24':'Nouvelle-Aquitaine','33':'Nouvelle-Aquitaine',
  '40':'Nouvelle-Aquitaine','47':'Nouvelle-Aquitaine','64':'Nouvelle-Aquitaine',
  '79':'Nouvelle-Aquitaine','86':'Nouvelle-Aquitaine','87':'Nouvelle-Aquitaine',
  '09':'Occitanie','11':'Occitanie','12':'Occitanie','30':'Occitanie',
  '31':'Occitanie','32':'Occitanie','34':'Occitanie','46':'Occitanie',
  '48':'Occitanie','65':'Occitanie','66':'Occitanie','81':'Occitanie','82':'Occitanie',
  '44':'Pays de la Loire','49':'Pays de la Loire','53':'Pays de la Loire',
  '72':'Pays de la Loire','85':'Pays de la Loire',
  '04':'Provence-Alpes-Côte d\'Azur','05':'Provence-Alpes-Côte d\'Azur',
  '06':'Provence-Alpes-Côte d\'Azur','13':'Provence-Alpes-Côte d\'Azur',
  '83':'Provence-Alpes-Côte d\'Azur','84':'Provence-Alpes-Côte d\'Azur',
};

const DEPT_NAMES = {
  '01':'Ain','02':'Aisne','03':'Allier','04':'Alpes-de-Haute-Provence','05':'Hautes-Alpes',
  '06':'Alpes-Maritimes','07':'Ardèche','08':'Ardennes','09':'Ariège','10':'Aube',
  '11':'Aude','12':'Aveyron','13':'Bouches-du-Rhône','14':'Calvados','15':'Cantal',
  '16':'Charente','17':'Charente-Maritime','18':'Cher','19':'Corrèze','2A':'Corse-du-Sud',
  '2B':'Haute-Corse','21':'Côte-d\'Or','22':'Côtes-d\'Armor','23':'Creuse','24':'Dordogne',
  '25':'Doubs','26':'Drôme','27':'Eure','28':'Eure-et-Loir','29':'Finistère',
  '30':'Gard','31':'Haute-Garonne','32':'Gers','33':'Gironde','34':'Hérault',
  '35':'Ille-et-Vilaine','36':'Indre','37':'Indre-et-Loire','38':'Isère','39':'Jura',
  '40':'Landes','41':'Loir-et-Cher','42':'Loire','43':'Haute-Loire','44':'Loire-Atlantique',
  '45':'Loiret','46':'Lot','47':'Lot-et-Garonne','48':'Lozère','49':'Maine-et-Loire',
  '50':'Manche','51':'Marne','52':'Haute-Marne','53':'Mayenne','54':'Meurthe-et-Moselle',
  '55':'Meuse','56':'Morbihan','57':'Moselle','58':'Nièvre','59':'Nord',
  '60':'Oise','61':'Orne','62':'Pas-de-Calais','63':'Puy-de-Dôme','64':'Pyrénées-Atlantiques',
  '65':'Hautes-Pyrénées','66':'Pyrénées-Orientales','67':'Bas-Rhin','68':'Haut-Rhin',
  '69':'Rhône','70':'Haute-Saône','71':'Saône-et-Loire','72':'Sarthe','73':'Savoie',
  '74':'Haute-Savoie','75':'Paris','76':'Seine-Maritime','77':'Seine-et-Marne',
  '78':'Yvelines','79':'Deux-Sèvres','80':'Somme','81':'Tarn','82':'Tarn-et-Garonne',
  '83':'Var','84':'Vaucluse','85':'Vendée','86':'Vienne','87':'Haute-Vienne',
  '88':'Vosges','89':'Yonne','90':'Territoire de Belfort','91':'Essonne',
  '92':'Hauts-de-Seine','93':'Seine-Saint-Denis','94':'Val-de-Marne','95':'Val-d\'Oise',
  '971':'Guadeloupe','972':'Martinique','973':'Guyane','974':'La Réunion','976':'Mayotte',
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getCodeDept(zipcode) {
  if (!zipcode) return '';
  const z = String(zipcode).trim();
  if (z.startsWith('971')) return '971';
  if (z.startsWith('972')) return '972';
  if (z.startsWith('973')) return '973';
  if (z.startsWith('974')) return '974';
  if (z.startsWith('976')) return '976';
  if (z.startsWith('20')) {
    // Corse : 20000-20190 → 2A, 20200+ → 2B (approximatif)
    const num = parseInt(z);
    return num <= 20190 ? '2A' : '2B';
  }
  return z.substring(0, 2);
}

function decodeHTMLEntities(str) {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#039;/g, "'");
}

function fetchPage(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      path: u.pathname,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html',
        'Accept-Language': 'fr-FR,fr;q=0.9',
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', () => resolve({ status: 0, body: '' }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ status: 0, body: '' }); });
    req.end();
  });
}

function extractClubData(html) {
  const match = html.match(/name='single-club---home-hero-club' attributes="([^"]+)"/);
  if (!match) return null;
  try {
    const decoded = decodeHTMLEntities(match[1]);
    const data = JSON.parse(decoded);
    const post = data.post || {};
    const acf = post.acf || {};

    const zipcode = acf.zipcode_club || '';
    const codeDept = getCodeDept(zipcode);
    const dept = DEPT_NAMES[codeDept] || '';
    const region = DEPT_TO_REGION[codeDept] || '';

    const nbLicences =
      (parseInt(acf.nb_licence_senior_h_club) || 0) +
      (parseInt(acf.nb_licence_senior_f_club) || 0) +
      (parseInt(acf.nb_licence_jeunes_h_club) || 0) +
      (parseInt(acf.nb_licence_jeunes_f_club) || 0);

    return {
      nom_club: post.post_title || '',
      email_club: acf.email_club || '',
      url_club: acf.url_club || '',
      facebook_club: acf.facebook_club || '',
      instagram_club: acf.instagram_club || '',
      adresse: [acf.address_club, acf.address_club_2].filter(Boolean).join(' '),
      ville: acf.city_club || '',
      code_postal: zipcode,
      code_dept: codeDept,
      departement: dept,
      region: region,
      nb_licences: nbLicences || '',
      id_club: acf.id_club || '',
    };
  } catch (e) {
    return null;
  }
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
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
    const s = String(c || '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }).join(',');
}

const OUTPUT_HEADER = [
  'Nom du club', 'Email', 'Site web', 'Facebook', 'Instagram',
  'Adresse', 'Ville', 'Code postal', 'Code département', 'Département', 'Région',
  'Nb licenciés', 'ID club FFHB', 'URL FFHB'
].join(',');

async function main() {
  // Charger les clubs à scraper
  const inputContent = fs.readFileSync(INPUT_CSV, 'utf8');
  const inputLines = inputContent.split('\n').filter(l => l.trim());
  // Format : nom_club,url_ffhb (pas d'en-tête dans ce fichier)
  // On détermine s'il y a un header
  const firstLine = inputLines[0];
  const hasHeader = firstLine.toLowerCase().includes('nom') || firstLine.toLowerCase().includes('url');
  const dataLines = hasHeader ? inputLines.slice(1) : inputLines;

  // Charger les slugs déjà traités depuis le fichier de sortie
  const processed = new Set();
  if (fs.existsSync(OUTPUT_CSV)) {
    const existingContent = fs.readFileSync(OUTPUT_CSV, 'utf8');
    const existingLines = existingContent.split('\n').slice(1).filter(l => l.trim());
    for (const line of existingLines) {
      const cols = parseCsvLine(line);
      const urlFfhb = cols[13] || '';
      if (urlFfhb) processed.add(urlFfhb);
    }
    console.log(`\n📂 Reprise : ${processed.size} clubs déjà traités`);
  }

  // Clubs à traiter
  const toProcess = [];
  for (const line of dataLines) {
    const cols = parseCsvLine(line);
    const nomClub = cols[0] ? cols[0].trim() : '';
    const urlFfhb = cols[1] ? cols[1].trim() : '';
    if (urlFfhb && !processed.has(urlFfhb)) {
      toProcess.push({ nomClub, urlFfhb });
    }
  }

  console.log(`📊 ${dataLines.length} clubs au total`);
  console.log(`✅ ${processed.size} déjà traités`);
  console.log(`🔄 ${toProcess.length} à scraper\n`);

  // Initialiser le fichier de sortie si nécessaire
  if (!fs.existsSync(OUTPUT_CSV)) {
    fs.writeFileSync(OUTPUT_CSV, OUTPUT_HEADER + '\n', 'utf8');
  }

  let success = 0;
  let errors = 0;
  const buffer = [];

  for (let i = 0; i < toProcess.length; i++) {
    const { nomClub, urlFfhb } = toProcess[i];
    process.stdout.write(`[${i+1}/${toProcess.length}] ${nomClub.substring(0,35).padEnd(35)} `);

    const { status, body } = await fetchPage(urlFfhb);

    if (status === 200 && body) {
      const data = extractClubData(body);
      if (data) {
        const row = [
          data.nom_club, data.email_club, data.url_club, data.facebook_club, data.instagram_club,
          data.adresse, data.ville, data.code_postal, data.code_dept, data.departement, data.region,
          data.nb_licences, data.id_club, urlFfhb
        ];
        buffer.push(toCsvLine(row));
        const emailInfo = data.email_club ? `📧 ${data.email_club}` : '(pas d\'email)';
        process.stdout.write(`→ ✅ ${data.ville} ${emailInfo}\n`);
        success++;
      } else {
        process.stdout.write(`→ ⚠️  données non trouvées\n`);
        errors++;
      }
    } else {
      process.stdout.write(`→ ❌ HTTP ${status}\n`);
      errors++;
    }

    // Sauvegarde intermédiaire
    if (buffer.length > 0 && (i + 1) % SAVE_EVERY === 0) {
      fs.appendFileSync(OUTPUT_CSV, buffer.join('\n') + '\n', 'utf8');
      buffer.length = 0;
      console.log(`  💾 Sauvegarde automatique (${success} clubs enrichis, ${errors} erreurs)`);
    }

    await sleep(DELAY_MS);
  }

  // Vider le buffer restant
  if (buffer.length > 0) {
    fs.appendFileSync(OUTPUT_CSV, buffer.join('\n') + '\n', 'utf8');
  }

  console.log(`\n🎉 Terminé !`);
  console.log(`   ✅ Succès  : ${success} clubs enrichis`);
  console.log(`   ❌ Erreurs : ${errors} clubs`);
  console.log(`   📄 Fichier : ${OUTPUT_CSV}`);
}

main().catch(console.error);
