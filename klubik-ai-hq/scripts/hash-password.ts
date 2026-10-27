// Génère OWNER_PASSWORD_HASH à partir d'un mot de passe saisi (jamais stocké en clair).
// Usage : npm run auth:hash   (le mot de passe est demandé, non affiché)
import { createInterface } from "node:readline";
import { hashPassword } from "../src/lib/password.ts";

const rl = createInterface({ input: process.stdin, output: process.stdout });
// @ts-expect-error masquage de la saisie
rl._writeToOutput = () => {};
process.stdout.write("Mot de passe (12 caractères minimum) : ");
rl.question("", (pw) => {
  rl.close();
  process.stdout.write("\n");
  console.log(`OWNER_PASSWORD_HASH=${hashPassword(pw.trim())}`);
});
