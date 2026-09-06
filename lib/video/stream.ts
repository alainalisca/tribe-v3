/**
 * Cloudflare Stream direct creator upload.
 *
 * The browser never sees the account token. The server mints a one time
 * upload URL here, the client PUTs the file straight to Cloudflare, and the
 * bytes never pass through Vercel.
 *
 * Two cost facts drive the defaults below, both of which are easy to get
 * wrong and expensive to leave wrong:
 *
 *   1. Cloudflare reserves storage for the declared maxDurationSeconds as
 *      soon as the link is minted, and holds it until the upload finishes or
 *      the link expires. A generous maxDurationSeconds on an abandoned upload
 *      is billed reserved minutes for nothing, so keep it tight and keep the
 *      expiry short.
 *   2. Stream does not overwrite on re-upload. Every replacement creates a
 *      NEW uid and the old video keeps consuming its minutes forever unless
 *      it is explicitly deleted, which is what deleteVideo is for.
 *
 * Docs: https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/
 */

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';

/** Default cap on a single intro video. Also the storage Cloudflare reserves. */
export const DEFAULT_MAX_DURATION_SECONDS = 120;

/** Default life of a minted upload URL. Cloudflare requires 2 minutes to 6 hours. */
export const DEFAULT_EXPIRY_SECONDS = 1800;

export interface CreateDirectUploadParams {
  /** Longest video the link will accept. Reserved storage, so keep it tight. */
  maxDurationSeconds?: number;
  /** How long the minted URL stays usable, in seconds. */
  expirySeconds?: number;
}

export interface DirectUpload {
  /** One time URL the browser PUTs the file to. */
  uploadURL: string;
  /** Cloudflare's video id. Persist this; it is the handle for playback and delete. */
  uid: string;
}

/** One entry of Cloudflare's `errors` array. */
interface CloudflareError {
  code: number;
  message: string;
}

interface CloudflareEnvelope<T> {
  success: boolean;
  errors: CloudflareError[];
  messages: CloudflareError[];
  result: T;
}

interface DirectUploadResult {
  uid: string;
  uploadURL: string;
}

/**
 * Raised for any Cloudflare response that is not a clean success. Carries the
 * HTTP status and Cloudflare's own error array so the caller can log what
 * actually went wrong instead of a generic failure.
 */
export class CloudflareStreamError extends Error {
  readonly status: number;
  readonly cloudflareErrors: CloudflareError[];

  constructor(message: string, status: number, cloudflareErrors: CloudflareError[] = []) {
    super(message);
    this.name = 'CloudflareStreamError';
    this.status = status;
    this.cloudflareErrors = cloudflareErrors;
  }
}

function readConfig(): { accountId: string; token: string } {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_STREAM_TOKEN;
  if (!accountId || !token) {
    throw new CloudflareStreamError('Cloudflare Stream is not configured', 0);
  }
  return { accountId, token };
}

/** Best effort read of Cloudflare's error array from a failed response. */
async function readErrors(response: Response): Promise<CloudflareError[]> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && 'errors' in body) {
      const errors = (body as { errors?: unknown }).errors;
      if (Array.isArray(errors)) return errors as CloudflareError[];
    }
    return [];
  } catch {
    return [];
  }
}

function describe(errors: CloudflareError[]): string {
  if (errors.length === 0) return 'no error detail returned';
  return errors.map((e) => `${e.code}: ${e.message}`).join('; ');
}

/**
 * Mint a one time direct creator upload URL.
 *
 * Throws CloudflareStreamError when the credentials are absent or Cloudflare
 * refuses. The error carries Cloudflare's own message rather than a generic one.
 */
export async function createDirectUpload(params: CreateDirectUploadParams = {}): Promise<DirectUpload> {
  const { accountId, token } = readConfig();
  const maxDurationSeconds = params.maxDurationSeconds ?? DEFAULT_MAX_DURATION_SECONDS;
  const expirySeconds = params.expirySeconds ?? DEFAULT_EXPIRY_SECONDS;

  // Cloudflare wants an absolute RFC3339 instant for expiry, not a duration.
  const expiry = new Date(Date.now() + expirySeconds * 1000).toISOString();

  const response = await fetch(`${CLOUDFLARE_API_BASE}/accounts/${accountId}/stream/direct_upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ maxDurationSeconds, expiry }),
  });

  if (!response.ok) {
    const errors = await readErrors(response);
    throw new CloudflareStreamError(
      `Cloudflare Stream direct upload failed (${describe(errors)})`,
      response.status,
      errors
    );
  }

  const envelope = (await response.json()) as CloudflareEnvelope<DirectUploadResult>;
  if (!envelope.success || !envelope.result?.uploadURL || !envelope.result?.uid) {
    const errors = envelope.errors ?? [];
    throw new CloudflareStreamError(
      `Cloudflare Stream returned no upload URL (${describe(errors)})`,
      response.status,
      errors
    );
  }

  return { uploadURL: envelope.result.uploadURL, uid: envelope.result.uid };
}

/**
 * Permanently delete a Stream video and free its minutes.
 *
 * Stream never overwrites: replacing an intro video creates a new uid and
 * leaves the old one billing forever. Call this with the previous uid
 * whenever a video is replaced or removed.
 */
export async function deleteVideo(uid: string): Promise<void> {
  const { accountId, token } = readConfig();

  const response = await fetch(`${CLOUDFLARE_API_BASE}/accounts/${accountId}/stream/${uid}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  // A already deleted video reports 404. Treat it as done rather than as a
  // failure, so a retry after a partial cleanup does not error.
  if (response.status === 404) return;

  if (!response.ok) {
    const errors = await readErrors(response);
    throw new CloudflareStreamError(`Cloudflare Stream delete failed (${describe(errors)})`, response.status, errors);
  }
}
