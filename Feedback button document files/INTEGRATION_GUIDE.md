# Feedback Widget Integration Guide

## Overview

This feature adds an in-app feedback form to Tribe via a floating action button (FAB) in the bottom-right corner. When tapped, a bottom sheet slides up with category selection, a message textarea, and optional screenshot attachment. Submissions are stored in Supabase with RLS, and you receive an email notification via Resend for every new submission.

## Architecture

```
User taps FAB
    |
    v
FeedbackWidget.tsx (React component)
    |
    v
POST /api/feedback (Next.js API route)
    |
    +---> Supabase Storage (screenshot upload, if present)
    |
    +---> Supabase DB (user_feedback table insert)
    |
    +---> Resend (email notification to tribe@aplusfitnessllc.com)
```

## Files to integrate

| File | Destination in your project | Purpose |
|------|---------------------------|---------|
| 01_migration_user_feedback.sql | Run in Supabase SQL Editor | Creates table, RLS policies, storage bucket |
| types/feedback.ts | src/types/feedback.ts | TypeScript type definitions |
| lib/data-access/feedback.ts | src/lib/data-access/feedback.ts | Data access layer functions |
| app/api/feedback/route.ts | src/app/api/feedback/route.ts | API route handler |
| components/FeedbackWidget.tsx | src/components/FeedbackWidget.tsx | React FAB + bottom sheet component |

## Step-by-step integration

### Step 1: Run the migration

Open the Supabase Dashboard for project twyplulysepbeypqralz. Go to SQL Editor. Paste the contents of 01_migration_user_feedback.sql and run it. This creates:

- The user_feedback table with all columns, indexes, and constraints
- RLS policies so users can only insert/read their own feedback
- The feedback-screenshots storage bucket with RLS policies
- An auto-update trigger for the updated_at column

### Step 2: Verify environment variables

Make sure these are set in your .env.local (you should already have all of them):

```
NEXT_PUBLIC_SUPABASE_URL=https://twyplulysepbeypqralz.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
RESEND_API_KEY=your_resend_api_key
```

### Step 3: Copy the files

Copy each file to its destination as listed in the table above. Adjust import paths if your project structure differs (e.g., if you use src/ or not).

### Step 4: Add the widget to your layout

In your root layout or main page component, import and render the widget:

```tsx
import { FeedbackWidget } from '@/components/FeedbackWidget';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        {children}
        <FeedbackWidget appVersion="2.5.0" bottomOffset={72} />
      </body>
    </html>
  );
}
```

The bottomOffset prop controls how far above the bottom of the screen the FAB sits. Set it to clear your tab bar (default is 72px). Adjust this value based on your actual tab bar height plus any safe area insets.

### Step 5: Test the flow

1. Open the app on a real device (remember: iOS loads from Vercel, so you need to git push, deploy, and force-close to test)
2. Tap the green FAB
3. Select a category, write a message (minimum 10 characters), optionally attach a screenshot
4. Tap "Send feedback"
5. Verify the success animation appears
6. Check your inbox at tribe@aplusfitnessllc.com for the notification email
7. Check the Supabase table browser to confirm the row was inserted

## Key design decisions and why

**API route instead of direct Supabase insert from the client:** The API route serves three purposes. First, it handles screenshot upload using the service role, which avoids exposing the service role key to the client. Second, it sends the Resend email notification, which requires the API key and must run server-side. Third, it provides a single validation checkpoint so the client cannot bypass constraints.

**Screenshot as base64 in the POST body instead of multipart form data:** This simplifies the client code significantly. At the expected volume (50 users, maybe a few feedback submissions per week), the slightly larger payload size is irrelevant. If you ever need to handle larger files or higher volume, switch to a presigned URL upload pattern.

**Private storage bucket instead of public:** Feedback screenshots may contain sensitive information (a user's screen showing their profile, other users' data, etc.). Private bucket means screenshots are only accessible via signed URLs that expire after 1 hour.

**10-character minimum message length:** This prevents drive-by empty submissions while keeping the bar low enough that someone reporting a real bug will not be frustrated.

**Non-blocking email notification:** If Resend fails, the feedback is still saved. You will see it in the database even if the email never arrives. This is the correct failure mode because losing the feedback itself would be worse than missing a notification.

## Checking feedback in the database

You can query feedback directly in the Supabase SQL Editor:

```sql
-- All new feedback, most recent first
select id, category, message, status, created_at
from user_feedback
where status = 'new'
order by created_at desc;

-- Bug reports only
select * from user_feedback
where category = 'bug'
order by created_at desc;

-- Update status after reviewing
update user_feedback
set status = 'reviewed', admin_notes = 'Noted, will fix in 2.6.0'
where id = 'some-uuid-here';
```

## Future enhancements (not now)

These are things to consider only after you have real feedback volume:

- Admin dashboard page in the app to view/triage feedback without going to Supabase
- Bilingual support (the category labels are already defined with en/es in types/feedback.ts)
- Feedback status updates pushed back to the user (so they know you saw it)
- Rate limiting (if spam becomes an issue, add a per-user rate limit in the API route)
