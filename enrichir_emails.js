/**
 * enrichir_emails.js
 *
 * Cherche automatiquement l'email de chaque club de handball
 * via DuckDuckGo (gratuit, sans clé API).
 *
 * UTILISATION :
 *   1. Installe les dépendances :  npm install axios cheerio
 *   2. Lance :  node enrichir_emails.js
 *   3. Le fichier klubik_merged_enrichi.csv sera mis à jour au fur et à mesure
 *
 * Le script reprend là où il s'est arrêté (il sauvegarde toutes les 10 clubs).
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const INPUT_CSV  = path.join(__dirname, 'klubik_merged.csv');
const OUTPUT_CSV = path.join(__dirname, 'klubik_merged_enrichi.csv');
const DELAY_MS   = 2000; // délai entre chaque recherche (respecte les rate limits)
const SAVE_EVERY = 10;   // sauvegarde tous les N clubs traités
// ──────────────────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Recherche DuckDuckGo HTML (pas d'API officielle nécessaire)
function searchDuckDuckGo(query) {
  return new Promise((resolve) => {
    const encodedQuery = encodeURIComponent(query);
    const options = {
      hostname: 'html.duckduckgo.com',
      path: `/html/?q=${encodedQuery}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'fr-FR,fr;q=0.9',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });

    req.on('error', () => resolve(''));
    req.setTimeout(10000, () => { req.destroy(); resolve(''); });
    req.end();
  });
}

// Extrait la première adresse email trouvée dans un texte
function extractEmail(text) {
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailRegex) || [];
  // Filtre les emails génériques ou faux
  const filtered = matches.filter(e =>
    !e.includes('example') &&
    !e.includes('test@') &&
    !e.includes('noreply') &&
    !e.includes('no-reply') &&
    !e.includes('duckduckgo') &&
    !e.includes('w3.org') &&
    !e.includes('sentry.io') &&
    e.length < 60
  );
  return filtered[0] || null;
}

// Cherche l'email d'un club
async function findEmail(nomClub) {
  const query = `"${nomClub}" handball contact email`;
  const html = await searchDuckDuckGo(query);
  return extractEmail(html);
}

// Parse une ligne CSV (gère les guillemets)
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

// Convertit un tableau de valeurs en ligne CSV
function toCsvLine(cols) {
  return cols.map(c => {
    if (c && (c.includes(',') || c.includes('"') || c.includes('\n'))) {
      return '"' + c.replace(/"/g, '""') + '"';
    }
    return c || '';
  }).join(',');
}

async function main() {
  // Charger le CSV
  const source = fs.existsSync(OUTPUT_CSV) ? OUTPUT_CSV : INPUT_CSV;
  console.log(`\n📂 Lecture de : ${source}`);

  const content = fs.readFileSync(source, 'utf8');
  const lines = content.split('\n');
  const header = lines[0];
  const rows = lines.slice(1).filter(l => l.trim());

  // Trouver l'index de la colonne email
  const headerCols = header.split(',');
  const emailIdx = headerCols.findIndex(c => c.toLowerCase().includes('email'));
  if (emailIdx === -1) {
    console.error('❌ Colonne email non trouvée dans le CSV');
    process.exit(1);
  }

  console.log(`📊 ${rows.length} clubs à traiter`);
  const sansEmail = rows.filter(r => {
    const cols = parseCsvLine(r);
    return !cols[emailIdx] || !cols[emailIdx].trim();
  }).length;
  console.log(`📧 ${sansEmail} clubs sans email (à enrichir)`);
  console.log(`✅ ${rows.length - sansEmail} clubs ont déjà un email\n`);

  let enriched = 0;
  let processed = 0;
  const updatedRows = [...rows];

  for (let i = 0; i < rows.length; i++) {
    const cols = parseCsvLine(rows[i]);
    const nomClub = cols[0] ? cols[0].trim() : '';
    const emailExistant = cols[emailIdx] ? cols[emailIdx].trim() : '';

    // Passer les clubs qui ont déjà un email
    if (emailExistant) continue;
    if (!nomClub) continue;

    process.stdout.write(`[${i+1}/${rows.length}] Recherche : ${nomClub.substring(0, 40).padEnd(40)} `);

    const email = await findEmail(nomClub);

    if (email) {
      cols[emailIdx] = email;
      updatedRows[i] = toCsvLine(cols);
      enriched++;
      process.stdout.write(`→ ✅ ${email}\n`);
    } else {
      process.stdout.write(`→ ❌ non trouvé\n`);
    }

    processed++;

    // Sauvegarde intermédiaire
    if (processed % SAVE_EVERY === 0) {
      const output = header + '\n' + updatedRows.join('\n');
      fs.writeFileSync(OUTPUT_CSV, output, 'utf8');
      console.log(`  💾 Sauvegarde automatique (${enriched} emails trouvés jusqu'ici)`);
    }

    await sleep(DELAY_MS);
  }

  // Sauvegarde finale
  const output = header + '\n' + updatedRows.join('\n');
  fs.writeFileSync(OUTPUT_CSV, output, 'utf8');
  console.log(`\n🎉 Terminé !`);
  console.log(`   Emails trouvés : ${enriched} / ${processed} clubs traités`);
  console.log(`   Fichier sauvegardé : ${OUTPUT_CSV}`);
}

main().catch(console.error);
