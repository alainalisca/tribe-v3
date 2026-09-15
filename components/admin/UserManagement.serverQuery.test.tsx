/**
 * ADMIN-01: UserManagement must NOT narrow the list itself.
 *
 * The DAL test (lib/dal/admin.usersQuery.test.ts) proves the query searches the
 * whole table. It cannot see a client-side filter re-added here -- and that
 * filter is exactly what made user 101 look nonexistent. This guards the other
 * half: whatever rows the server returns are the rows that render.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import UserManagement from './UserManagement';

vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'en' }) }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const users = [
  {
    id: 'a',
    name: 'Ana Restrepo',
    email: 'ana@example.com',
    created_at: '2026-09-01T00:00:00Z',
    last_login_at: '2026-09-13T00:00:00Z',
    is_instructor: true,
    is_test_account: false,
    banned: false,
    sessions_completed: 4,
    sessions_created: 2,
    sessions_joined: 7,
  },
  {
    id: 'b',
    name: 'Bruno Gil',
    email: 'bruno@example.com',
    created_at: '2026-08-01T00:00:00Z',
    last_login_at: null,
    is_instructor: false,
    is_test_account: true,
    banned: false,
    sessions_completed: 0,
    sessions_created: 0,
    sessions_joined: 0,
  },
];

function renderList(props: Partial<React.ComponentProps<typeof UserManagement>> = {}) {
  return render(
    <UserManagement
      users={users as never}
      searchQuery=""
      onSearchChange={vi.fn()}
      filter="all"
      onFilterChange={vi.fn()}
      sort="newest"
      onSortChange={vi.fn()}
      loading={false}
      actionLoading={null}
      onBan={vi.fn()}
      onUnban={vi.fn()}
      {...props}
    />
  );
}

describe('UserManagement — the server owns the query', () => {
  it('renders every row the server returned, even when searchQuery matches none of them', () => {
    // The old implementation filtered `users` by this string and would render
    // nothing. The server has already applied the search; re-applying it here is
    // how rows outside the page got lost.
    renderList({ searchQuery: 'this matches nothing at all' });

    expect(screen.getByText('Ana Restrepo')).toBeTruthy();
    expect(screen.getByText('Bruno Gil')).toBeTruthy();
  });

  it('asks the page to re-query instead of filtering, when the search box changes', () => {
    const onSearchChange = vi.fn();
    renderList({ onSearchChange });

    fireEvent.change(screen.getByPlaceholderText(/Search ALL users/i), { target: { value: 'zzyzx' } });

    expect(onSearchChange).toHaveBeenCalledWith('zzyzx');
    // and it did not quietly drop rows in the meantime
    expect(screen.getByText('Ana Restrepo')).toBeTruthy();
  });

  it('reports a filter chip press upward rather than filtering in place', () => {
    const onFilterChange = vi.fn();
    renderList({ onFilterChange });

    fireEvent.click(screen.getByText('Test accounts'));

    expect(onFilterChange).toHaveBeenCalledWith('test');
    expect(screen.getByText('Ana Restrepo')).toBeTruthy();
  });

  it('shows a TEST badge only on the test account', () => {
    renderList();
    expect(screen.getAllByText('TEST')).toHaveLength(1);
  });

  it('badges the exception, not the rule: no INSTRUCTOR pill on any row', () => {
    // Measured on production 2026-09-14: 24 of 91 users are instructors and 67
    // are athletes. A pill on every instructor row was carrying no information
    // at the top of a newest-first list, where recent gym signups cluster.
    // The role is a quiet text label now; pills are reserved for TEST/BANNED/ADMIN.
    renderList();
    expect(screen.queryByText('INSTRUCTOR')).toBeNull();
    expect(screen.getByText(/^Instructor ·/)).toBeTruthy();
  });

  it('keeps destructive actions out of the scan surface until the row is opened', () => {
    renderList();
    // Nothing destructive renders by default...
    expect(screen.queryByText('Ban')).toBeNull();
    expect(screen.queryByText('Delete')).toBeNull();

    fireEvent.click(screen.getAllByLabelText('Actions')[0]);

    // ...Ban appears behind the overflow...
    expect(screen.getByText('Ban')).toBeTruthy();
    // ...and Delete is gone from the list entirely (ADMIN_EMAILS 403 mitigation).
    expect(screen.queryByText('Delete')).toBeNull();
  });

  it('opens only one row menu at a time', () => {
    renderList();
    const buttons = screen.getAllByLabelText('Actions');
    fireEvent.click(buttons[0]);
    expect(screen.getAllByText('Ban')).toHaveLength(1);
    fireEvent.click(buttons[1]);
    expect(screen.getAllByText('Ban')).toHaveLength(1);
  });

  it('shows "never" for an account that has never logged in', () => {
    renderList();
    expect(screen.getByText('never')).toBeTruthy();
  });

  it('surfaces created/joined/completed per row, with the legend carried once in the header', () => {
    // Density: the three counts ride as one compact triple instead of three
    // labelled spans per row, and the words live once in the header legend.
    renderList();
    expect(screen.getByText('2/7/4')).toBeTruthy(); // Ana: 2 created, 7 joined, 4 completed
    expect(screen.getByText('0/0/0')).toBeTruthy(); // Bruno
    expect(screen.getAllByText('seen · created/joined/completed')).toHaveLength(1);
  });
});
