'use client';

/**
 * Tribe.OS DataTable — generic tabular data renderer.
 *
 * Pass in `headers` (string array) and `rows` (2D array of cells
 * which can be ReactNodes or strings). Alternating row tint, hover
 * affordance, horizontal-scroll wrapper for narrow viewports, and a
 * graceful empty state.
 *
 * Ported from the sibling tribe-os codebase. Used by surfaces that
 * need a quick generic table; complex tables (e.g. /os/members)
 * should keep their bespoke layouts.
 */

import React from 'react';
import { cn } from '@/lib/utils';

interface DataTableProps extends React.HTMLAttributes<HTMLTableElement> {
  headers: string[];
  rows: Array<Array<React.ReactNode | string>>;
  emptyMessage?: string;
}

const DataTable = React.forwardRef<HTMLTableElement, DataTableProps>(
  ({ className, headers, rows, emptyMessage = 'No data available' }, ref) => {
    if (rows.length === 0) {
      return (
        <div className="py-12 text-center">
          <p className="text-tribe-dark-80">{emptyMessage}</p>
        </div>
      );
    }

    return (
      <div className="overflow-x-auto rounded-tribe border border-tribe-dark-40">
        <table ref={ref} className={cn('w-full border-collapse', className)}>
          <thead>
            <tr className="bg-tribe-dark-40">
              {headers.map((header, idx) => (
                <th
                  key={idx}
                  className="px-6 py-3 text-left text-sm font-semibold text-tribe-dark border-b border-tribe-dark-60"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className={cn(
                  'border-b border-tribe-dark-40 transition-colors hover:bg-tribe-dark-40',
                  rowIdx % 2 === 0 ? 'bg-white' : 'bg-tribe-dark-40/50'
                )}
              >
                {row.map((cell, cellIdx) => (
                  <td key={cellIdx} className="px-6 py-4 text-sm text-tribe-dark">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
);

DataTable.displayName = 'TribeDataTable';

export default DataTable;
