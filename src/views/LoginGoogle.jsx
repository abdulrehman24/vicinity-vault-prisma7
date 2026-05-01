"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import SafeIcon from "@/src/common/SafeIcon";
import NetflixBackground from "@/src/components/NetflixBackground";

export default function LoginGoogle() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasGoogleProvider, setHasGoogleProvider] = useState(true);
  const [hasLocalBypassProvider, setHasLocalBypassProvider] = useState(false);
  const [localBypassPassword, setLocalBypassPassword] = useState("");
  const searchParams = useSearchParams();
  const router = useRouter();
  const { status, data: session } = useSession();
  const nextUrl = searchParams.get("next") || "/search";

  const errorMessage = useMemo(() => {
    const error = (searchParams.get("error") || "").toLowerCase();
    const code = (searchParams.get("code") || "").toLowerCase();
    if (!error) return "";
    if (error === "credentialssignin" || code === "credentials") {
      return "Local bypass failed. Check LOCAL_BYPASS_EMAIL and ensure that user exists in DB with is_active=true.";
    }
    if (error === "domain_not_allowed") return "Only approved company Google accounts can access this system.";
    if (error === "not_authorized") return "Your account is not authorized yet. Please contact an administrator.";
    if (error === "inactive_user") return "Your account is currently inactive. Please contact an administrator.";
    if (error === "provider_not_allowed") return "Google SSO is required to access this app.";
    if (error === "local_bypass_disabled") return "Local bypass is disabled.";
    if (error === "callback") return "Google login failed. Please try again.";
    return "Authentication failed. Please try again or contact an administrator.";
  }, [searchParams]);

  useEffect(() => {
    const loadProviders = async () => {
      try {
        const response = await fetch("/api/auth/providers");
        const payload = await response.json();
        setHasGoogleProvider(Boolean(payload?.google));
        setHasLocalBypassProvider(Boolean(payload?.["local-bypass"]));
      } catch (_error) {
        setHasGoogleProvider(false);
        setHasLocalBypassProvider(false);
      }
    };
    loadProviders();
  }, []);

  useEffect(() => {
    if (status === "authenticated" && session?.user?.id) {
      window.location.href = nextUrl;
    }
  }, [status, session, nextUrl]);

  const handleGoogleSignIn = async () => {
    if (!hasGoogleProvider || isSubmitting) return;
    setIsSubmitting(true);
    await signIn("google", { callbackUrl: nextUrl });
  };

  const handleLocalBypass = async () => {
    if (!hasLocalBypassProvider || isSubmitting) return;
    setIsSubmitting(true);
    const result = await signIn("local-bypass", {
      redirect: false,
      callbackUrl: nextUrl,
      password: localBypassPassword
    });

    if (result?.ok) {
      router.replace(result.url || nextUrl);
      router.refresh();
      return;
    }

    const error = result?.error || "CredentialsSignin";
    window.location.href = `/login?error=${encodeURIComponent(error)}`;
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
          <div className="space-y-8">
            {errorMessage && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm font-bold px-6 py-4 rounded-2xl">
                {errorMessage}
              </div>
            )}

            <div>
              <label className="block text-[10px] font-black text-vicinity-peach uppercase tracking-[0.2em] mb-4 ml-1">
                Google SSO Access
              </label>
              <p className="text-sm text-vicinity-peach/60 font-medium">
                Sign in with your company Google account to continue.
              </p>
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={!hasGoogleProvider || isSubmitting}
              className="group w-full flex items-center justify-center gap-3 py-6 px-4 rounded-[1.5rem] shadow-2xl text-sm font-black text-vicinity-slate bg-vicinity-peach hover:bg-white hover:scale-[1.02] active:scale-95 transition-all uppercase tracking-widest disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Connecting..." : "Continue with Google"}
              <SafeIcon name="ArrowRight" className="group-hover:translate-x-1 transition-transform" />
            </button>

            {!hasGoogleProvider && (
              <p className="text-center text-[10px] font-black text-red-300 uppercase tracking-[0.15em]">
                Google SSO is not configured. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
              </p>
            )}

            {hasLocalBypassProvider && (
              <div className="space-y-3">
                <input
                  type="password"
                  value={localBypassPassword}
                  onChange={(e) => setLocalBypassPassword(e.target.value)}
                  placeholder="Local bypass password"
                  className="w-full py-3 px-4 rounded-xl bg-[#4a5a67] border border-white/10 text-vicinity-peach placeholder-vicinity-peach/40 outline-none focus:border-vicinity-peach/40"
                />
                <button
                  type="button"
                  onClick={handleLocalBypass}
                  disabled={isSubmitting || !localBypassPassword}
                  className="w-full flex items-center justify-center gap-3 py-4 px-4 rounded-[1.25rem] border border-vicinity-peach/30 text-vicinity-peach hover:bg-vicinity-peach/10 transition-all uppercase tracking-widest text-[10px] font-black disabled:opacity-60"
                >
                  Local Dev Bypass
                  <SafeIcon name="LogIn" />
                </button>
              </div>
            )}
          </div>

          <div className="mt-10 pt-8 border-t border-white/5">
            <p className="text-center text-[9px] font-black text-vicinity-peach/50 uppercase tracking-[0.25em] leading-relaxed">
              Authorized Vicinity Staff Personnel Only
              <br />
              <span className="text-white opacity-40">[ Google SSO + Internal Authorization Enforced ]</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
