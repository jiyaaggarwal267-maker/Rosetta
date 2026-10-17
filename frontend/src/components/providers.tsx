"use client";

import { Tooltip } from "@base-ui/react/tooltip";
import { MotionConfig } from "motion/react";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { SessionProvider } from "@/lib/session";
import { useMediaQuery } from "@/lib/use-media-query";
import { ConsentBanner } from "./consent-banner";

export function Providers({ children }: { children: ReactNode }) {
  const desktop = useMediaQuery("(min-width: 768px)", true);

  return (
    <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
      <MotionConfig reducedMotion="user">
        <SessionProvider>
        <Tooltip.Provider delay={300}>
          {children}
          <ConsentBanner />
          <Toaster
            position={desktop ? "bottom-right" : "top-center"}
            toastOptions={{
              unstyled: true,
              classNames: {
                toast:
                  "toast glass glass-thin flex w-full items-center gap-3 rounded-md px-4 py-3 t-small font-medium text-fg-1",
                description: "text-fg-2 font-normal",
              },
            }}
          />
        </Tooltip.Provider>
        </SessionProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}
