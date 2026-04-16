import Admin from "@/src/views/AdminPage";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  if (session.user.role !== "admin") {
    redirect("/search?error=admin_required");
  }
  return <Admin />;
}

