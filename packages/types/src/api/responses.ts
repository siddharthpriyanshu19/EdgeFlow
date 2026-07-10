/**
 * Standard API response envelope types.
 * All REST endpoints return these shapes for consistency.
 */

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: FieldError[] | Record<string, unknown>;
  };
  requestId?: string;
}

export interface FieldError {
  field: string;
  message: string;
  code: string;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;
