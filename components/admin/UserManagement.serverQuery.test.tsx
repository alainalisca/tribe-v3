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
      onDelete={vi.fn()}
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

  it('shows "never" for an account that has never logged in, and an age for one that has', () => {
    renderList();
    expect(screen.getByText('never')).toBeTruthy();
    expect(screen.getAllByText('seen')).toHaveLength(2);
  });

  it('surfaces sessions_completed alongside the derived created/joined counts', () => {
    renderList();
    expect(screen.getAllByText('completed').length).toBe(2);
    expect(screen.getAllByText('created').length).toBe(2);
    expect(screen.getAllByText('joined').length).toBe(2);
  });
});
