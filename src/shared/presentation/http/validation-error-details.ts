import { BadRequestException, type ValidationError } from '@nestjs/common';

/**
 * One offending field, with the path to it inside the request body.
 *
 * `path` is exactly the DTO's own property name, dot-joined through nested
 * objects and indexed through arrays: `name`, `billOfMaterials.0.quantity`.
 * That is the contract — the client highlights the field it names — so a DTO
 * property rename is a visible change to it, not a silent one.
 */
export interface ValidationFieldError {
  path: string;
  /** Every rule that field broke, in English, for a developer reading the response. */
  constraints: string[];
}

/**
 * Flattens class-validator's tree into one entry per offending field.
 *
 * The default output is an array of whole sentences ("name should not be
 * empty"), which forces a client that wants to mark the field to parse the
 * field name back out of the prose. It works until someone rewords a message,
 * and then it fails silently on a screen nobody is testing. Handing over the
 * path as data instead is the same fix as `code` on a domain error.
 */
export function toValidationFieldErrors(
  errors: readonly ValidationError[],
  parentPath = '',
): ValidationFieldError[] {
  const flattened: ValidationFieldError[] = [];

  for (const error of errors) {
    const path = parentPath === '' ? error.property : `${parentPath}.${error.property}`;
    const constraints = Object.values(error.constraints ?? {});

    if (constraints.length > 0) {
      flattened.push({ path, constraints });
    }

    // Nested DTOs and array items both arrive as children, the latter with
    // the index as their property name — which is why joining blindly gives
    // `billOfMaterials.0.quantity` without a special case.
    if (error.children !== undefined && error.children.length > 0) {
      flattened.push(...toValidationFieldErrors(error.children, path));
    }
  }

  return flattened;
}

/**
 * The `exceptionFactory` for the global `ValidationPipe`. Keeps the 400 and
 * the English summary, and replaces the sentence array with the structured
 * paths above — which `AllExceptionsFilter` then publishes as `details`
 * under the `VALIDATION_FAILED` code.
 */
export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    error: 'ValidationFailed',
    message: 'Validation failed',
    details: toValidationFieldErrors(errors),
  });
}
