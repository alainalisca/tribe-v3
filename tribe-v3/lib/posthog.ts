import posthog from 'posthog-js'

export function initPostHog() {
  if (typeof window !== 'undefined') {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      loaded: (posthog) => {
        if (process.env.NODE_ENV === 'development') posthog.debug()
      },
      capture_pageview: false, // We'll capture manually
    })
  }
}

export { posthog }
