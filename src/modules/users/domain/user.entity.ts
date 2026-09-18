import { InvalidUserError } from './user.error';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface UserProps {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export class User {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly name: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: UserProps) {
    if (!EMAIL_PATTERN.test(props.email)) {
      throw new InvalidUserError(`"${props.email}" is not a valid email address.`);
    }

    if (props.passwordHash.trim().length === 0) {
      throw new InvalidUserError('User passwordHash must not be empty.');
    }

    if (props.name.trim().length === 0) {
      throw new InvalidUserError('User name must not be empty.');
    }

    this.id = props.id;
    this.email = props.email;
    this.passwordHash = props.passwordHash;
    this.name = props.name;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
