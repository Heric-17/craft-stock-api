import type { User } from '../../domain/user.entity';
import type { UserView } from '../dto/users.dto';

export class UserViewMapper {
  static toView(user: User): UserView {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
