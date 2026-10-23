import b from './base.module.css';

/**
 * Site polish (Al, 2026-10-23). The display face draws "." as a square; the
 * Tribe dot is always a circle. A headline's final period is painted as a
 * round dot in the text's own color, sized to the stroke. The "." stays in the
 * DOM (visually hidden) for copy and screen readers. `outline` is for the
 * stroked headline ("es el plan."), whose fill is transparent.
 */
export default function Dotted({ text, outline }: { text: string; outline?: boolean }) {
  if (!text.endsWith('.') || text.endsWith('..')) return <>{text}</>;
  return (
    <>
      {text.slice(0, -1)}
      <span className={`${b.dot} ${outline ? b.dotOutline : ''}`}>
        <span className={b.dotTx}>.</span>
      </span>
    </>
  );
}
