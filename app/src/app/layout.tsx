import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { WalletContextProvider } from "../components/WalletProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FanStake — The Stock Market for Music Artists",
  description:
    "Invest in the artists you believe in. Buy their token early on Solana. Powered by bonding curves.",
  metadataBase: new URL("https://fanstake.app"),
  openGraph: {
    title: "FanStake — The Stock Market for Music Artists",
    description:
      "Invest in artists you believe in. Buy early, ride the wave. Powered by Solana.",
    url: "https://fanstake.app",
    siteName: "FanStake",
    type: "website",
    images: [{ url: "/logo.png", width: 1536, height: 1024 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "FanStake — The Stock Market for Music Artists",
    description: "Invest in artists you believe in. Powered by Solana.",
  },
  manifest: "/manifest.json",
  applicationName: "FanStake",
  keywords: [
    "invest in music artists",
    "artist token",
    "music investment platform",
    "fan investment",
    "solana music",
    "bonding curve",
    "support artists",
    "music startup",
    "independent artist platform",
    "fanstake",
    "web3 music",
    "artist token launch",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#7c3aed" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <WalletContextProvider>{children}</WalletContextProvider>
        {/* Organization Schema */}
        <Script id="org-schema" type="application/ld+json" strategy="afterInteractive">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            "name": "FanStake",
            "url": "https://fanstake.app",
            "description": "The stock market for music artists. Artists launch their own bonding curve token on Solana in 60 seconds. Fans buy in early — price starts low and rises with every purchase.",
            "applicationCategory": "FinanceApplication",
            "operatingSystem": "Web",
            "offers": {
              "@type": "Offer",
              "price": "0",
              "priceCurrency": "USD",
              "description": "Free to use. 1% fee on trades."
            },
            "publisher": {
              "@type": "Organization",
              "name": "FanStake",
              "url": "https://fanstake.app",
              "sameAs": [
                "https://x.com/FanStakeMusic",
                "https://discord.gg/JPJVNdT3Ga",
                "https://t.me/fanstakemusic"
              ]
            }
          })}
        </Script>

        {/* Google Analytics */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-DS08WY0YNR"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-DS08WY0YNR');
          `}
        </Script>
      </body>
    </html>
  );
}
