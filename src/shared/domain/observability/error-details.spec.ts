import { DomainError } from '../errors/domain.error';
import { describeFailure } from './error-details';

class StockRuleBroken extends DomainError {
  constructor(readonly materialId: string) {
    super('Not enough stock');
  }
}

describe('describeFailure', () => {
  it('names the exception class, not a generic label', () => {
    expect(describeFailure(new StockRuleBroken('m1')).errorType).toBe('StockRuleBroken');
  });

  it('keeps the message and the stack of an Error', () => {
    const failure = describeFailure(new Error('connect ECONNREFUSED'));

    expect(failure.errorMessage).toBe('connect ECONNREFUSED');
    expect(failure.stackTrace).toContain('error-details.spec.ts');
  });

  it('describes a thrown non-Error without a stack', () => {
    const failure = describeFailure('just a string');

    expect(failure.errorType).toBe('NonError(string)');
    expect(failure.errorMessage).toBe('just a string');
    expect(failure.stackTrace).toBeNull();
  });

  it('never serializes a thrown object as its own message', () => {
    const failure = describeFailure({ rawInvoiceData: { items: ['secret line'] } });

    expect(failure.errorMessage).not.toContain('secret line');
    expect(failure.errorType).toBe('NonError(object)');
  });

  describe('the context', () => {
    it('carries the scalar properties the error itself defines', () => {
      const failure = describeFailure(new StockRuleBroken('material-1'));

      expect(failure.errorContext).toContain('material-1');
    });

    it('carries what the caller adds', () => {
      const failure = describeFailure(new Error('invalid'), {
        validationErrors: ['name should not be empty', 'packageCost must be decimal'],
      });

      expect(failure.errorContext).toContain('name should not be empty');
      expect(failure.errorContext).toContain('packageCost must be decimal');
    });

    /**
     * The one rule that keeps an invoice payload, a request body or an entity
     * out of the record: a property whose value is an object is dropped, not
     * serialized.
     */
    it('drops object-valued properties instead of serializing them', () => {
      const error = Object.assign(new Error('import failed'), {
        rawInvoiceData: { items: [{ description: 'Vinho' }] },
        accessKey: '4'.repeat(44),
      });

      const failure = describeFailure(error);

      expect(failure.errorContext).not.toContain('Vinho');
      expect(failure.errorContext).toContain('4'.repeat(44));
    });

    it('names the cause without reaching into it', () => {
      const failure = describeFailure(
        new Error('save failed', { cause: new Error('deadlock detected') }),
      );

      expect(failure.errorContext).toContain('deadlock detected');
    });

    it('is null when there is nothing to say', () => {
      expect(describeFailure(new Error('plain')).errorContext).toBeNull();
    });

    it('omits a sensitive property by name, value and all', () => {
      const error = Object.assign(new Error('login failed'), {
        email: 'a@b.com',
        passwordHash: '$argon2id$v=19',
      });

      const failure = describeFailure(error);

      expect(failure.errorContext).toContain('a@b.com');
      expect(failure.errorContext).not.toContain('argon2id');
      expect(failure.errorContext).not.toContain('passwordHash');
    });
  });

  describe('sanitization', () => {
    it('redacts a credential in the message', () => {
      const failure = describeFailure(new Error('rejected password=hunter2'));

      expect(failure.errorMessage).toBe('rejected password=[REDACTED]');
    });

    it('redacts a CPF in the context', () => {
      const failure = describeFailure(new Error('bad note'), { consumer: '529.982.247-25' });

      expect(failure.errorContext).not.toContain('529.982.247-25');
    });

    it('redacts a credential inside the stack trace', () => {
      const error = new Error('boom');
      error.stack = 'Error: boom\n    at login (token=abc123def)';

      expect(describeFailure(error).stackTrace).not.toContain('abc123def');
    });
  });

  describe('size', () => {
    it('truncates a long message', () => {
      const failure = describeFailure(new Error('x'.repeat(2_000)));

      expect(failure.errorMessage.length).toBeLessThan(600);
      expect(failure.errorMessage).toContain('[truncated]');
    });

    it('truncates a long stack trace', () => {
      const error = new Error('boom');
      error.stack = `Error: boom\n${'    at somewhere\n'.repeat(2_000)}`;

      expect(describeFailure(error).stackTrace?.length).toBeLessThan(8_100);
    });

    it('truncates a long context value', () => {
      const error = Object.assign(new Error('boom'), { detail: 'y'.repeat(1_000) });

      expect(describeFailure(error).errorContext).toContain('[truncated]');
    });
  });
});
