declare module 'argon2-browser' {
  export enum ArgonType {
    Argon2d = 0,
    Argon2i = 1,
    Argon2id = 2,
  }
  export interface Argon2HashOptions {
    pass: string | Uint8Array;
    salt: string | Uint8Array;
    time?: number;
    mem?: number;
    hashLen?: number;
    parallelism?: number;
    type?: ArgonType;
  }
  export interface Argon2HashResult {
    hash: Uint8Array;
    hashHex: string;
    encoded: string;
  }
  export function hash(options: Argon2HashOptions): Promise<Argon2HashResult>;
  export function verify(options: { pass: string | Uint8Array; encoded: string }): Promise<{ correct: boolean }>;
  const argon2: {
    hash: typeof hash;
    verify: typeof verify;
    ArgonType: typeof ArgonType;
  };
  export default argon2;
}
