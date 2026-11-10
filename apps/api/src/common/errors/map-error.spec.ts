import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  GENERIC_MESSAGES,
  isFutureTokenError,
  isTokenError,
  mapBackendError,
} from './map-error.js';
import { readWithRetry } from './retry.js';

const RAW =
  'duplicate key value violates unique constraint "transactions_pkey" (Key (id)=(secret-row-id))';

function body(error: HttpException) {
  return error.getResponse() as {
    statusCode: number;
    message: string;
    error: string;
  };
}

describe('mapBackendError', () => {
  describe('the mapping table', () => {
    it.each([
      [
        '23505 (unique violation)',
        '23505',
        ConflictException,
        409,
        GENERIC_MESSAGES.conflict,
      ],
      [
        '23503 (foreign key violation)',
        '23503',
        ConflictException,
        409,
        GENERIC_MESSAGES.conflict,
      ],
      [
        '23514 (check violation)',
        '23514',
        BadRequestException,
        400,
        GENERIC_MESSAGES.badRequest,
      ],
      [
        '22P02 (invalid text representation)',
        '22P02',
        BadRequestException,
        400,
        GENERIC_MESSAGES.badRequest,
      ],
      [
        '22023 (invalid parameter value)',
        '22023',
        BadRequestException,
        400,
        GENERIC_MESSAGES.badRequest,
      ],
      [
        '42501 (insufficient privilege)',
        '42501',
        ForbiddenException,
        403,
        GENERIC_MESSAGES.forbidden,
      ],
      [
        'TX001 (category does not apply to the type)',
        'TX001',
        BadRequestException,
        400,
        GENERIC_MESSAGES.badRequest,
      ],
      [
        'TX002 (classification columns)',
        'TX002',
        ForbiddenException,
        403,
        GENERIC_MESSAGES.forbidden,
      ],
      [
        'an unknown code',
        '99999',
        InternalServerErrorException,
        500,
        GENERIC_MESSAGES.internal,
      ],
    ])('AC-4: %s', (_label, code, type, status, message) => {
      const mapped = mapBackendError({ code, message: RAW });
      expect(mapped).toBeInstanceOf(type);
      expect(mapped.getStatus()).toBe(status);
      expect(body(mapped).message).toBe(message);
    });

    it('AC-4: an error without a code (a network failure) is a 500', () => {
      const mapped = mapBackendError(new TypeError('fetch failed'));
      expect(mapped).toBeInstanceOf(InternalServerErrorException);
      expect(body(mapped).message).toBe(GENERIC_MESSAGES.internal);
    });

    it('AC-4: nothing, or a string, or an empty object is a 500 too', () => {
      for (const value of [undefined, null, 'boom', {}]) {
        expect(mapBackendError(value).getStatus()).toBe(500);
      }
    });
  });

  describe('token errors', () => {
    it.each([
      [
        'PGRST301',
        { code: 'PGRST301', message: 'JWSError JWSInvalidSignature' },
      ],
      [
        'PGRST302',
        { code: 'PGRST302', message: 'Anonymous access is disabled' },
      ],
      [
        'PGRST303 issued in the future',
        { code: 'PGRST303', message: 'JWT issued at future' },
      ],
      [
        'a message that names the JWT, with no code',
        { message: 'JWT expired' },
      ],
    ])('AC-3: %s is a 401', (_label, error) => {
      const mapped = mapBackendError(error);
      expect(mapped).toBeInstanceOf(UnauthorizedException);
      expect(body(mapped).message).toBe(GENERIC_MESSAGES.unauthorized);
    });

    it('AC-3: a server that lacks its own signing secret is a 500, not a 401', () => {
      const error = { code: 'PGRST300', message: 'Server lacks JWT secret' };
      expect(isTokenError(error)).toBe(false);
      expect(mapBackendError(error).getStatus()).toBe(500);
    });

    it('AC-3: only a token issued in the future is eligible for the retry', () => {
      expect(
        isFutureTokenError({
          code: 'PGRST303',
          message: 'JWT issued at future',
        }),
      ).toBe(true);
      expect(
        isFutureTokenError({ code: 'PGRST303', message: 'JWT expired' }),
      ).toBe(false);
      expect(
        isFutureTokenError({ code: '23505', message: 'issued at future' }),
      ).toBe(false);
    });
  });

  describe('no raw message', () => {
    const errors = [
      { code: '23505', message: RAW },
      {
        code: '23514',
        message:
          'new row for relation "transactions" violates check constraint "x"',
      },
      { code: '42501', message: 'permission denied for table transactions' },
      { code: 'PGRST303', message: 'JWT issued at future' },
      { code: 'XX000', message: 'internal error at /var/lib/postgresql' },
      { message: 'connect ECONNREFUSED 10.0.0.5:5432' },
    ];

    it.each(errors.map((e) => [e.code ?? 'no code', e] as const))(
      'AC-2: the response of %s carries none of the backend message',
      (_label, error) => {
        const response = JSON.stringify(mapBackendError(error).getResponse());
        expect(response).not.toContain(error.message);
        for (const fragment of [
          'violates',
          'constraint',
          'permission denied',
          'ECONNREFUSED',
          'postgresql',
          'secret-row-id',
        ]) {
          expect(response).not.toContain(fragment);
        }
      },
    );

    it('AC-2: the generic 500 does not say whether the database or the network failed', () => {
      const fromDatabase = body(
        mapBackendError({ code: 'XX000', message: 'db' }),
      );
      const fromNetwork = body(mapBackendError(new TypeError('fetch failed')));
      expect(fromDatabase).toEqual(fromNetwork);
    });

    it('the body keeps the shape of the framework', () => {
      expect(body(mapBackendError({ code: '23505' }))).toEqual({
        statusCode: 409,
        message: GENERIC_MESSAGES.conflict,
        error: 'Conflict',
      });
    });
  });

  it('an exception that is already an HTTP one passes through unchanged', () => {
    const notFound = new NotFoundException('Transaction x not found.');
    expect(mapBackendError(notFound)).toBe(notFound);
  });
});

describe('readWithRetry', () => {
  const future = { code: 'PGRST303', message: 'JWT issued at future' };

  function sequence(answers: Array<{ data: unknown; error: unknown }>) {
    let calls = 0;
    return {
      run: async () => answers[Math.min(calls++, answers.length - 1)],
      count: () => calls,
    };
  }

  it('AC-3: a token issued in the future is retried once, and the second answer is returned', async () => {
    const reads = sequence([
      { data: null, error: future },
      { data: [1], error: null },
    ]);
    await expect(readWithRetry(reads.run, 1)).resolves.toEqual({
      data: [1],
      error: null,
    });
    expect(reads.count()).toBe(2);
  });

  it('AC-3: it retries at most once: a second failure is returned as it is', async () => {
    const reads = sequence([
      { data: null, error: future },
      { data: null, error: future },
    ]);
    await expect(readWithRetry(reads.run, 1)).resolves.toEqual({
      data: null,
      error: future,
    });
    expect(reads.count()).toBe(2);
  });

  it('does not retry another error, nor a success', async () => {
    const other = sequence([
      { data: null, error: { code: '42501', message: 'x' } },
    ]);
    await readWithRetry(other.run, 1);
    expect(other.count()).toBe(1);
    const ok = sequence([{ data: [], error: null }]);
    await readWithRetry(ok.run, 1);
    expect(ok.count()).toBe(1);
  });
});
