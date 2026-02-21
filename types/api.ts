export type ApiErrorPayload = {
  message: string;
  code: string;
  details?: unknown;
};

export type ApiSuccess<T> = {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
};

export type ApiFailure = {
  success: false;
  error: ApiErrorPayload;
  meta?: Record<string, unknown>;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
