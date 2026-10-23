import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import Dotted from './Dotted';

/** Site polish: the headline period is a round dot, and the "." stays in the text. */
describe('Dotted', () => {
  it('paints a final period as the round dot and keeps the text whole', () => {
    const { container } = render(
      <h2>
        <Dotted text="Nunca entrenes solo." />
      </h2>
    );
    expect(container.textContent).toBe('Nunca entrenes solo.');
    const dot = container.querySelector('h2 > span');
    expect(dot?.className).toMatch(/dot/);
    expect(dot?.textContent).toBe('.');
  });

  it('leaves text without a final period alone', () => {
    const { container } = render(<Dotted text="¿Das clases?" />);
    expect(container.innerHTML).toBe('¿Das clases?');
  });

  it('leaves an ellipsis alone', () => {
    const { container } = render(<Dotted text="Enviando..." />);
    expect(container.querySelector('span')).toBeNull();
  });

  it('outline: the stroked headline gets the ring variant', () => {
    const { container } = render(<Dotted text="es el plan." outline />);
    expect(container.querySelector('span')?.className).toMatch(/dotOutline/);
  });
});
