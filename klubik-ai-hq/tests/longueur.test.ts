// Longueur des brouillons par canal. Aucune base nécessaire.
import { describe, expect, it } from "vitest";
import { compterMots, depassement, limitePour } from "@/lib/agents/longueur";

// Le brouillon Saint-Flour du premier essai réel (refusé par Timothé, notamment pour sa longueur).
const SAINT_FLOUR = `Bonjour,

Je suis Timothé, de Klubik. J'ai joué à Saint-Flour, le club m'est resté en tête. 14 équipes, une filière féminine de la N2 aux -13 et plus de 60 partenaires : beaucoup de visuels à garder cohérents. Je conçois l'identité visuelle de clubs de handball (JA Isle Handball, sur @klubik.pro), avec des templates Canva modifiables qui font gagner du temps.

Je peux faire un mini-audit gratuit : je reprends 3 de vos visuels récents, je vous dis ce qui fonctionne et ce qui freine, et je refais l'un d'eux. Je vous l'envoie ? Sinon, un simple « non merci » me va très bien.

Timothé`;

const COURT = `Bonjour,
Votre affiche pour le derby de samedi m'a arrêté en scrollant, surtout la photo du gardien. Je suis Timothé, je crée des visuels pour des clubs de hand. Petite curiosité : c'est fait en interne ou par quelqu'un d'extérieur ?
Timothé`;

describe("longueur des brouillons", () => {
  it("compte les mots sans la ponctuation isolée", () => {
    expect(compterMots("Bonjour , c'est Timothé — de Klubik : l'équipe")).toBe(6);
  });

  it("choisit la limite selon le canal", () => {
    expect(limitePour("Instagram")).toMatchObject({ max: 80, unite: "mots" });
    expect(limitePour("Facebook")).toMatchObject({ max: 80, unite: "mots" });
    expect(limitePour("Email")).toMatchObject({ max: 120, unite: "mots" });
    expect(limitePour("Téléphone (SMS)")).toMatchObject({ max: 300, unite: "caractères" });
    expect(limitePour("Autre")).toMatchObject({ max: 100, unite: "mots" });
  });

  it("refuse le DM Saint-Flour trop long et accepte un DM court", () => {
    expect(compterMots(SAINT_FLOUR)).toBeGreaterThan(80);
    expect(depassement("Instagram", SAINT_FLOUR)).toMatch(/trop long.*maximum 80/);
    expect(depassement("Instagram", COURT)).toBeNull();
  });

  it("le même texte passe en email (120 mots) mais pas en SMS (300 caractères)", () => {
    expect(depassement("Email", SAINT_FLOUR)).toBeNull();
    expect(depassement("Téléphone", SAINT_FLOUR)).toMatch(/caractères, maximum 300/);
  });
});
