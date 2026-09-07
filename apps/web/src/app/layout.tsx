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
  description: "Find, understand, and keep track of jobs that fit you.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{const theme=localStorage.getItem('surface-theme');document.documentElement.classList.toggle('dark',theme?theme!=='light':matchMedia('(prefers-color-scheme: dark)').matches)}catch{}`,
          }}
        />
      </head>
      <body className={`${manrope.variable} ${geistMono.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
