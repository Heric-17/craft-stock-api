export interface LoginInput {
  email: string;
  password: string;
}

export interface ChangePasswordInput {
  userId: string;
  currentPassword: string;
  newPassword: string;
  /**
   * The refresh token of the session making the request, as the browser sent
   * it. That session stays signed in; every other one is closed. `null` when
   * the request carried none, in which case all of them are closed.
   */
  currentRefreshToken: string | null;
}

export interface ResetPasswordInput {
  token: string;
  newPassword: string;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}
export interface SessionResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresInSeconds: number;
  user: SessionUser;
  refreshToken: string;
}
export type SessionResponse = Omit<SessionResult, 'refreshToken'>;
