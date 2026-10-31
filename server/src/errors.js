// Consistent API errors: { detail: string, errors?: [{ field, message }] }
export class ApiError extends Error {
  constructor(status, detail, extra = {}) {
    super(detail);
    this.status = status;
    this.detail = detail;
    this.extra = extra;
  }
}

export function validationError(errors) {
  const detail = errors.map((e) => e.message).join(' ');
  return new ApiError(400, detail || 'Some inputs are invalid.', { errors });
}
