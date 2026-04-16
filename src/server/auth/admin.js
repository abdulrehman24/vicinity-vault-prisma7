import { user_role } from "@prisma/client";
import { resolveCurrentUser } from "@/src/server/auth/user-context";

export const assertAdminRequest = async (_request, prisma) => {
  const user = await resolveCurrentUser(prisma);
  if (user.role !== user_role.admin) {
    const error = new Error("Admin access required.");
    error.statusCode = 403;
    throw error;
  }
  return user;
};
