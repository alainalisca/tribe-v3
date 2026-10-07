/**
 * T-AV23. The voucher QR on the claimed pass, above the code.
 *
 * The SVG is rendered on the server (lib/qr/renderQrSvg.ts, server-only) and
 * arrives as a string in the /api/pase response, then survives a refresh in
 * sessionStorage. It is injected as markup, so it is rendered ONLY when it has
 * exactly the shape renderQrSvg produces: an svg of one rect and one path of
 * M/h/v/z commands. Anything else (a tampered sessionStorage entry, a future
 * change to the renderer that forgot this check) renders nothing rather than
 * whatever the string contains.
 */
import { isRenderedQrSvg } from '@/lib/svg/qrSvgShape';

/** The shared rule (lib/svg/qrSvgShape.ts), under the name T-AV23's tests use. */
export function isVoucherSvg(svg: string): boolean {
  return isRenderedQrSvg(svg);
}

interface VoucherQrProps {
  svg: string;
}

export default function VoucherQr({ svg }: VoucherQrProps) {
  if (!isVoucherSvg(svg)) return null;
  return (
    <div className="mt-3 flex flex-col items-center">
      <div
        className="h-48 w-48 [&>svg]:h-full [&>svg]:w-full"
        // Safe: server-rendered by renderQrSvg and shape-checked above.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <p className="mt-2 text-center text-sm text-stone-600">Muéstralo en la entrada. El coach lo escanea y listo.</p>
    </div>
  );
}
