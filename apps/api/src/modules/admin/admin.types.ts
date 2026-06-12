/** Payload carried by the admin-scoped JWT. */
export interface AdminTokenPayload {
  sub: string;   // user id
  email: string;
  scope: 'admin';
}

/** Shape attached to req.user by AdminJwtStrategy. */
export interface AdminUser {
  userId: string;
  email: string;
}
