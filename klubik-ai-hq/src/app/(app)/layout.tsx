import TabBar from "@/components/TabBar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <TabBar />
    </>
  );
}
