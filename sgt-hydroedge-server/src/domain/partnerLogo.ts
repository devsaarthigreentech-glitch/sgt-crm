// =====================================================================
// domain/partnerLogo.ts — accepting a partner's logo.
//
// This image is not decoration. It is re-published to ERPNext as a
// PUBLIC file and printed on a document a customer receives, so what is
// accepted here ends up on the open internet under SGT's domain. That
// is the whole reason this module is strict.
//
// THREE CHECKS, IN ORDER
//
//   1. Type. PNG, JPEG or WebP only.
//      SVG is refused deliberately: it is a script-bearing format, and
//      the PDF renderer draws it inconsistently at print DPI anyway.
//   2. Size. Small enough to embed and mail without thought.
//   3. Content. The first bytes must actually BE the format claimed.
//      A content-type header is a claim by the uploader, not a fact —
//      and we are about to host whatever this is.
//
// Everything returns a message a person can act on, because the person
// reading it is a distributor with a logo file, not an engineer.
// =====================================================================

export interface DecodedLogo {
  fileName: string;
  contentType: string;
  bytes: Buffer;
}

export type LogoResult =
  | { ok: true; logo: DecodedLogo }
  | { ok: false; message: string };

/** Decoded ceiling, not the base64 length. Override per deployment. */
export const LOGO_MAX_BYTES =
  Number(process.env.PARTNER_LOGO_MAX_KB ?? '512') * 1024;

const ALLOWED: Record<string, { ext: string; label: string }> = {
  'image/png': { ext: 'png', label: 'PNG' },
  'image/jpeg': { ext: 'jpg', label: 'JPEG' },
  'image/webp': { ext: 'webp', label: 'WebP' },
};

/** Sniff the real format from the leading bytes. Null when unrecognised. */
function sniff(bytes: Buffer): string | null {
  if (bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= 12 &&
      bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

/**
 * Turn what the browser posted into bytes we are willing to host.
 *
 * Accepts either a bare base64 string or the `data:image/png;base64,…`
 * URL a FileReader produces, because both turn up depending on which
 * screen is doing the uploading.
 */
export function decodeLogo(input: unknown): LogoResult {
  const b = (input ?? {}) as Record<string, unknown>;
  const rawName = String(b.filename ?? b.fileName ?? '').trim();
  const raw64 = String(b.base64 ?? b.content ?? '');

  if (!raw64) return { ok: false, message: 'No image was received.' };

  const payload = raw64.includes(',') && raw64.slice(0, 60).includes('base64,')
    ? raw64.slice(raw64.indexOf(',') + 1)
    : raw64;

  let bytes: Buffer;
  try {
    bytes = Buffer.from(payload, 'base64');
  } catch {
    return { ok: false, message: 'The image could not be decoded.' };
  }
  if (!bytes.length) return { ok: false, message: 'The image is empty.' };

  if (bytes.length > LOGO_MAX_BYTES) {
    return {
      ok: false,
      message: `That file is ${(bytes.length / 1024).toFixed(0)} KB. The limit is ` +
               `${Math.round(LOGO_MAX_BYTES / 1024)} KB — a logo does not need more, ` +
               `and it has to travel on every quotation.`,
    };
  }

  // The bytes decide, not the header the browser guessed.
  const actual = sniff(bytes);
  if (!actual) {
    return {
      ok: false,
      message: 'That is not a PNG, JPEG or WebP image. If it is an SVG or a PDF, ' +
               'export it as PNG first — those do not print reliably.',
    };
  }

  const spec = ALLOWED[actual];
  // A PNG with a transparent background sits on the letterhead cleanly;
  // worth saying, because most logos arrive as a white-boxed JPEG.
  const base = rawName.replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 60);
  return {
    ok: true,
    logo: {
      fileName: `${base || 'logo'}.${spec.ext}`,
      contentType: actual,
      bytes,
    },
  };
}
