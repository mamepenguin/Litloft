import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";

import { AppShell } from "@/components/AppShell";
import { DirtyBlocker } from "@/components/DirtyBlocker";
import { SidebarProvider } from "@/components/SidebarProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/ToastProvider";
import { CurrentDriveProvider } from "@/components/CurrentDriveProvider";
import { WebSocketProvider } from "@/components/WebSocketProvider";
import { ClipboardProvider } from "@/components/ClipboardProvider";
import { ProfileProvider } from "@/components/ProfileProvider";
import { AddonSlotsProvider } from "@/components/AddonSlotsProvider";
import { SetupRedirector } from "@/components/SetupRedirector";

export const metadata: Metadata = {
  title: "Litloft",
  description: "Litloft - File management & media streaming",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Litloft",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  interactiveWidget: "resizes-content",
  // PWA safe-area: extend the viewport under the iOS status bar /
  // home indicator so `env(safe-area-inset-*)` reports real values.
  // Without this, standalone iOS Safari clamps insets to 0 and
  // safe-area-aware components silently no-op.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#1a0e10" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

// Applied before first paint. The media layout rides along for the
// same reason the theme does: it is decided entirely in CSS from an
// attribute here, so reading it in an effect would show the stacked
// layout for a frame and then shift.
const themeInitScript = `
(function(){
  var t = localStorage.getItem('theme-preference') || 'system';
  var resolved = t === 'light' || t === 'dark'
    ? t
    : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', resolved);

  var layout = localStorage.getItem('media-layout-preference');
  document.documentElement.setAttribute(
    'data-media-layout', layout === 'beside' ? 'beside' : 'stacked'
  );
})();
`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh">
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider>
            <ToastProvider>
              <ProfileProvider>
                <WebSocketProvider>
                  {/* CurrentDriveProvider must wrap AddonSlotsProvider:
                      the slots provider re-fetches /api/addons/status
                      on every drive change so per-drive policy filters
                      apply, which means it needs useCurrentDrive() in
                      its own subtree. */}
                  <CurrentDriveProvider>
                    <AddonSlotsProvider>
                      <ClipboardProvider>
                        <SidebarProvider>
                          <SetupRedirector />
                          <AppShell>{children}</AppShell>
                          <DirtyBlocker />
                        </SidebarProvider>
                      </ClipboardProvider>
                    </AddonSlotsProvider>
                  </CurrentDriveProvider>
                </WebSocketProvider>
              </ProfileProvider>
            </ToastProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
