"use strict";

class HeroShotsError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}

class ApiError extends HeroShotsError {
  constructor(message, { code = null, status = null, details = {} } = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details || {};
  }
}

class AuthError extends ApiError {}
class TokenExpiredError extends AuthError {}
class ValidationError extends ApiError {}
class NotFoundError extends ApiError {}
class ForbiddenError extends ApiError {}
class ConflictError extends ApiError {}
class QuotaExceededError extends ApiError {}
class PayloadTooLargeError extends ApiError {}
class ProviderError extends ApiError {}
class ServiceUnavailableError extends ApiError {}
class RateLimitError extends ApiError {}
class InternalError extends ApiError {}

const CODE_MAP = {
  missing_api_key: AuthError,
  missing_authorization: AuthError,
  missing_bearer_token: AuthError,
  invalid_api_key: AuthError,
  invalid_token: AuthError,
  invalid_or_expired_token: AuthError,
  unauthorized: AuthError,
  user_not_found: AuthError,
  token_expired: TokenExpiredError,
  validation_error: ValidationError,
  not_found: NotFoundError,
  resource_gone: NotFoundError,
  forbidden: ForbiddenError,
  plan_not_allowed: ForbiddenError,
  insufficient_scope: ForbiddenError,
  conflict: ConflictError,
  quota_exceeded: QuotaExceededError,
  payload_too_large: PayloadTooLargeError,
  provider_error: ProviderError,
  service_unavailable: ServiceUnavailableError,
  pricing_not_configured: ServiceUnavailableError,
  stripe_not_configured: ServiceUnavailableError,
  internal_error: InternalError
};

function errorFromResponse(status, body) {
  let code = null;
  let message = null;
  let details = null;

  if (body && typeof body === "object" && !Array.isArray(body)) {
    const err = body.error;
    if (err && typeof err === "object" && !Array.isArray(err)) {
      code = err.code || null;
      message = err.message || null;
      details = err.details || null;
    } else if (typeof err === "string") {
      message = err;
    }
    message = message || body.message || null;
  }

  let ErrorClass = ApiError;
  if (status === 429) {
    ErrorClass = RateLimitError;
  } else if (code && CODE_MAP[code]) {
    ErrorClass = CODE_MAP[code];
  } else if (status >= 500) {
    ErrorClass = InternalError;
  } else if (status === 404) {
    ErrorClass = NotFoundError;
  } else if (status === 401 || status === 403) {
    ErrorClass = AuthError;
  }

  return new ErrorClass(message || `HTTP ${status}`, {
    code,
    status,
    details: details && typeof details === "object" && !Array.isArray(details) ? details : {}
  });
}

module.exports = {
  HeroShotsError,
  ApiError,
  AuthError,
  TokenExpiredError,
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  QuotaExceededError,
  PayloadTooLargeError,
  ProviderError,
  ServiceUnavailableError,
  RateLimitError,
  InternalError,
  errorFromResponse
};
