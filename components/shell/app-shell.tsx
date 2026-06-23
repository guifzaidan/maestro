import type { ReactNode } from "react";
import { Header } from "./header";
import { LightBeams } from "./light-beams";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-bg min-h-screen overflow-x-clip">
      <LightBeams />
      <Header />
      <main className="relative z-10 mx-auto max-w-7xl px-4 pt-6 pb-8">
        {children}
      </main>
    </div>
  );
}
