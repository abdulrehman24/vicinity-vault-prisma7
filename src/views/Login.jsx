"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SafeIcon from "@/src/common/SafeIcon";
import { useAppStore } from "@/src/store/useAppStore";
import NetflixBackground from "@/src/components/NetflixBackground";

export default function Login() {
  const [password, setPassword] = useState("");
  const login = useAppStore((state) => state.login);
  const router = useRouter();

  const handleLogin = (e) => {
    e.preventDefault();
    if (password === "sales2024") {
      login();
      router.push("/search");
    } else {
      alert("Hint: password is sales2024");
    }
  };

  return (
    <div className="min-h-screen relative flex flex-col justify-center py-12 px-6 overflow-hidden">
      <NetflixBackground />

      <div className="relative z-10 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex flex-col items-center mb-12">
          <div className="bg-vicinity-peach p-5 rounded-[2.5rem] shadow-2xl shadow-black/60 mb-6 transform hover:scale-110 transition-transform duration-500">
            <SafeIcon name="Video" className="text-vicinity-slate text-6xl" />
          </div>
          <h2 className="text-6xl font-bold text-vicinity-peach tracking-tighter drop-shadow-2xl">
            Vicinity<span className="text-white">Vault</span>
          </h2>
          <div className="h-1 w-20 bg-vicinity-peach mt-4 rounded-full shadow-lg" />
        </div>

        <h2 className="text-center text-[10px] font-black text-vicinity-peach/80 uppercase tracking-[0.4em] mb-12 animate-pulse">
          Internal Sales Relevant Past Projects Portal
        </h2>
      </div>

      <div className="relative z-10 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-[#3d4a55]/80 backdrop-blur-2xl py-12 px-10 shadow-[0_50px_100px_rgba(0,0,0,0.5)] rounded-[3rem] border border-white/10">
          <form className="space-y-8" onSubmit={handleLogin}>
            <div>
              <label htmlFor="password" className="block text-[10px] font-black text-vicinity-peach uppercase tracking-[0.2em] mb-4 ml-1">
                Security Access Key
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none">
                  <SafeIcon name="Lock" className="text-vicinity-peach/40 text-2xl" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none block w-full pl-16 pr-6 py-6 bg-[#4a5a67]/60 border border-vicinity-peach/20 rounded-[1.5rem] text-vicinity-peach placeholder-vicinity-peach/20 focus:outline-none focus:ring-2 focus:ring-vicinity-peach focus:border-transparent transition-all shadow-inner font-bold text-lg"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button type="submit" className="group w-full flex items-center justify-center gap-3 py-6 px-4 rounded-[1.5rem] shadow-2xl text-sm font-black text-vicinity-slate bg-vicinity-peach hover:bg-white hover:scale-[1.02] active:scale-95 transition-all uppercase tracking-widest">
              Enter the Vault
              <SafeIcon name="ArrowRight" className="group-hover:translate-x-1 transition-transform" />
            </button>
          </form>

          <div className="mt-10 pt-8 border-t border-white/5">
            <p className="text-center text-[9px] font-black text-vicinity-peach/50 uppercase tracking-[0.25em] leading-relaxed">
              Authorized Vicinity Staff Personnel Only
              <br />
              <span className="text-white opacity-40">[ Placeholder: Google SSO Integration Pending ]</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
