ALTER TABLE public.users ADD COLUMN IF NOT EXISTS welcome_email_sent_at TIMESTAMPTZ;
COMMENT ON COLUMN public.users.welcome_email_sent_at IS 'Timestamp when the welcome onboarding email was sent. NULL means not yet sent. Gates the welcome-email cron sweep.';
