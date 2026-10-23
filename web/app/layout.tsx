import "./globals.css"; // <--- THIS LINE IS MANDATORY
import { Instrument_Serif, Geist, Geist_Mono } from "next/font/google";

// Jaali design-system typography, exposed as CSS variables for the whole app.
const display = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-display" });
const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata = {
  title: "Bloomgard CRM",
  description: "Quotations, inbox and follow-ups in one workspace. The AI reads every client email and drafts the reply from your own catalogue.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="antialiased bg-white text-black">
        {children}
      </body>
    </html>
  );
}