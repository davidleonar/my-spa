import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Rendimientos App",
  description: "Ahorra BTC de manera soberana",
  icons: "/favicon.ico",
  openGraph: {
    title: 'Rendimientos App',
    description: 'Ahorra BTC de manera soberana',
    url: 'https://rendimientos.net/',
    siteName: 'Rendimientos App',
    images: [
      {
        url: 'https://rendimientos.net/AppIcon.appiconset/1024.png', // Absolute for crawlers
        width: 1024,
        height: 1024,
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Rendimientos App',
    description: 'Ahorra BTC de manera soberana',
    images: ['https://rendimientos.net/AppIcon.appiconset/1024.png'],
  },

};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}