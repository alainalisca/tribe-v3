/**
 * The Delete account button, restored 2026-10-10. Two properties:
 *  - it hands the page the whole identity (id, name, email) so the confirm
 *    dialog can say WHICH account is about to go, and
 *  - admin rows have no button at all, because the route refuses them.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import UserManagement from './UserManagement';

vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'en' }) }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const base = {
  created_at: '2026-09-01T00:00:00Z',
  last_login_at: null,
  is_instructor: false,
  is_test_account: true,
  banned: false,
  sessions_completed: 0,
  sessions_created: 0,
  sessions_joined: 0,
};
const users = [
  { ...base, id: 'u-test', name: 'Test Uno', email: 'test1@example.com', is_admin: false },
  { ...base, id: 'u-admin', name: 'Admin Person', email: 'admin@example.com', is_admin: true },
];

function renderList(onDelete = vi.fn()) {
  render(
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
      onDelete={onDelete}
    />
  );
  return onDelete;
}

function openMenu(index: number) {
  fireEvent.click(screen.getAllByRole('button', { name: 'Actions' })[index]);
}

describe('UserManagement delete account', () => {
  it('passes id, name and email to onDelete', () => {
    const onDelete = renderList();
    openMenu(0);
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    expect(onDelete).toHaveBeenCalledWith({ id: 'u-test', name: 'Test Uno', email: 'test1@example.com' });
  });

  it('offers no delete button on an admin row', () => {
    renderList();
    openMenu(1);
    expect(screen.queryByRole('button', { name: 'Delete account' })).toBeNull();
    // The menu did open: Ban is there, so the absence above is not vacuous.
    expect(screen.getByRole('button', { name: 'Ban' })).toBeTruthy();
  });
});
