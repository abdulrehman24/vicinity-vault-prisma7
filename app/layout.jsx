import "./globals.css";
import AuthProvider from "@/src/components/providers/AuthProvider";
import { auth } from "@/auth";

export const metadata = {
  title: "VicinityVault",
  description: "Internal sales relevant past projects portal"
};

export default async function RootLayout({ children }) {
  const session = await auth();

  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AuthProvider session={session}>{children}</AuthProvider>
      </body>
    </html>
  );
}
