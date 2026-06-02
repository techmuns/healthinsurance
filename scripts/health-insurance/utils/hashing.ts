// ---------------------------------------------------------------------------
//  Content hashing — SHA-256 over raw bytes.
//
//  Hashes are how the pipeline avoids re-downloading and re-cataloguing the
//  same document twice: two artifacts with the same hash are the same file,
//  regardless of URL or filename.
// ---------------------------------------------------------------------------

import { createHash } from 'node:crypto'

export function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex')
}

/** Short, human-friendly hash prefix for logs. */
export function shortHash(hash: string): string {
  return hash.slice(0, 12)
}
