export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresInSeconds: number;
  /** Raw value, returned once. Only its hash is ever persisted. */
  refreshToken: string;
}
