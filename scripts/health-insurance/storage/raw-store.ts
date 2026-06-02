// ---------------------------------------------------------------------------
//  Raw file store.
//
//  Raw documents live under a configurable cache root (default
//  data/raw/companies, which already holds this repo's fetched corpus). The
//  store reads what's there for offline extraction and writes freshly-fetched
//  files back so the next run can replay them.
//
//  Persistence policy (HI_RAW_PERSIST):
//    • "local"  (default) — keep raw files on disk; do NOT commit large PDFs.
//    • "lfs"    — files are tracked by Git LFS (configure .gitattributes).
//    • "r2" / "s3" — offload to object storage. The upload itself is an opt-in
//      extension point (needs credentials); when unconfigured it is a no-op so
//      a run never fails for lack of a bucket. Nothing is faked.
//
//  Committing raw bytes is OFF by default (HI_COMMIT_RAW=1 to opt in) so the
//  repository never balloons with binaries.
// ---------------------------------------------------------------------------

import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises'
import { resolve, extname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import type { CompanyConfig, FileType } from '../types.js'
import { sha256 } from '../utils/hashing.js'
import { log } from '../utils/logger.js'

const HERE = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = resolve(HERE, '..', '..', '..')

export const RAW_ROOT = process.env.HI_RAW_ROOT
  ? resolve(process.env.HI_RAW_ROOT)
  : resolve(REPO_ROOT, 'data', 'raw', 'companies')

export type PersistBackend = 'local' | 'lfs' | 'r2' | 's3'
export const PERSIST_BACKEND = (process.env.HI_RAW_PERSIST ?? 'local') as PersistBackend
/** Whether raw binaries should be committed to git (default: no). */
export const COMMIT_RAW = process.env.HI_COMMIT_RAW === '1'

export interface RawFile {
  path: string
  filename: string
  /** Path relative to the company's raw dir — carries period info that some
   *  insurers (e.g. care-health) encode in sub-directory names, not filenames. */
  relPath: string
  fileType: FileType
}

export function fileTypeFromName(name: string): FileType {
  const ext = extname(name).toLowerCase()
  if (ext === '.pdf') return 'pdf'
  if (ext === '.xlsx' || ext === '.xls') return 'xlsx'
  if (ext === '.csv') return 'csv'
  if (ext === '.html' || ext === '.htm') return 'html'
  return 'unknown'
}

/** Recursively list raw files already cached for a company. */
export async function listRawFiles(company: CompanyConfig): Promise<RawFile[]> {
  const root = resolve(RAW_ROOT, company.rawDir)
  const out: RawFile[] = []
  await walk(root, root, out)
  return out
}

async function walk(root: string, dir: string, out: RawFile[]): Promise<void> {
  let entries: import('node:fs').Dirent[]
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return // directory absent — honest empty, no error
  }
  for (const e of entries) {
    const full = resolve(dir, e.name)
    if (e.isDirectory()) await walk(root, full, out)
    else if (e.isFile()) {
      out.push({
        path: full,
        filename: basename(e.name),
        relPath: full.slice(root.length + 1),
        fileType: fileTypeFromName(e.name),
      })
    }
  }
}

export async function readRaw(path: string): Promise<Buffer> {
  return readFile(path)
}

/** Compute a content hash without re-reading a buffer we already hold. */
export function hashBuffer(buffer: Buffer): string {
  return sha256(buffer)
}

/**
 * Write a freshly-fetched raw file into the cache and return its path + hash.
 * Honours the persistence backend; remote offload is best-effort and never
 * fatal.
 */
export async function saveRaw(
  company: CompanyConfig,
  subdir: string,
  filename: string,
  buffer: Buffer,
): Promise<{ path: string; hash: string }> {
  const dir = resolve(RAW_ROOT, company.rawDir, subdir)
  await mkdir(dir, { recursive: true })
  const safe = filename.replace(/[^\w.\- ]+/g, '_').slice(0, 180)
  const path = resolve(dir, safe)
  await writeFile(path, buffer)
  const hash = sha256(buffer)
  if (PERSIST_BACKEND === 'r2' || PERSIST_BACKEND === 's3') {
    await offloadToObjectStore(PERSIST_BACKEND, company, safe, buffer).catch((e) =>
      log.warn('raw-store', 'object-store offload skipped', { backend: PERSIST_BACKEND, error: String(e) }),
    )
  }
  return { path, hash }
}

/**
 * Opt-in object-storage offload. Wired but inert unless the corresponding
 * bucket + credentials env vars are present — keeps the contract without
 * faking an upload that didn't happen.
 */
async function offloadToObjectStore(
  backend: 'r2' | 's3',
  company: CompanyConfig,
  filename: string,
  _buffer: Buffer,
): Promise<void> {
  const bucket = process.env.HI_RAW_BUCKET
  const endpoint = process.env.HI_RAW_ENDPOINT
  if (!bucket || (backend === 'r2' && !endpoint)) {
    log.debug('raw-store', 'object-store not configured — keeping local only', { backend })
    return
  }
  // Intentionally not implemented with a vendored SDK to keep the dependency
  // surface small. The key/region are logged so an operator can wire the
  // aws-sdk / @aws-sdk/client-s3 upload here when they enable the backend.
  log.info('raw-store', 'object-store offload point reached (configure SDK to enable)', {
    backend,
    bucket,
    key: `${company.slug}/${filename}`,
  })
}
