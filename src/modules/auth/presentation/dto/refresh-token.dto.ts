import { IsString, MinLength } from 'class-validator';

/** Shared by /auth/refresh and /auth/logout — both act on a raw refresh token value. */
export class RefreshTokenDto {
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}
