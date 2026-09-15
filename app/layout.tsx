import type { Metadata } from "next";
import "./globals.css";
import { getChatGPTUser } from "./company-auth";
import CompanyContext from "./components/company-context";

export const metadata: Metadata = {
  title: "Commons — Everything you need, in one place",
  description: "Everything you need. In one place.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const company = await getChatGPTUser();
  return (
    <html lang="en">
      <head><meta name="commons-company" content={company?.id || ""}/></head>
      <body className="antialiased">{company&&<CompanyContext name={company.companyName}/ >}{children}</body>
    </html>
  );
}
