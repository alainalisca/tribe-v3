/**
 * T-MOM1: the capture time from a photo's raw bytes. EXIF stores its dates as
 * ASCII "YYYY:MM:DD HH:MM:SS" (DateTime, the last edit, and DateTimeOriginal,
 * the capture); the earliest is the capture time. Works on JPEG and HEIC
 * bytes alike, in the browser (before the canvas strips EXIF) and on the
 * server. Null when there is none.
 */
export function exifCaptureDate(latin1: string): Date | null {
  const stamps = [...latin1.matchAll(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/g)]
    .map((m) => new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`))
    .filter((d) => !Number.isNaN(d.getTime()) && d.getFullYear() > 1990)
    .sort((a, b) => a.getTime() - b.getTime());
  return stamps[0] ?? null;
}
