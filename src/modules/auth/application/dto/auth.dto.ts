export interface LoginInput {
  email: string;
  password: string;
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
