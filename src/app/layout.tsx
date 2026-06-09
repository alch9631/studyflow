import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import BottomTabBar from "@/components/BottomTabBar";
import QuickAddFab from "@/components/QuickAddFab";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import { ToastProvider } from "@/components/Toast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "StudyFlow", template: "%s · StudyFlow" },
  description: "The study plan that builds itself — and heals itself when you fall behind.",
  applicationName: "StudyFlow",
  appleWebApp: { capable: true, title: "StudyFlow", statusBarStyle: "default" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
  openGraph: {
    title: "StudyFlow",
    description: "The study plan that builds itself — and heals itself when you fall behind.",
    siteName: "StudyFlow",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "StudyFlow",
    description: "The study plan that builds itself — and heals itself when you fall behind.",
  },
};

export const viewport: Viewport = {
  themeColor: "#00509b", // TUHH blue — colours the mobile browser chrome
  // Draw under the iPhone notch / home indicator so our own env(safe-area-*)
  // padding (see below + the nav/tab-bar/toast) controls the clearance.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
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
          className="sr-only rounded-full bg-brand px-4 py-2 text-sm font-medium text-white shadow-lg focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50"
        >
          Skip to content
        </a>
        <ToastProvider>
          <Nav />
          {/* Bottom padding clears the mobile tab bar (its 3.5rem height + the
              safe-area inset); desktop has no bottom bar, so reset to 0. The
              left/right insets keep content off a landscape notch (0 in
              portrait, where viewport-fit=cover only adds top/bottom insets). */}
          <div
            id="main-content"
            tabIndex={-1}
            className="flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom))] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] lg:pb-0"
          >
            {children}
          </div>
          <QuickAddFab />
          <BottomTabBar />
        </ToastProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
