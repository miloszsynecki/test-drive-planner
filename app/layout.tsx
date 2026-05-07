import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Test Drive Route Planner",
  description: "Plan circular test drive routes from dealership addresses.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
