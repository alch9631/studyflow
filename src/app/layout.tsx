import type { Metadata, Viewport } from "next";
// Self-hosted Geist via the `geist` package (wraps next/font/local), so there's
// no build-time Google Fonts network fetch. Same --font-geist-sans/-mono vars.
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import Nav from "@/components/Nav";
import BottomTabBar from "@/components/BottomTabBar";
import QuickAddFab from "@/components/QuickAddFab";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import OfflineIndicator from "@/components/OfflineIndicator";
import OfflineQueueSync from "@/components/OfflineQueueSync";
import InstallPrompt from "@/components/InstallPrompt";
import PullToRefresh from "@/components/PullToRefresh";
import MainContent from "@/app/MainContent";
import { ToastProvider } from "@/components/Toast";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { getLocale } from "@/components/i18n/server";
import { createTranslator } from "@/components/i18n/messages";

export const metadata: Metadata = {
  title: { default: "StudyFlow", template: "%s · StudyFlow" },
  description: "The study plan that builds itself, and heals itself when you fall behind.",
  applicationName: "StudyFlow",
  appleWebApp: { capable: true, title: "StudyFlow", statusBarStyle: "default" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
  openGraph: {
    title: "StudyFlow",
    description: "The study plan that builds itself, and heals itself when you fall behind.",
    siteName: "StudyFlow",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "StudyFlow",
    description: "The study plan that builds itself, and heals itself when you fall behind.",
  },
};

export const viewport: Viewport = {
  // Colours the mobile browser / PWA chrome. Theme-aware: the TUHH brand cyan
  // (#00B9CC — the brand fill) on light, a deeper cyan on dark.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#00B9CC" },
    { media: "(prefers-color-scheme: dark)", color: "#00808f" },
  ],
  // Draw under the iPhone notch / home indicator so our own env(safe-area-*)
  // padding (see below + the nav/tab-bar/toast) controls the clearance.
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const t = createTranslator(locale);
  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <head>
        {/* No-flash: apply saved (or system) theme before paint. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}",
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        {/* First tab stop: lets keyboard/screen-reader users jump past the nav
            straight to the page content. Visually hidden until focused. */}
        <a
          href="#main-content"
          className="sr-only rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground shadow-lg focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50"
        >
          {t("common.skipToContent")}
        </a>
        <I18nProvider initialLocale={locale}>
        <ToastProvider>
          {/* Replays toggles queued while offline once the browser reconnects,
              and toasts if a replay fails. Headless. */}
          <OfflineQueueSync />
          <Nav />
          {/* Sits below the sticky header; appears only when the browser is
              offline to flag that pages are rendering last-synced content. */}
          <OfflineIndicator />
          {/* Bottom padding clears the mobile tab bar (its 3.5rem height + the
              safe-area inset); desktop has no bottom bar, so reset to 0. The
              left/right insets keep content off a landscape notch (0 in
              portrait, where viewport-fit=cover only adds top/bottom insets).
              MainContent is path-aware: it drops the tab-bar padding on /focus,
              the sealed room that carries no bottom bar. */}
          {/* Pull-to-refresh wraps every route once here (touch-only, fully
              additive on desktop). Pages must NOT wrap it again — that would
              double the global touch listeners. */}
          <PullToRefresh>
            <MainContent>{children}</MainContent>
          </PullToRefresh>
          <QuickAddFab />
          <BottomTabBar />
          {/* "Install StudyFlow" home-screen nudge: a branded card on
              Android/Chrome (driven by beforeinstallprompt) and a one-time
              Add-to-Home-Screen hint on iOS Safari. Dismissal is remembered in
              localStorage so it never nags. Renders nothing until eligible. */}
          <InstallPrompt />
        </ToastProvider>
        </I18nProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
