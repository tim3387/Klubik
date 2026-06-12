/**
 * KLUBIK — Script de prospection email
 * ─────────────────────────────────────────────────────────────────
 * À coller dans Google Sheets → Extensions → Apps Script
 *
 * Ce script lit ton fichier klubik_scored.csv importé dans Sheets,
 * envoie un email personnalisé à chaque club cible,
 * et marque la colonne "Contacté" au fur et à mesure.
 *
 * SETUP :
 *   1. Importe klubik_scored.csv dans Google Sheets
 *   2. Ouvre Extensions → Apps Script
 *   3. Colle ce fichier entier
 *   4. Modifie la section CONFIG ci-dessous
 *   5. Lance testEnvoiUnEmail() d'abord pour vérifier
 *   6. Lance lancerProspection() pour envoyer en batch
 */

// ─── CONFIG — À PERSONNALISER ────────────────────────────────────
const CONFIG = {
  PRENOM: 'Thomas',
  MAX_EMAILS_PAR_RUN: 50,            // 50 par session, max 500/jour avec Gmail
  PRIORITES_CIBLES: ['Cible A+', 'Cible A'],  // Commencer par les meilleurs
  NOM_FEUILLE: 'Sheet1',             // Nom de l'onglet dans Google Sheets
};
// ─────────────────────────────────────────────────────────────────

// Indices de colonnes (1 = colonne A, 2 = colonne B, etc.)
const COL = {
  NOM:      1,   // A — Nom du club
  EMAIL:    2,   // B — Email FFHB
  VILLE:    7,   // G — Ville
  CONTACTE: 13,  // M — Contacté (Oui/Non)
  RELANCE:  14,  // N — Date de contact
  SCORE:    20,  // T — Score (0-10)
  PRIORITE: 21,  // U — Priorité (Cible A+, Cible A, etc.)
};

// ─── TEMPLATE EMAIL ──────────────────────────────────────────────

function construireEmail(nomClub, ville) {
  const sujet = `Une observation sur ${nomClub}`;

  const corps =
`Bonjour,

J'ai arrêté de jouer cette année après plusieurs saisons en nationale. En regardant les réseaux des clubs amateurs, j'ai remarqué un truc qui me dérange : avec l'IA et les mêmes templates partout, les clubs finissent tous par se ressembler.

J'ai créé Klubik pour faire l'inverse — donner à chaque club une identité qui lui ressemble vraiment, pas une copie de ses voisins.

Je prépare quelques exemples en ce moment. Est-ce que ça vous intéresserait de voir ce que ça donnerait pour ${nomClub} ?

${CONFIG.PRENOM}`;

  return { sujet, corps };
}

// ─── FONCTIONS PRINCIPALES ───────────────────────────────────────

/**
 * TEST — Envoie un seul email sur le premier club cible trouvé.
 * Lance cette fonction en premier pour vérifier que tout fonctionne.
 */
function testEnvoiUnEmail() {
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.NOM_FEUILLE);
  const donnees = feuille.getDataRange().getValues();

  for (let i = 1; i < donnees.length; i++) {
    const ligne = donnees[i];
    const priorite  = String(ligne[COL.PRIORITE - 1] || '').trim();
    const contacte  = String(ligne[COL.CONTACTE - 1] || '').trim();
    const email     = String(ligne[COL.EMAIL - 1]    || '').trim();
    const nomClub   = String(ligne[COL.NOM - 1]      || '').trim();
    const ville     = String(ligne[COL.VILLE - 1]    || '').trim();

    if (!CONFIG.PRIORITES_CIBLES.includes(priorite)) continue;
    if (contacte === 'Oui') continue;
    if (!email) continue;

    const { sujet, corps } = construireEmail(nomClub, ville);

    Logger.log('─── TEST EMAIL ───────────────────────────────');
    Logger.log(`À      : ${email}`);
    Logger.log(`Club   : ${nomClub} (${ville})`);
    Logger.log(`Priorité: ${priorite} | Score: ${ligne[COL.SCORE - 1]}`);
    Logger.log(`Objet  : ${sujet}`);
    Logger.log(`Corps  :\n${corps}`);
    Logger.log('─────────────────────────────────────────────');
    Logger.log('✅ TEST OK — Vérifie le log ci-dessus puis lance lancerProspection()');

    // Décommente la ligne suivante pour envoyer vraiment le mail de test :
    // GmailApp.sendEmail(email, sujet, corps, { name: CONFIG.PRENOM + ' — Klubik' });

    return; // S'arrête après le premier club trouvé
  }

  Logger.log('Aucun club cible trouvé. Vérifie la colonne Priorité et le nom de la feuille.');
}

