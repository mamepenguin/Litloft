import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";

import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { SidebarProvider } from "@/components/SidebarProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { CurrentDriveProvider } from "@/components/CurrentDriveProvider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "HomeVault",
  description: "HomeVault - File management & media streaming",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "HomeVault",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#130c06" },
    { media: "(prefers-color-scheme: light)", color: "#faf5f0" },
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
    <html lang={locale} className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh">
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider>
            <CurrentDriveProvider>
              <SidebarProvider>
                <div className="flex min-h-dvh">
                  <Sidebar />
                  <main className="flex min-w-0 flex-1 flex-col">
                    <Header />
                    {children}
                  </main>
                </div>
              </SidebarProvider>
            </CurrentDriveProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
