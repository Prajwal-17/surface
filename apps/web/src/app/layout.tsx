import type { Metadata } from "next";
import localFont from "next/font/local";
import { Providers } from "./providers";
import "./globals.css";

const manrope = localFont({
  src: "./fonts/ManropeVF.ttf",
  variable: "--font-manrope",
  display: "swap",
  weight: "200 800",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Surface — Your career workspace",
  icons: { icon: "/icon.svg" },
  description:
    "Find, understand, and keep track of opportunities that fit you.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${manrope.variable} ${geistMono.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
