"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import SafeIcon from "@/src/common/SafeIcon";
import { getJson } from "@/src/lib/client-api";

export default function Layout({ children, session }) {
  const pathname = usePathname();
  const [counts, setCounts] = useState({
    featuredCount: 0
  });
  const isAdmin = session?.user?.role === "admin";
  const initials =
    session?.user?.name
      ?.split(" ")
      .map((part) => part[0] || "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U";

  useEffect(() => {
    let active = true;
    const loadCounts = async (force = false) => {
      try {
        const payload = await getJson("/api/nav/counts", { ttlMs: 20000, force });
        if (!active) return;
        setCounts({
          featuredCount: Number(payload?.featuredCount || 0)
        });
      } catch (_error) {
        if (!active) return;
        setCounts((prev) => prev);
      }
    };

    loadCounts(false);

    const handleDataChanged = () => {
      loadCounts(true);
    };
    window.addEventListener("vault:data-changed", handleDataChanged);

    return () => {
      active = false;
      window.removeEventListener("vault:data-changed", handleDataChanged);
    };
  }, []);

  const navItems = [
    { path: "/search", label: "Search", icon: "Search" },
    { path: "/featured", label: "Featured", icon: "Star" },
    { path: "/playlists", label: "Team", icon: "Users" },
    { path: "/personal", label: "My Vault", icon: "Lock" }
  ];

  if (isAdmin) {
    navItems.push({ path: "/admin", label: "Admin", icon: "Settings" });
  }

  return (
    <div className="min-h-screen bg-[#4a5a67] flex flex-col">
      <header className="bg-[#3d4a55] border-b border-vicinity-peach/10 sticky top-0 z-50 shadow-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20 items-center">
            <div className="flex items-center gap-3">
              <div className="bg-vicinity-peach p-2 rounded-xl shadow-lg shadow-black/20">
                <SafeIcon name="Video" className="text-vicinity-slate text-2xl" />
              </div>
              <span className="font-bold text-2xl text-vicinity-peach tracking-tighter">
                Vicinity<span className="text-white opacity-90">Vault</span>
              </span>
            </div>

            <nav className="flex gap-2">
              {navItems.map((item) => {
                const isActive = pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
                      isActive
                        ? "bg-vicinity-peach text-vicinity-slate shadow-lg transform scale-105"
                        : "text-vicinity-peach hover:bg-vicinity-peach/10"
                    }`}
                  >
                    <SafeIcon name={item.icon} className="text-lg" />
                    <span className="hidden md:inline">{item.label}</span>
                    {item.path === "/featured" && counts.featuredCount > 0 && (
                      <span
                        className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full ${
                          isActive
                            ? "bg-vicinity-slate text-vicinity-peach"
                            : "bg-vicinity-peach/20 text-vicinity-peach"
                        }`}
                      >
                        {counts.featuredCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>

            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-vicinity-peach/20 text-vicinity-peach border border-vicinity-peach/20 flex items-center justify-center text-[10px] font-black">
                {initials}
              </div>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-vicinity-peach hover:bg-vicinity-peach/10"
              >
                <SafeIcon name="LogOut" />
                <span className="hidden md:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {children}
      </main>
    </div>
  );
}
