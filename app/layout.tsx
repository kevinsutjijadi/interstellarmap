import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import styles from "./ui.module.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Interstellar Map",
  description: "HYG star field in Cartesian coordinates (light-years)",
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${styles.htmlRoot}`}
    >
      <body className={styles.bodyRoot}>
        {children}
      </body>
    </html>
  );
}
