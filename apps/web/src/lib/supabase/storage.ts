import { getSupabase } from './client'
import { logger } from '@/lib/logger'

/**
 * Access to files in the private buckets.
 *
 * Every file in AcademicOS lives in a private bucket and is reachable only
 * through a signed URL. This module is the single place those are minted, so
 * three properties hold everywhere rather than wherever someone remembered:
 *
 *   1. The lifetime is short and is not left to the caller.
 *   2. The access is written to the audit trail before the URL is handed over.
 *   3. The URL is never logged, never stored, and never put in application
 *      state that might be serialised.
 *
 * The URL itself is a bearer credential for the lifetime of the signature.
 * Anyone holding it can fetch the object without a session, which is why it
 * is treated as a secret and not as a link.
 */

/**
 * How long a signed URL lives.
 *
 * Sixty seconds is enough for a browser to begin the download and not much
 * more. A longer window buys convenience at the cost of a credential that
 * keeps working after it has been copied out of the page — into a chat
 * message, a bug report, or a browser history that syncs.
 *
 * Audio playback uses the same window: the browser fetches the object once
 * and holds it, so the URL does not need to outlive the request.
 */
export const SIGNED_URL_TTL_SECONDS = 60

export type ContentEntity = 'recording' | 'transcript' | 'document'

export interface SignedFile {
  /** Treat as a secret. Do not store, log, or copy into application state. */
  url: string
  expiresAt: Date
}

/**
 * Records the access, then mints a short-lived signed URL.
 *
 * The audit entry is written first and deliberately so. If the audit write
 * fails, no URL is issued: an unrecorded access to a confidential recording
 * is worse than a failed one, and the alternative ordering would mean the
 * system could hand out content it has no record of handing out.
 */
export async function createSignedUrl(
  bucket: string,
  path: string,
  entity: ContentEntity,
  entityId: string,
): Promise<SignedFile> {
  const supabase = getSupabase()

  const { error: auditError } = await supabase.rpc('log_content_access', {
    p_entity_type: entity,
    p_entity_id: entityId,
    p_note: null,
  })
  if (auditError) {
    logger.error('Access could not be recorded; no signed URL was issued', {
      entity,
      entityId,
      reason: auditError.message,
    })
    throw new Error('This file could not be opened because the access could not be recorded.')
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)

  if (error || !data?.signedUrl) {
    // The message is deliberately uninformative about whether the object
    // exists: distinguishing "no such file" from "not yours" tells a caller
    // something about files they cannot read.
    logger.warn('Signed URL was not issued', { entity, entityId, reason: error?.message })
    throw new Error('This file is not available, or you do not have access to it.')
  }

  // Note what is NOT logged here: the URL. It carries the access token.
  logger.info('Signed URL issued', { entity, entityId, ttlSeconds: SIGNED_URL_TTL_SECONDS })

  return {
    url: data.signedUrl,
    expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000),
  }
}

/** Convenience for meeting audio. */
export function createRecordingUrl(storagePath: string, recordingId: string): Promise<SignedFile> {
  return createSignedUrl('meeting-recordings', storagePath, 'recording', recordingId)
}

/**
 * Whether a previously issued URL has passed its expiry.
 *
 * Supabase enforces expiry server-side; this is for the interface, so it can
 * re-request rather than show the user a failed download. It is not a
 * security control and must never be treated as one.
 */
export function hasExpired(file: SignedFile, now: Date = new Date()): boolean {
  return now.getTime() >= file.expiresAt.getTime()
}
