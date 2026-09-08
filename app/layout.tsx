import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:5173",
  ),
  title: "RECON//LAB — Beginner Security Investigations",
  description:
    "Learn terminal basics, follow fictional evidence, and explain your findings in isolated local security labs.",
  openGraph: {
    title: "RECON//LAB",
    description: "Safe. Local. Repeatable.",
    images: [{ url: "/og.png", width: 1792, height: 896 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "RECON//LAB",
    description: "Safe. Local. Repeatable.",
    images: ["/og.png"],
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
        className={`${dmSans.variable} ${jetBrainsMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
