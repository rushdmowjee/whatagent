export class WhatAgentError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'WhatAgentError';
    this.status = status;
    this.code = code;
  }

  static fromResponse(status: number, body: unknown): WhatAgentError {
    if (typeof body === 'object' && body !== null && 'error' in body) {
      return new WhatAgentError(
        String((body as { error: unknown }).error),
        status,
        'code' in body ? String((body as { code: unknown }).code) : undefined
      );
    }
    return new WhatAgentError(`HTTP ${status}`, status);
  }
}
