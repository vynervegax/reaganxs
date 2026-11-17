import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import RegisterSW from '@/components/RegisterSW';
import InstallButton from '@/components/InstallButton';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ReaganXS - Compress Aggressively, Restore Intelligently",
  description: "Hybrid Edge-Cloud Video Processing. Bandwidth-first. Power-aware. SEA optimized.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <RegisterSW />
        <div className="fixed top-4 right-4 z-50">
          <InstallButton />
        </div>
        {children}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}