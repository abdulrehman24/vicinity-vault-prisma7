"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";

export default function AuthProvider({ children, session = null }) {
  return (
    <SessionProvider
      session={session}
      refetchOnWindowFocus={false}
      refetchWhenOffline={false}
      refetchInterval={0}
    >
      {children}
      <Toaster
        position="top-right"
        richColors={false}
        toastOptions={{
          style: {
            background: "#3d4a55",
            color: "#f5e2dc",
            border: "1px solid rgba(255,255,255,0.08)"
          }
        }}
      />
    </SessionProvider>
  );
}
