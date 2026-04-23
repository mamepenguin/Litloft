import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";

import { AppShell } from "@/components/AppShell";
import { SidebarProvider } from "@/components/SidebarProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { CurrentDriveProvider } from "@/components/CurrentDriveProvider";
import { WebSocketProvider } from "@/components/WebSocketProvider";
import { ClipboardProvider } from "@/components/ClipboardProvider";
import { ProfileProvider } from "@/components/ProfileProvider";
import { ProfileSetup } from "@/components/ProfileSetup";
import { AddonSlotsProvider } from "@/components/AddonSlotsProvider";

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
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#1a0e10" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

const themeInitScript = `
(function(){
  var t = localStorage.getItem('theme-preference') || 'system';
  document.documentElement.setAttribute('data-theme', t);
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
                        <AppShell>{children}</AppShell>
                        <ProfileSetup />
                      </SidebarProvider>
                    </ClipboardProvider>
                  </AddonSlotsProvider>
                </CurrentDriveProvider>
              </WebSocketProvider>
            </ProfileProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
