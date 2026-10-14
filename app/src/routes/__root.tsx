import type { CSSProperties, ReactNode } from "react";
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { Analytics } from "@vercel/analytics/react";
import { AuthProvider } from "@/lib/auth/provider";
import { BottomGlassTabBar, shouldShowBottomGlassTabBar } from "@/components/bottom-glass-tab-bar";
import { ActionErrorBell } from "@/components/action-error-bell";
import { HubShellLayout } from "@/components/hub-shell-layout";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { PrivacyGate } from "@/components/privacy-gate";
import { HUB_STRIP_STYLE } from "@/lib/hub-viewport";
import appCss from "../styles.css?url";

const APP_NAME = "aim100x.fun";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover",
      },
      { title: APP_NAME },
      { name: "theme-color", content: "#0a0810" },
      {
        name: "description",
        content: "aim100x.fun — chat with AI virtual idols. Text and voice.",
      },
    ],
    links: [
      { rel: "icon", type: "image/png", sizes: "64x64", href: "/favicon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      {
        rel: "manifest",
        href: "/__grok/manifest.webmanifest",
        crossOrigin: "use-credentials",
      },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
  }),
  component: RootDocument,
});

function HubFrame() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <HubShellLayout active={shouldShowBottomGlassTabBar(pathname)}>
      <Outlet />
    </HubShellLayout>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="lf-stage h-full overflow-hidden text-fg"
      style={HUB_STRIP_STYLE as CSSProperties}
    >
      <div className="lf-frame relative mx-auto h-full min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

function RootDocument() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="antialiased">
        <PreviewHostBridge />
        <AuthProvider>
          <AppShell>
            <PrivacyGate>
              <HubFrame />
              <BottomGlassTabBar />
              <ActionErrorBell />
            </PrivacyGate>
          </AppShell>
        </AuthProvider>
        <Analytics />
        <Scripts />
      </body>
    </html>
  );
}
