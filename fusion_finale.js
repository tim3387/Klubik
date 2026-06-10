/**
 * fusion_finale.js
 *
 * Fusionne clubs_ffhb_enrichis.csv (3710 clubs avec email, site, adresse...)
 * avec klubik_existing.csv (593 clubs avec données CRM : Niveau, Contacté, etc.)
 *
 * Résultat : klubik_final.csv — le fichier CRM complet prêt pour Google Sheets.
 */

const fs = require('fs');
const path = require('path');

const FFHB_CSV    = path.join(__dirname, 'clubs_ffhb_enrichis.csv');
const EXISTING_CSV = 'C:/Users/lecle/Desktop/klubik_existing.csv';
const OUTPUT_CSV  = path.join(__dirname, 'klubik_final.csv');

// ─── UTILITAIRES ─────────────────────────────────────────────────────────────

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
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

function normalize(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // supprime accents
    .replace(/[^a-z0-9]/g, '');                         // garde alphanum seulement
}

// ─── CHARGEMENT ──────────────────────────────────────────────────────────────

function loadCsv(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());
  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map(l => {
    const cols = parseCsvLine(l);
    const obj = {};
    headers.forEach((h, i) => obj[h.trim()] = cols[i] || '');
    return obj;
  });
  return { headers, rows };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

function main() {
  console.log('📂 Chargement des fichiers...');
  const ffhb     = loadCsv(FFHB_CSV);
  const existing = loadCsv(EXISTING_CSV);

  console.log(`   FFHB enrichi  : ${ffhb.rows.length} clubs`);
  console.log(`   CRM existant  : ${existing.rows.length} clubs`);

  // Index du CRM : par URL FFHB normalisée et par nom normalisé
  const crmByUrl  = new Map();
  const crmByName = new Map();

  for (const row of existing.rows) {
    // L'URL FFHB peut être dans "Adresse email" (l'ancienne structure) ou ailleurs
    const urlField = row['Adresse email'] || '';
    if (urlField.includes('monclub.ffhandball.fr')) {
      crmByUrl.set(urlField.replace(/\/$/, ''), row);
    }
    // Aussi indexer par nom normalisé
    const nom = normalize(row['Nom du club']);
    if (nom) crmByName.set(nom, row);
  }

  console.log(`   Index URL     : ${crmByUrl.size} entrées`);
  console.log(`   Index nom     : ${crmByName.size} entrées`);

  // En-tête du fichier final
  const OUTPUT_HEADER = [
    'Nom du club',
    'Email FFHB',
    'Site web',
    'Facebook',
    'Instagram',
    'Adresse',
    'Ville',
    'Code postal',
    'Département',
    'Région',
    'Nb licenciés',
    'Niveau',
    'Contacté',
    'Relance',
    'Réponse',
    'Choix',
    'Infos club',
    'Consignes données',
    'URL FFHB',
  ].join(',');

  const outputLines = [OUTPUT_HEADER];
  let matchCount = 0;

  for (const club of ffhb.rows) {
    // Chercher la correspondance CRM
    const urlKey = (club['URL FFHB'] || '').replace(/\/$/, '');
    let crm = crmByUrl.get(urlKey);

    if (!crm) {
      // Fallback : correspondance par nom
      const nomKey = normalize(club['Nom du club']);
      crm = crmByName.get(nomKey);
    }

    if (crm) matchCount++;

    const row = [
      club['Nom du club'],
      club['Email'],
      club['Site web'],
      club['Facebook'],
      club['Instagram'],
      club['Adresse'],
      club['Ville'],
      club['Code postal'],
      club['Département'],
      club['Région'],
      club['Nb licenciés'],
      crm ? (crm['Niveau'] || '') : '',
      crm ? (crm['Contacté'] || 'Non') : 'Non',
      crm ? (crm['Relance'] || '') : '',
      crm ? (crm['Réponse'] || '') : '',
      crm ? (crm['Choix'] || '') : '',
      crm ? (crm['Infos club'] || '') : '',
      crm ? (crm['Consignes données'] || '') : '',
      club['URL FFHB'],
    ];

    outputLines.push(toCsvLine(row));
  }

  fs.writeFileSync(OUTPUT_CSV, outputLines.join('\n') + '\n', 'utf8');

  console.log(`\n🎉 Fusion terminée !`);
  console.log(`   ✅ ${ffhb.rows.length} clubs dans le fichier final`);
  console.log(`   🔗 ${matchCount} clubs fusionnés avec les données CRM existantes`);
  console.log(`   📄 Fichier : ${OUTPUT_CSV}`);
}

main();
