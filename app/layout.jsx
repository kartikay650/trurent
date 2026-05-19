import { DM_Sans, Playfair_Display, DM_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-dm-sans",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-playfair",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-dm-mono",
  display: "swap",
});

export const metadata = {
  title: "TruRent",
  description: "Find your Bangalore flat",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${playfair.variable} ${dmMono.variable}`}
      style={{ background: "#F6F4EF", colorScheme: "light" }}
    >
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
