import { DomainError } from './domain.error';

export class EntityInUseError extends DomainError {
  constructor(entityName: string, entityId: string, referenceCount: number) {
    super(
      `${entityName} ${entityId} cannot be deleted: it is referenced by ${referenceCount} other record(s). Discontinue it instead.`,
    );
  }
}
