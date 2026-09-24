/** Read model for a `User`. `passwordHash` never appears here or in any other response. */
export interface UserView {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RegisterUserInput {
  email: string;
  password: string;
  name: string;
}
