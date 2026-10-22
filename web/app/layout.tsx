import "./globals.css"; // <--- THIS LINE IS MANDATORY

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
    <html lang="en">
      <body className="antialiased bg-white text-black">
        {children}
      </body>
    </html>
  );
}