import Layout from "@/src/components/Layout";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function VaultLayout({ children }) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  return <Layout session={session}>{children}</Layout>;
}
