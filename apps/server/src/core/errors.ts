import { ErrorCode } from '@pph/shared';

export class DomainError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly httpStatus: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const notFound = (what: string, details?: Record<string, unknown>) =>
  new DomainError(ErrorCode.NOT_FOUND, `${what} không tồn tại`, 404, details);

export const validation = (message: string, details?: Record<string, unknown>) =>
  new DomainError(ErrorCode.VALIDATION, message, 400, details);

export const rule = (code: ErrorCode, message: string, details?: Record<string, unknown>) =>
  new DomainError(code, message, 422, details);

export const conflict = (code: ErrorCode, message: string, details?: Record<string, unknown>) =>
  new DomainError(code, message, 409, details);