/**
 * ENVOI EN BATCH — Lance la prospection sur MAX_EMAILS_PAR_RUN clubs.
 * Marque chaque club contacté dans la colonne M + date dans la colonne N.
 */
function lancerProspection() {
  const feuille    = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.NOM_FEUILLE);
  const donnees    = feuille.getDataRange().getValues();
  const aujourdhui = new Date().toLocaleDateString('fr-FR');

  let envoyes  = 0;
  let ignores  = 0;
  let erreurs  = 0;

  for (let i = 1; i < donnees.length; i++) {
    if (envoyes >= CONFIG.MAX_EMAILS_PAR_RUN) break;

    const ligne    = donnees[i];
    const priorite = String(ligne[COL.PRIORITE - 1] || '').trim();
    const contacte = String(ligne[COL.CONTACTE - 1] || '').trim();
    const email    = String(ligne[COL.EMAIL - 1]    || '').trim();
    const nomClub  = String(ligne[COL.NOM - 1]      || '').trim();
    const ville    = String(ligne[COL.VILLE - 1]    || '').trim();

    // Filtres
    if (!CONFIG.PRIORITES_CIBLES.includes(priorite)) { ignores++; continue; }
    if (contacte === 'Oui')                           { ignores++; continue; }
    if (!email)                                       { ignores++; continue; }

    try {
      const { sujet, corps } = construireEmail(nomClub, ville);

      GmailApp.sendEmail(email, sujet, corps, {
        name: CONFIG.PRENOM + ' — Klubik',
      });

      // Marquer comme contacté dans le sheet
      feuille.getRange(i + 1, COL.CONTACTE).setValue('Oui');
      feuille.getRange(i + 1, COL.RELANCE).setValue(aujourdhui);

      envoyes++;
      Logger.log(`✅ [${envoyes}] ${nomClub} (${ville}) → ${email}`);

      // Pause de 2 secondes entre chaque email (évite les blocages Gmail)
      Utilities.sleep(2000);

    } catch (e) {
      erreurs++;
      Logger.log(`❌ Erreur pour ${nomClub} : ${e.message}`);
    }
  }

  // Rapport final
  Logger.log('══════════════════════════════════════');
  Logger.log(`📨 Envoyés  : ${envoyes}`);
  Logger.log(`○  Ignorés  : ${ignores}`);
  Logger.log(`❌ Erreurs  : ${erreurs}`);
  Logger.log(`📅 Date     : ${aujourdhui}`);
  Logger.log('══════════════════════════════════════');

  // Notification dans Sheets
  SpreadsheetApp.getActiveSpreadsheet().toast(
    `${envoyes} emails envoyés — ${erreurs} erreurs`,
    'Prospection Klubik',
    10
  );
}

/**
 * STATS — Affiche un résumé de l'état de la prospection.
 * Lance cette fonction pour voir où tu en es.
 */
function voirStats() {
  const feuille  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.NOM_FEUILLE);
  const donnees  = feuille.getDataRange().getValues();

  const stats = {
    'Cible A+':  { total: 0, contactes: 0 },
    'Cible A':   { total: 0, contactes: 0 },
    'Cible B':   { total: 0, contactes: 0 },
    'Exclure':   { total: 0, contactes: 0 },
  };

  for (let i = 1; i < donnees.length; i++) {
    const ligne    = donnees[i];
    const priorite = String(ligne[COL.PRIORITE - 1] || '').trim();
    const contacte = String(ligne[COL.CONTACTE - 1] || '').trim();

    if (stats[priorite] !== undefined) {
      stats[priorite].total++;
      if (contacte === 'Oui') stats[priorite].contactes++;
    }
  }

  Logger.log('══════════════════════════════════════');
  Logger.log('📊 STATS PROSPECTION KLUBIK');
  Logger.log('══════════════════════════════════════');
  for (const [prio, s] of Object.entries(stats)) {
    if (prio === 'Exclure') continue;
    const reste = s.total - s.contactes;
    Logger.log(`${prio} → ${s.contactes}/${s.total} contactés (${reste} restants)`);
  }
  Logger.log('══════════════════════════════════════');
}
