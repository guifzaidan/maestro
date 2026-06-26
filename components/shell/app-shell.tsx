import type { ReactNode } from "react";
import { Header } from "./header";
import { GlobalBackground } from "@/components/hub/backgrounds/global-background";
import { MobileSwipeNav } from "./mobile-swipe-nav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-bg min-h-screen overflow-x-clip">
      <GlobalBackground />
      <MobileSwipeNav />
      <Header />
      <main className="relative z-10 mx-auto max-w-7xl px-4 pt-6 pb-8">
        {children}
      </main>
    </div>
  );
}
