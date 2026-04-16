import { auth } from "@/auth";

const authError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

export const resolveCurrentUser = async (prisma) => {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    throw authError("Authentication required.", 401);
  }

  const user = await prisma.users.findUnique({
    where: { id: userId }
  });

  if (!user) {
    throw authError("User is not authorized for this system.", 403);
  }

  if (!user.is_active) {
    throw authError("User account is inactive.", 403);
  }

  return user;
};
