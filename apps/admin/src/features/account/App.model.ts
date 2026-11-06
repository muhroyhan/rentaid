export type AdminSession = {
  user: { id: string; email: string; role: "admin" | "user" };
  csrfToken?: string;
  expiresAt: string;
};
