/** Application-used Cloudflare binding contracts. These declarations do not create bindings. */
interface D1Meta {
  changes: number;
  duration: number;
  last_row_id: number;
  size_after: number;
  rows_read: number;
  rows_written: number;
  changed_db: boolean;
}
interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: true;
  meta: D1Meta;
}
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<T[]>;
}
interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<{ count: number; duration: number }>;
  dump(): Promise<ArrayBuffer>;
}
interface Fetcher {
  fetch(input: Request | string | URL, init?: RequestInit): Promise<Response>;
}
declare module 'cloudflare:workers' {
  export const env: { DB: D1Database; OPENAI_API_KEY?: string };
}
