import "./globals.css"; // <--- THIS LINE IS MANDATORY

export const metadata = {
  title: "Bloomgard",
  description: "Enterprise Control Center",
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