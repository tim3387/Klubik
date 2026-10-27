// Point d'entrée Next.js au démarrage du serveur (le code Node est isolé dans lib/boot.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { boot } = await import("./lib/boot");
    await boot();
  }
}
