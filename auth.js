import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/src/server/db/prisma";
import { user_role } from "@prisma/client";

const allowedDomain = (process.env.ALLOWED_GOOGLE_DOMAIN || "").trim().toLowerCase();
const hasGoogleProvider = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const localBypassEnabled = String(process.env.ENABLE_LOCAL_AUTH_BYPASS || "false").toLowerCase() === "true";
const localBypassEmail = String(process.env.LOCAL_BYPASS_EMAIL || "")
  .trim()
  .toLowerCase();
const localBypassConfigured = localBypassEnabled && Boolean(localBypassEmail);
const localBypassRole = Object.values(user_role).includes(process.env.LOCAL_BYPASS_ROLE)
  ? process.env.LOCAL_BYPASS_ROLE
  : user_role.admin;

const sanitizeErrorCode = (code) => encodeURIComponent(code);
const toBypassName = (email) =>
  String(email || "")
    .split("@")[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Local Admin";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt"
  },
  pages: {
    signIn: "/login",
    error: "/login"
  },
  providers: [
    ...(hasGoogleProvider
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            authorization: {
              params: {
                prompt: "select_account",
                hd: allowedDomain || undefined
              }
            }
          })
        ]
      : []),
    ...(localBypassConfigured
      ? [
          Credentials({
            id: "local-bypass",
            name: "Local Bypass",
            credentials: {},
            async authorize() {
              const email = localBypassEmail;
              if (!email) return null;
              const now = new Date();
              const user = await prisma.users.upsert({
                where: { email },
                create: {
                  email,
                  full_name: toBypassName(email),
                  role: localBypassRole,
                  is_active: true,
                  sso_provider: "local-bypass",
                  sso_subject: email,
                  last_login_at: now
                },
                update: {
                  is_active: true,
                  role: localBypassRole,
                  sso_provider: "local-bypass",
                  sso_subject: email,
                  last_login_at: now,
                  updated_at: now
                },
                select: {
                  id: true,
                  email: true,
                  full_name: true,
                  role: true,
                  is_active: true
                }
              });
              return {
                id: user.id,
                email: user.email,
                name: user.full_name,
                role: user.role,
                isActive: user.is_active
              };
            }
          })
        ]
      : [])
  ],
  callbacks: {
    async signIn({ user, profile, account }) {
      if (account?.provider === "local-bypass") {
        if (!localBypassEnabled) {
          return `/login?error=${sanitizeErrorCode("local_bypass_disabled")}`;
        }
        if (user?.id) {
          await prisma.users.update({
            where: { id: user.id },
            data: {
              last_login_at: new Date(),
              updated_at: new Date()
            }
          });
        }
        return true;
      }

      if (account?.provider !== "google") {
        return `/login?error=${sanitizeErrorCode("provider_not_allowed")}`;
      }

      const email = String(profile?.email || user?.email || "")
        .trim()
        .toLowerCase();

      if (!email || !allowedDomain || !email.endsWith(`@${allowedDomain}`)) {
        return `/login?error=${sanitizeErrorCode("domain_not_allowed")}`;
      }

      const existing = await prisma.users.findUnique({
        where: { email },
        select: {
          id: true,
          role: true,
          is_active: true
        }
      });

      if (!existing) {
        return `/login?error=${sanitizeErrorCode("not_authorized")}`;
      }

      if (!existing.is_active) {
        return `/login?error=${sanitizeErrorCode("inactive_user")}`;
      }

      const fullName = String(profile?.name || user?.name || "").trim();
      const avatarInitials =
        fullName
          .split(" ")
          .map((part) => part[0] || "")
          .join("")
          .slice(0, 2)
          .toUpperCase() || null;

      await prisma.users.update({
        where: { id: existing.id },
        data: {
          full_name: fullName || undefined,
          avatar_initials: avatarInitials || undefined,
          sso_provider: "google",
          sso_subject: String(profile?.sub || ""),
          last_login_at: new Date(),
          updated_at: new Date()
        }
      });

      user.id = existing.id;
      user.role = existing.role;
      user.isActive = existing.is_active;

      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) {
        token.uid = user.id;
      }
      if (user?.role) {
        token.role = user.role;
      }
      if (typeof user?.isActive === "boolean") {
        token.isActive = user.isActive;
      }
      if (!token.role) {
        token.role = user_role.user;
      }
      return token;
    },
    async session({ session, token }) {
      if (!session.user) {
        session.user = {};
      }
      session.user.id = token.uid || null;
      session.user.role = token.role || user_role.user;
      session.user.isActive = token.isActive !== false;
      return session;
    }
  }
});

export const authRuntime = {
  hasGoogleProvider,
  allowedDomain,
  localBypassEnabled,
  localBypassConfigured
};
