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
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:5173",
  ),
  title: "RECON//LAB — Safe Exploit Training",
  description:
    "สนามฝึก Web Exploitation และ Recon แบบแยกวงสำหรับการเรียนรู้อย่างปลอดภัย",
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
    <html lang="th">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
