// The one place that turns an error of the database, the REST layer or the
// network into an HTTP exception. The response never carries a message of the
// backend: it carries a stable generic message. The detail goes to the server
// log, which never receives a token or a key (only the code and the message of
// the backend error).

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';

export const GENERIC_MESSAGES = {
  badRequest: 'The request is not valid.',
  unauthorized: 'Invalid or expired token.',
  forbidden: 'This operation is not allowed.',
  conflict: 'The request conflicts with the current state of the data.',
  internal: 'The request could not be completed.',
} as const;

// Codes of the error of the database that the triggers of the data model raise.
const CATEGORY_DOES_NOT_APPLY = 'TX001';
const CLASSIFICATION_COLUMNS = 'TX002';

// Codes of the REST layer for a problem with the token: invalid (PGRST301),
// anonymous access refused (PGRST302) and failed claims (PGRST303).
const TOKEN_CODES = new Set(['PGRST301', 'PGRST302', 'PGRST303']);

const SERVER_LACKS_JWT_SECRET = 'PGRST300';

const logger = new Logger('BackendError');

interface BackendError {
  code?: unknown;
  message?: unknown;
}

function field(error: unknown, key: keyof BackendError): string {
  const value = (error as BackendError | null | undefined)?.[key];
  return typeof value === 'string' ? value : '';
}

/** A problem with the token: expired, invalid, or issued in the future. */
export function isTokenError(error: unknown): boolean {
  const code = field(error, 'code');
  // The server lacks its own signing secret: a fault of the service, not of
  // the token the client sent.
  if (code === SERVER_LACKS_JWT_SECRET) return false;
  return TOKEN_CODES.has(code) || /\bJWT\b/i.test(field(error, 'message'));
}

/** The token carries an issue time slightly ahead of the clock of the REST layer. */
export function isFutureTokenError(error: unknown): boolean {
  return (
    isTokenError(error) && /issued at future/i.test(field(error, 'message'))
  );
}

export function mapBackendError(error: unknown): HttpException {
  // An exception that is already an HTTP one has been mapped: pass it through.
  if (error instanceof HttpException) return error;

  const code = field(error, 'code');
  const message = field(error, 'message');
  logger.warn(`code=${code || 'none'} message=${message || 'none'}`);

  if (isTokenError(error)) {
    return new UnauthorizedException(GENERIC_MESSAGES.unauthorized);
  }

  switch (code) {
    case '23505': // unique violation
    case '23503': // foreign key violation
      return new ConflictException(GENERIC_MESSAGES.conflict);
    case '23514': // check violation
    case '22P02': // invalid text representation
    case CATEGORY_DOES_NOT_APPLY:
      return new BadRequestException(GENERIC_MESSAGES.badRequest);
    case '42501': // insufficient privilege
    case CLASSIFICATION_COLUMNS:
      return new ForbiddenException(GENERIC_MESSAGES.forbidden);
    default:
      // Unknown code, or no code at all (a network failure): never a raw
      // message, and nothing that says where the failure came from.
      return new InternalServerErrorException(GENERIC_MESSAGES.internal);
  }
}
