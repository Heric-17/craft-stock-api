import { BadRequestException, type ValidationError } from '@nestjs/common';

import { toValidationFieldErrors, validationExceptionFactory } from './validation-error-details';

function error(partial: Partial<ValidationError>): ValidationError {
  return { property: 'field', ...partial };
}

describe('toValidationFieldErrors', () => {
  it('reports the DTO property name as the path', () => {
    const result = toValidationFieldErrors([
      error({ property: 'email', constraints: { isEmail: 'email must be an email' } }),
    ]);

    expect(result).toEqual([{ path: 'email', constraints: ['email must be an email'] }]);
  });

  it('lists every rule a single field broke', () => {
    const result = toValidationFieldErrors([
      error({
        property: 'password',
        constraints: { isString: 'password must be a string', minLength: 'password is too short' },
      }),
    ]);

    expect(result[0].constraints).toEqual(['password must be a string', 'password is too short']);
  });

  it('joins a nested DTO path with dots', () => {
    const result = toValidationFieldErrors([
      error({
        property: 'address',
        children: [error({ property: 'city', constraints: { isString: 'city must be a string' } })],
      }),
    ]);

    expect(result).toEqual([{ path: 'address.city', constraints: ['city must be a string'] }]);
  });

  /** An array item arrives with its index as the property name. */
  it('indexes into an array of nested DTOs', () => {
    const result = toValidationFieldErrors([
      error({
        property: 'billOfMaterials',
        children: [
          error({
            property: '0',
            children: [
              error({
                property: 'quantity',
                constraints: { isPositive: 'quantity must be positive' },
              }),
            ],
          }),
        ],
      }),
    ]);

    expect(result).toEqual([
      { path: 'billOfMaterials.0.quantity', constraints: ['quantity must be positive'] },
    ]);
  });

  it('skips a parent that only groups children and carries no rule of its own', () => {
    const result = toValidationFieldErrors([
      error({
        property: 'address',
        children: [error({ property: 'city', constraints: { isString: 'city must be a string' } })],
      }),
    ]);

    expect(result.map((entry) => entry.path)).toEqual(['address.city']);
  });

  it('reports a parent rule alongside its children when it has both', () => {
    const result = toValidationFieldErrors([
      error({
        property: 'items',
        constraints: { arrayNotEmpty: 'items should not be empty' },
        children: [
          error({
            property: '0',
            children: [error({ property: 'id', constraints: { isUuid: 'id must be a UUID' } })],
          }),
        ],
      }),
    ]);

    expect(result.map((entry) => entry.path)).toEqual(['items', 'items.0.id']);
  });

  it('is empty when nothing was violated', () => {
    expect(toValidationFieldErrors([])).toEqual([]);
  });
});

describe('validationExceptionFactory', () => {
  it('raises a 400 carrying the structured paths as details', () => {
    const exception = validationExceptionFactory([
      error({ property: 'email', constraints: { isEmail: 'email must be an email' } }),
    ]);

    expect(exception).toBeInstanceOf(BadRequestException);
    expect(exception.getStatus()).toBe(400);
    expect(exception.getResponse()).toEqual({
      statusCode: 400,
      error: 'ValidationFailed',
      message: 'Validation failed',
      details: [{ path: 'email', constraints: ['email must be an email'] }],
    });
  });
});
