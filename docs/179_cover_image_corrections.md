# Migration 179: corrections to the record

Two things that belong with 179 but cannot be fixed in 179 itself, because it is
applied and its file on `main` must keep matching the text that was run.

## 1. The applied header lists a write site that cannot write

179's header says:

```
--   profile/edit/page.tsx                storefront_banner_url only
```

`app/profile/edit/page.tsx` does not write to the database. Its two mentions of
the column were `setFormData` calls, which are form state. It contains no
`updateUser`, no `.update()` and no `.upsert()`.

The writer is **`app/profile/edit/useEditProfile.ts:375`**, which the header
omits. So the list names the file that cannot write and leaves out the one that
does.

It was wrong in a second way: the header implies four write sites and four read
sites. **Seventeen source files touched the two columns.** The ones missing from
every scoping pass were `SessionCard.tsx`, `SpotlightBanner.tsx`,
`StorefrontProfileColumn.tsx`, `GymStorefrontHeader.tsx`,
`dashboard/instructor/page.tsx`, `lib/dal/instructorDashboard.ts` and
`lib/dal/users.ts`.

The cause of both was the same, and it is worth naming: the list was written
from memory of the sites already discussed rather than by enumerating them. The
enumeration took one command and produced a different answer twice.

The authoritative list is now `lib/coverImage.singleColumn.test.ts`, which is
executable and cannot drift silently.

## 2. `cover_image_url` was endorsed without checking the name was free

Al approved `cover_image_url` on the reasoning that it is consistent naming --
the cover of an entity -- which it is. **The collision was not checked.**

`cover_image_url` already existed on two other tables before 179 added a third:

| table         | column                       |
| ------------- | ---------------------------- |
| `communities` | `cover_image_url`            |
| `challenges`  | `cover_image_url`            |
| `users`       | `cover_image_url` (new, 179) |

Eight source files referenced the name before this branch existed.

**This is the same miss as `banner_url`**, which is the defect 179 was written
to end: `banner_url` exists on `users` AND on `featured_partners`, and that
overlap is precisely why a name-based guard could not be written and why two
files needed resolving by hand.

The practical consequence is already visible. The guard for this migration could
not be keyed on the column name in either direction -- `banner_url` would have
demanded migrating a column that does not exist on `featured_partners`, and
`cover_image_url` matches eight files with nothing to do with users.

The name is kept. It is the right name for what it holds, the three tables are
never joined on it, and renaming now would cost more than the ambiguity does.
What is recorded is that the check was not done, by either of us, on the exact
question the migration existed to answer.

**The check is two greps and it belongs in the naming decision, not after it:**
does this column name already exist on another table, and will any guard, query
or log line that mentions it be ambiguous as a result.
