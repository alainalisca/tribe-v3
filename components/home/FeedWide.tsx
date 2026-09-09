/**
 * Spans a feed item across both columns of the lg+ grid.
 *
 * Wrapping at the insertion point rather than inside each discovery component
 * keeps those components reusable on pages that are not a two-column grid.
 */
export default function FeedWide({ children }: { children: React.ReactNode }) {
  return <div className="lg:col-span-2">{children}</div>;
}
