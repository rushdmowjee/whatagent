import { WhatAgentError } from './errors';

const DEFAULT_BASE_URL = 'https://api.whatagent.dev';
const DEFAULT_TIMEOUT = 30_000;

export interface RequestOptions {
  apiKey: string;
  baseUrl: string;
  timeout: number;
}

export async function request<T>(
  opts: RequestOptions,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${opts.baseUrl}${path}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeout);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'whatagent-sdk/1.0.0',
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new WhatAgentError('Request timed out', 408);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  const responseBody = await response.json().catch(() => null);

  if (!response.ok) {
    throw WhatAgentError.fromResponse(response.status, responseBody);
  }

  return responseBody as T;
}

export function buildRequestOptions(config: {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
}): RequestOptions {
  return {
    apiKey: config.apiKey,
    baseUrl: (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, ''),
    timeout: config.timeout ?? DEFAULT_TIMEOUT,
  };
}
