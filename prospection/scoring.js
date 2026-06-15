/**
 * scoring.js
 *
 * Calcule un score de prospection (0-10) pour chaque club à partir de :
 *   - Nb licenciés  (0-4 pts)
 *   - Site web      (+2 pts)
 *   - Facebook      (+2 pts)
 *   - Instagram     (+2 pts)
 *
 * Interprétation :
 *   0-2  → Exclure (trop petit ou aucune présence digitale)
 *   3-8  → Cible principale Klubik
 *   9-10 → Grand club très présent (vente plus difficile)
 *
 * UTILISATION :
 *   node scoring.js
 *
 * Produit : klubik_scored.csv (deux colonnes ajoutées : Score + Priorité)
 */

const fs   = require('fs');
const path = require('path');

const INPUT_CSV  = path.join(__dirname, 'klubik_social_enrichi.csv');
const OUTPUT_CSV = path.join(__dirname, 'klubik_scored.csv');

// Indices des colonnes dans klubik_social_enrichi.csv
const COL_SITE     = 2;
const COL_FB       = 3;
const COL_IG       = 4;
const COL_LICENCES = 10;

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

function calculerScore(cols) {
  let score = 0;

  // ── Nb licenciés (0-4 pts) ──────────────────────────────────────────────────
  const nbLic = parseInt(cols[COL_LICENCES] || '0', 10);
  if (!cols[COL_LICENCES] || cols[COL_LICENCES].trim() === '') {
    score += 1; // inconnu : on ne pénalise pas
  } else if (nbLic < 30) {
    score += 0;
  } else if (nbLic < 80) {
    score += 2;
  } else if (nbLic <= 200) {
    score += 3;
  } else {
    score += 4;
  }

  // ── Site web (+2 pts) ────────────────────────────────────────────────────────
  if (cols[COL_SITE]?.trim()) score += 2;

  // ── Facebook (+2 pts) ────────────────────────────────────────────────────────
  if (cols[COL_FB]?.trim()) score += 2;

  // ── Instagram (+2 pts) ───────────────────────────────────────────────────────
  if (cols[COL_IG]?.trim()) score += 2;

  return score;
}

function priorite(score) {
  if (score <= 2) return 'Exclure';
  if (score <= 5) return 'Cible B';
  if (score <= 8) return 'Cible A';
  return 'Cible A+';
}

function main() {
  const contenu    = fs.readFileSync(INPUT_CSV, 'utf8');
  const lignes     = contenu.split('\n');
  const header     = lignes[0].trimEnd();
  const dataLignes = lignes.slice(1).filter(l => l.trim());

  const clubs = dataLignes.map(l => parseCsvLine(l));

  // Statistiques
  const stats = { exclure: 0, cibleB: 0, cibleA: 0, cibleAPlus: 0 };
  const distribution = Array(11).fill(0);

  const clubsScores = clubs.map(cols => {
    const score = calculerScore(cols);
    const prio  = priorite(score);

    distribution[score]++;
    if (prio === 'Exclure')       stats.exclure++;
    else if (prio === 'Cible B')  stats.cibleB++;
    else if (prio === 'Cible A')  stats.cibleA++;
    else                          stats.cibleAPlus++;

    return [...cols, String(score), prio];
  });

  // En-tête avec les deux nouvelles colonnes
  const newHeader = header + ',Score,Priorité';

  // Écriture du fichier
  const sortie = [newHeader, ...clubsScores.map(c => toCsvLine(c))].join('\n');
  fs.writeFileSync(OUTPUT_CSV, sortie, 'utf8');

  // Rapport
  console.log('\n══════════════════════════════════════════');
  console.log('✅ Scoring terminé → klubik_scored.csv');
  console.log('══════════════════════════════════════════');
  console.log('\n📊 Distribution des scores :');
  distribution.forEach((n, score) => {
    if (n === 0) return;
    const barre = '█'.repeat(Math.round(n / 20));
    const label = score <= 2 ? ' ← exclure' : score <= 5 ? ' ← cible B' : score <= 8 ? ' ← cible A' : ' ← cible A+';
    console.log(`  Score ${score} : ${String(n).padStart(4)} clubs  ${barre}${label}`);
  });

  console.log('\n📋 Résumé :');
  console.log(`  🔴 Exclure  : ${stats.exclure} clubs (score 0-2)`);
  console.log(`  🟡 Cible B  : ${stats.cibleB} clubs (score 3-5) — petits clubs actifs`);
  console.log(`  🟢 Cible A  : ${stats.cibleA} clubs (score 6-8) — sweet spot Klubik`);
  console.log(`  🌟 Cible A+ : ${stats.cibleAPlus} clubs (score 9-10) — grands clubs`);
  console.log('\n💡 Prochaine étape : importer klubik_scored.csv dans Google Sheets');
  console.log('══════════════════════════════════════════\n');
}

main();
