/**
 * A small Result type so data reads surface failures as typed values instead of throwing.
 * Every network-touching tool returns a Result — the agent never has to try/catch a tool call,
 * and a missing/stale/errored read stays visible (fed to Sentinel's fail-closed logic in U8).
 */

export type ErrorCode = 'timeout' | 'http' | 'parse' | 'unavailable' | 'not_found';

export interface Ok<T> {
  ok: true;
  value: T;
}

export interface Err {
  ok: false;
  code: ErrorCode;
  error: string;
}

export type Result<T> = Ok<T> | Err;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });

export const err = (code: ErrorCode, error: string): Err => ({ ok: false, code, error });
