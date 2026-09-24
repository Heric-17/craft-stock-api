import { Injectable } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';

import { EnvService } from '../../../config/env.service';
import type { PasswordHasher } from '../../domain/security/password-hasher.port';

@Injectable()
export class Argon2PasswordHasher implements PasswordHasher {
  private readonly timeCost: number;

  constructor(env: EnvService) {
    this.timeCost = env.get('ARGON2_TIME_COST');
  }

  hash(plainTextPassword: string): Promise<string> {
    return hash(plainTextPassword, { type: argon2id, timeCost: this.timeCost });
  }

  verify(passwordHash: string, plainTextPassword: string): Promise<boolean> {
    return verify(passwordHash, plainTextPassword);
  }
}
