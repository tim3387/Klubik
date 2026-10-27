import { redirect } from "next/navigation";
import TabBar from "@/components/TabBar";
import { currentSession } from "@/lib/session";

// Contrôle serveur à chaque affichage : appareil révoqué ou sessions réinitialisées → retour à la connexion.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!(await currentSession())) redirect("/login");
  return (
    <>
      {children}
      <TabBar />
    </>
  );
}
