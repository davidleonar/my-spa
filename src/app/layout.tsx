import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Rendimientos App",
  description: "Ahorra BTC de manera soberana",
  icons: "/pig-180-nobg.png",
  openGraph: {
    title: 'Rendimientos App',
    description: 'Ahorra BTC de manera soberana',
    url: 'https://rendimientos.net/',
    siteName: 'Rendimientos App',
    images: [
      {
        url: 'https://rendimientos.net/apple-touch-icon.png', // Absolute for crawlers
        width: 180,
        height: 180,
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Rendimientos App',
    description: 'Ahorra BTC de manera soberana',
    images: ['https://rendimientos.net/apple-touch-icon.png'],
  },

};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body
        className="font-sans antialiased bg-background text-foreground min-h-screen selection:bg-primary selection:text-white"
      >
        {children}
      </body>
    </html>
  );
}