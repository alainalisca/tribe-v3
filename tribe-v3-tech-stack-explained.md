# TRIBE V3 - TECHNICAL ARCHITECTURE DEEP DIVE

## 📱 What Tribe v3 Is

**A real-time, peer-to-peer sports training partner matching application.** Think "Tinder meets Meetup" for athletes who want to find training partners instantly.

**Core Value Prop:** "I want to play basketball at 6pm today at this park - who's available?" → Real-time matching based on sport, time, location, and skill level.

---

## 🏗️ HIGH-LEVEL ARCHITECTURE

```
┌─────────────────────────────────────────────────────┐
│                   CLIENT SIDE                       │
│              (Next.js 15 + React)                   │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │
│  │   Browser    │  │   iOS PWA    │  │Android PWA│ │
│  │  (Desktop)   │  │   (Mobile)   │  │  (Mobile) │ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬────┘ │
│         │                 │                 │      │
│         └─────────────────┼─────────────────┘      │
│                           │                        │
└───────────────────────────┼────────────────────────┘
                            │
                   HTTPS / WebSocket
                            │
┌───────────────────────────┼────────────────────────┐
│                    BACKEND SERVICES                 │
│                                                     │
│  ┌─────────────────────────────────────────────┐  │
│  │           SUPABASE (BaaS Platform)          │  │
│  │                                             │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐ │  │
│  │  │PostgreSQL│  │   Auth   │  │ Realtime │ │  │
│  │  │ Database │  │   (JWT)  │  │(WebSock) │ │  │
│  │  └──────────┘  └──────────┘  └──────────┘ │  │
│  │                                             │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐ │  │
│  │  │  Storage │  │    RLS   │  │   APIs   │ │  │
│  │  │ (Files)  │  │(Security)│  │ (REST)   │ │  │
│  │  └──────────┘  └──────────┘  └──────────┘ │  │
│  └─────────────────────────────────────────────┘  │
│                                                     │
│  ┌─────────────────────────────────────────────┐  │
│  │        VERCEL (Hosting Platform)            │  │
│  │                                             │  │
│  │  - Next.js App Hosting                      │  │
│  │  - Edge Functions (Serverless)              │  │
│  │  - CDN (Global Distribution)                │  │
│  │  - Automatic Deployments from GitHub        │  │
│  └─────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## 💻 FRONTEND TECH STACK

### **1. Next.js 15 (React Framework)**

**Why Next.js:**
- Server-Side Rendering (SSR) for SEO and performance
- App Router (modern file-based routing)
- Built-in API routes (though we use Supabase instead)
- Automatic code splitting
- Image optimization
- TypeScript support out of the box

**Key Next.js Features We Use:**
- **App Router:** File-based routing with `app/` directory
- **Server Components:** Default server-side rendering for performance
- **Client Components:** Interactive UI with `'use client'` directive
- **Dynamic Routes:** `/session/[id]` for session detail pages
- **Layouts:** Shared UI across routes with `layout.tsx`
- **Middleware:** `middleware.ts` for language detection and auth guards

### **2. React 19**

**Core React Patterns Used:**
- **Hooks:** useState, useEffect, useContext, useCallback
- **Context API:** For global state (theme, language)
- **Suspense:** For loading states
- **Error Boundaries:** For graceful error handling

**State Management:**
- **Local State:** React useState for component-specific state
- **Global State:** React Context for theme and i18n
- **Server State:** Supabase queries (no Redux needed)

### **3. TypeScript**

**Why TypeScript:**
- Type safety catches bugs at compile time
- Better IDE autocomplete and intellisense
- Self-documenting code (types as documentation)
- Easier refactoring

**Key Types:**
```typescript
// Example: Session type
type Session = {
  id: string
  creator_id: string
  sport: string
  date: string
  start_time: string
  duration: number
  location: string
  max_participants: number
  current_participants: number
  skill_level: 'beginner' | 'intermediate' | 'advanced'
  created_at: string
}

// Example: User type
type User = {
  id: string
  email: string
  name: string
  avatar_url: string | null
  rating: number
  show_rate: number
  sessions_completed: number
}
```

### **4. Tailwind CSS**

**Why Tailwind:**
- Utility-first CSS (no custom CSS files needed)
- Responsive design with mobile-first breakpoints
- Dark mode support built-in
- Consistent design system
- Purges unused CSS automatically (small bundle size)

**Example Usage:**
```tsx
<div className="bg-slate-900 p-4 rounded-lg shadow-md hover:shadow-lg transition-shadow">
  <h2 className="text-xl font-bold text-white mb-2">
    Session Title
  </h2>
  <p className="text-slate-400">
    Session description
  </p>
</div>
```

**Dark Mode:**
```tsx
// Tailwind automatically handles dark mode
<div className="bg-white dark:bg-slate-900 text-black dark:text-white">
  Content adapts to theme
</div>
```

### **5. next-intl (Internationalization)**

**Why i18n:**
- Bilingual support (English/Spanish) from day one
- Latin American market is primary target
- Easy to add more languages later

**How it works:**
```tsx
// messages/en.json
{
  "home": {
    "title": "Find Training Partners",
    "search": "Search sessions..."
  }
}

// messages/es.json
{
  "home": {
    "title": "Encuentra Compañeros de Entrenamiento",
    "search": "Buscar sesiones..."
  }
}

// Usage in components
import { useTranslations } from 'next-intl'

function Home() {
  const t = useTranslations('home')
  return <h1>{t('title')}</h1>
}
```

**URL Structure:**
- English: `tribe-v3.vercel.app/`
- Spanish: `tribe-v3.vercel.app/es/`

### **6. Lucide React (Icons)**

**Why Lucide:**
- Lightweight icon library (tree-shakeable)
- Consistent design
- Easy to use as React components

```tsx
import { Calendar, MapPin, Users, Clock } from 'lucide-react'

<Calendar className="w-5 h-5 text-lime-400" />
```

---

## 🗄️ BACKEND TECH STACK (Supabase)

### **1. PostgreSQL Database**

**Why PostgreSQL:**
- Open-source, production-grade SQL database
- ACID compliant (reliable transactions)
- JSON support for flexible data
- Full-text search capabilities
- Geospatial queries (for location-based matching)

**Database Schema:**

```sql
-- Users table (extends Supabase auth.users)
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar_url TEXT,
  banner_url TEXT,
  bio TEXT,
  rating DECIMAL(3,2) DEFAULT 0,
  show_rate DECIMAL(5,2) DEFAULT 0,
  sessions_completed INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sessions table
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES users(id) ON DELETE CASCADE,
  sport TEXT NOT NULL,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  duration INTEGER NOT NULL, -- minutes
  location TEXT NOT NULL,
  description TEXT,
  max_participants INTEGER NOT NULL,
  current_participants INTEGER DEFAULT 1,
  skill_level TEXT CHECK (skill_level IN ('beginner', 'intermediate', 'advanced')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Session participants (many-to-many relationship)
CREATE TABLE session_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, user_id)
);

-- Messages table (for chat)
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User photos table
CREATE TABLE user_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Indexes for Performance:**
```sql
-- Speed up session queries
CREATE INDEX sessions_date_idx ON sessions(date);
CREATE INDEX sessions_sport_idx ON sessions(sport);
CREATE INDEX sessions_creator_idx ON sessions(creator_id);

-- Speed up participant lookups
CREATE INDEX participants_session_idx ON session_participants(session_id);
CREATE INDEX participants_user_idx ON session_participants(user_id);

-- Speed up chat queries
CREATE INDEX messages_session_idx ON messages(session_id);
CREATE INDEX messages_created_idx ON messages(created_at);
```

### **2. Supabase Auth (JWT-based Authentication)**

**How Auth Works:**

1. **User Signs Up:**
   ```typescript
   const { data, error } = await supabase.auth.signUp({
     email: 'user@example.com',
     password: 'secure_password'
   })
   ```

2. **Supabase creates:**
   - User in `auth.users` table (managed by Supabase)
   - Sends confirmation email
   - Generates JWT access token

3. **JWT Token Structure:**
   ```json
   {
     "sub": "user-uuid",
     "email": "user@example.com",
     "role": "authenticated",
     "iat": 1699564800,
     "exp": 1699651200
   }
   ```

4. **Token is stored:**
   - Browser: `localStorage` (automatically by Supabase client)
   - Sent with every request in `Authorization: Bearer <token>` header

5. **Server validates token:**
   - Checks signature
   - Verifies expiration
   - Extracts user ID for RLS policies

**Auth Methods Supported:**
- ✅ Email/Password (currently implemented)
- 🔄 OAuth (Google, GitHub, Apple) - easy to add later
- 🔄 Magic Links - passwordless authentication
- 🔄 Phone/SMS authentication

### **3. Row Level Security (RLS)**

**What is RLS:**
Database-level security that filters rows based on user identity. Each SQL query automatically includes security checks.

**Example RLS Policies:**

```sql
-- Users can only update their own profile
CREATE POLICY "Users can update own profile"
ON users FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Anyone can view sessions
CREATE POLICY "Anyone can view active sessions"
ON sessions FOR SELECT
TO authenticated
USING (status = 'active');

-- Only creator can delete sessions
CREATE POLICY "Creators can delete own sessions"
ON sessions FOR DELETE
TO authenticated
USING (creator_id = auth.uid());

-- Only participants can view chat messages
CREATE POLICY "Participants can view session messages"
ON messages FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM session_participants
    WHERE session_participants.session_id = messages.session_id
    AND session_participants.user_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM sessions
    WHERE sessions.id = messages.session_id
    AND sessions.creator_id = auth.uid()
  )
);
```

**Why RLS is Critical:**
- ❌ Without RLS: Anyone with your API key can read/modify ALL data
- ✅ With RLS: Users can only access data they're authorized to see
- Backend security layer (can't bypass from frontend)

### **4. Supabase Realtime (WebSocket-based)**

**What is Realtime:**
WebSocket connections that push database changes to clients instantly.

**How it Works:**

```typescript
// Subscribe to session changes
const channel = supabase
  .channel('sessions')
  .on(
    'postgres_changes',
    {
      event: '*', // INSERT, UPDATE, DELETE
      schema: 'public',
      table: 'sessions'
    },
    (payload) => {
      console.log('Session changed:', payload)
      // Update UI automatically
    }
  )
  .subscribe()

// Subscribe to chat messages
const chatChannel = supabase
  .channel(`session-${sessionId}`)
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `session_id=eq.${sessionId}`
    },
    (payload) => {
      // New message received
      setMessages(prev => [...prev, payload.new])
    }
  )
  .subscribe()
```

**Use Cases in Tribe:**
- 💬 Chat messages appear instantly
- 👥 Participant count updates live
- 🔔 Join request notifications
- ✅ Session status changes

**Benefits:**
- No polling needed (saves API calls)
- Sub-second latency
- Scales automatically
- Works across tabs/devices

### **5. Supabase Storage (File Uploads)**

**For storing:**
- User avatars
- User banner images
- Session photos
- Profile gallery photos

**Example Upload:**
```typescript
const uploadAvatar = async (file: File) => {
  const { data, error } = await supabase.storage
    .from('avatars')
    .upload(`${userId}/${file.name}`, file, {
      cacheControl: '3600',
      upsert: true
    })
  
  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from('avatars')
    .getPublicUrl(data.path)
  
  return publicUrl
}
```

**Storage Features:**
- CDN-backed (fast global delivery)
- Image transformations (resize, compress)
- Access control (RLS for storage)
- Automatic cleanup

---

## 🌐 DEPLOYMENT & HOSTING

### **Vercel (Frontend Hosting)**

**Why Vercel:**
- Built by Next.js creators (perfect integration)
- Global CDN (low latency worldwide)
- Automatic HTTPS
- Git-based deployments (push to GitHub = auto-deploy)
- Edge Functions (serverless compute)
- Preview deployments for every PR

**Deployment Flow:**
```
1. Developer pushes code to GitHub
   ↓
2. GitHub webhook triggers Vercel
   ↓
3. Vercel builds Next.js app
   ↓
4. Vercel deploys to global CDN
   ↓
5. App live at tribe-v3.vercel.app
```

**Environment Variables (stored in Vercel):**
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
NEXT_PUBLIC_APP_URL=https://tribe-v3.vercel.app
```

**Build Configuration:**
```json
// package.json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  }
}
```

### **Supabase (Backend Hosting)**

**Hosted on:**
- AWS (Supabase uses AWS under the hood)
- Automatic backups
- High availability (99.9% uptime SLA)
- Auto-scaling

**Free Tier Limits:**
- 500 MB database storage
- 1 GB file storage
- 2 GB bandwidth/month
- 50,000 monthly active users

---

## 📲 PROGRESSIVE WEB APP (PWA)

### **What Makes it a PWA:**

1. **Web App Manifest** (`manifest.json`)
```json
{
  "name": "Tribe - Find Training Partners",
  "short_name": "Tribe",
  "start_url": "/",
  "display": "standalone", // Full-screen like native app
  "background_color": "#0f172a",
  "theme_color": "#bef264",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    }
  ]
}
```

2. **Service Worker** (`sw.js`)
```javascript
// Cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('tribe-v1').then((cache) => {
      return cache.addAll([
        '/',
        '/manifest.json',
        '/icon-192.png'
      ])
    })
  )
})

// Serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request)
    })
  )
})
```

3. **App-like Features:**
- ✅ Installable to home screen
- ✅ Full-screen mode (no browser UI)
- ✅ Offline fallback
- ✅ Push notifications (coming soon)
- ✅ Background sync (coming soon)

**Installation Flow:**
```
iOS:
1. Open in Safari
2. Tap Share button
3. "Add to Home Screen"
4. App appears on home screen

Android:
1. Open in Chrome
2. "Add to Home Screen" prompt appears
3. Tap "Install"
4. App appears in app drawer
```

---

## 🔐 SECURITY ARCHITECTURE

### **1. Authentication Security**

**JWT Token Management:**
```typescript
// Supabase client handles token refresh automatically
const supabase = createClient()

// Token stored in localStorage
// Automatically sent with every request
// Refreshed before expiration

// Server validates token on every request
const user = await supabase.auth.getUser()
```

**Password Security:**
- Passwords hashed with bcrypt
- Minimum length: 6 characters
- Stored securely by Supabase (never in our code)

### **2. Row Level Security (RLS)**

**Security at Database Level:**
```sql
-- Every query automatically filtered by user
SELECT * FROM sessions
-- Becomes:
SELECT * FROM sessions WHERE <RLS_POLICY>
```

**Benefits:**
- Can't bypass from frontend
- Works even if someone steals API key
- Centralized security logic

### **3. API Security**

**Supabase Anon Key:**
- Public key (safe to expose in frontend)
- Rate-limited by Supabase
- Only works with RLS policies enabled

**Environment Variables:**
- API keys never in Git (`.gitignore`)
- Stored in Vercel/local `.env.local`
- Different keys for dev/production

### **4. Input Validation**

**Client-side:**
```typescript
// Form validation
const validateSession = (data) => {
  if (!data.sport) throw new Error('Sport required')
  if (data.max_participants < 2) throw new Error('Min 2 participants')
  if (new Date(data.date) < new Date()) throw new Error('Date must be future')
}
```

**Server-side:**
```sql
-- Database constraints
ALTER TABLE sessions
ADD CONSTRAINT max_participants_check
CHECK (max_participants >= 2 AND max_participants <= 50);
```

### **5. HTTPS/SSL**

- ✅ Vercel provides automatic HTTPS
- ✅ All API requests encrypted
- ✅ WebSocket connections encrypted (wss://)

---

## 🚀 PERFORMANCE OPTIMIZATIONS

### **1. Code Splitting**

Next.js automatically splits code by route:
```
/          → home.js (50 KB)
/session/1 → session-detail.js (30 KB)
/profile   → profile.js (25 KB)

Total downloaded: Only what user visits
```

### **2. Image Optimization**

```tsx
import Image from 'next/image'

<Image
  src="/avatar.jpg"
  width={100}
  height={100}
  alt="User avatar"
  // Next.js automatically:
  // - Resizes for device
  // - Converts to WebP
  // - Lazy loads
  // - Adds blur placeholder
/>
```

### **3. Server-Side Rendering (SSR)**

```tsx
// Server Component (default)
async function SessionList() {
  // Fetches on server, sends HTML to client
  const sessions = await supabase.from('sessions').select()
  return <div>{sessions.map(...)}</div>
}
```

**Benefits:**
- Faster initial page load
- SEO-friendly (bots see content)
- No loading spinners

### **4. Database Indexes**

```sql
-- Speed up common queries
CREATE INDEX sessions_date_sport_idx 
ON sessions(date, sport);

-- Query now uses index:
SELECT * FROM sessions 
WHERE date = '2024-11-05' AND sport = 'Basketball'
-- Goes from 1000ms → 10ms
```

### **5. Caching Strategy**

**Static Pages:**
```typescript
// Cached at CDN edge (Vercel)
export const revalidate = 60 // Revalidate every 60 seconds
```

**Dynamic Data:**
```typescript
// Client-side caching with SWR
import useSWR from 'swr'

const { data } = useSWR('/api/sessions', fetcher, {
  revalidateOnFocus: false,
  dedupingInterval: 5000 // Don't refetch within 5 seconds
})
```

---

## 📊 MONITORING & ANALYTICS (Future)

### **Planned Integrations:**

1. **Vercel Analytics:**
   - Page load times
   - Core Web Vitals
   - User geography

2. **Supabase Studio:**
   - Database query performance
   - Table sizes
   - Active connections

3. **Sentry (Error Tracking):**
   - JavaScript errors
   - Stack traces
   - User context

4. **PostHog (Product Analytics):**
   - User behavior
   - Feature usage
   - Conversion funnels

---

## 🧪 TESTING STRATEGY (Not Implemented Yet)

### **Planned:**

1. **Unit Tests (Jest + React Testing Library):**
   ```typescript
   test('Session card displays correct info', () => {
     render(<SessionCard session={mockSession} />)
     expect(screen.getByText('Basketball')).toBeInTheDocument()
   })
   ```

2. **Integration Tests (Playwright):**
   ```typescript
   test('User can create session', async ({ page }) => {
     await page.goto('/create')
     await page.fill('[name="sport"]', 'Basketball')
     await page.click('button[type="submit"]')
     await expect(page).toHaveURL('/sessions')
   })
   ```

3. **Database Tests:**
   ```sql
   -- Test RLS policies
   SET ROLE authenticated;
   SET request.jwt.claim.sub = 'user-id';
   SELECT * FROM sessions; -- Should only see allowed rows
   ```

---

## 📦 DEPENDENCIES

### **Core Dependencies:**

```json
{
  "dependencies": {
    "next": "15.0.2",                    // React framework
    "react": "19.0.0",                   // UI library
    "react-dom": "19.0.0",               // React DOM renderer
    
    "@supabase/ssr": "^0.5.2",           // Supabase SSR helpers
    "@supabase/supabase-js": "^2.46.1",  // Supabase client
    
    "next-intl": "^3.23.5",              // Internationalization
    
    "lucide-react": "^0.454.0",          // Icons
    
    "date-fns": "^4.1.0",                // Date formatting
    
    "tailwindcss": "^3.4.14",            // CSS framework
    "postcss": "^8.4.47",                // CSS processor
    "autoprefixer": "^10.4.20"           // CSS prefixing
  },
  "devDependencies": {
    "typescript": "^5",                  // Type checking
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    
    "eslint": "^8",                      // Linting
    "eslint-config-next": "15.0.2"
  }
}
```

**Total Bundle Size (Gzipped):**
- JavaScript: ~120 KB
- CSS: ~15 KB
- Total: ~135 KB (very lightweight!)

---

## 🔄 DATA FLOW EXAMPLE

### **Creating a Session:**

```
1. USER ACTION:
   User fills out "Create Session" form
   ↓
2. CLIENT VALIDATION:
   TypeScript validates form data
   ↓
3. SUPABASE CLIENT:
   await supabase.from('sessions').insert({
     creator_id: user.id,
     sport: 'Basketball',
     date: '2024-11-05',
     ...
   })
   ↓
4. POSTGRES:
   INSERT INTO sessions (...) VALUES (...)
   ↓
5. RLS CHECK:
   - User authenticated? ✓
   - User allowed to create? ✓
   ↓
6. DATABASE:
   Row inserted, ID generated
   ↓
7. REALTIME:
   Supabase broadcasts INSERT event via WebSocket
   ↓
8. ALL CONNECTED CLIENTS:
   Receive new session, update UI automatically
   ↓
9. RESPONSE TO CREATOR:
   Success! Navigate to /sessions
```

### **Joining a Session:**

```
1. USER CLICKS "JOIN":
   ↓
2. INSERT INTO session_participants:
   await supabase.from('session_participants').insert({
     session_id: sessionId,
     user_id: userId,
     status: 'pending'
   })
   ↓
3. RLS CHECK:
   - User not already joined? ✓
   - Session not full? ✓
   ↓
4. UPDATE session.current_participants:
   UPDATE sessions 
   SET current_participants = current_participants + 1
   WHERE id = sessionId
   ↓
5. REALTIME BROADCAST:
   All users viewing that session see count update
   ↓
6. CREATOR NOTIFICATION:
   "John Doe wants to join your Basketball session"
```

---

## 🎯 SCALING CONSIDERATIONS

### **Current Architecture:**
- ✅ Handles 100-1,000 users easily
- ✅ Supabase free tier sufficient
- ✅ Vercel free tier sufficient

### **When to Scale (>10,000 users):**

1. **Database:**
   - Move to Supabase Pro ($25/month)
   - Add read replicas
   - Optimize slow queries

2. **Hosting:**
   - Vercel Pro ($20/month)
   - More bandwidth
   - More edge functions

3. **Realtime:**
   - Supabase broadcasts scale automatically
   - May need dedicated Realtime server

4. **File Storage:**
   - Consider CDN (Cloudflare, AWS CloudFront)
   - Image optimization service (Cloudinary)

### **Architectural Changes Needed:**

**At 10k users:**
- Add caching layer (Redis)
- Implement job queues
- Add monitoring/alerting

**At 100k users:**
- Microservices architecture
- Dedicated database
- Load balancers

**At 1M+ users:**
- Multi-region deployment
- Sharded databases
- Advanced caching strategies

---

## 🛠️ DEVELOPMENT WORKFLOW

### **Local Development:**

```bash
# 1. Clone repo
git clone https://github.com/yourusername/tribe-v3.git
cd tribe-v3

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.local.example .env.local
# Add Supabase URL and Key

# 4. Run development server
npm run dev
# App runs at http://localhost:3000

# 5. Make changes
# - Edit files in app/, components/, lib/
# - Hot reload updates automatically

# 6. Commit and push
git add .
git commit -m "feat: add new feature"
git push origin main

# 7. Vercel automatically deploys
# Check https://tribe-v3.vercel.app
```

### **Database Migrations:**

```bash
# 1. Make changes in Supabase Studio
# 2. Export SQL from Supabase
# 3. Save to supabase/migrations/
# 4. Commit to Git
# 5. Apply to production via Supabase CLI
```

---

## 🎓 KEY TECHNICAL DECISIONS & RATIONALE

### **Why Next.js instead of Vite/CRA?**
- SSR for SEO (important for growth)
- File-based routing (simpler than React Router)
- Built-in optimizations
- Vercel deployment integration

### **Why Supabase instead of Firebase?**
- Open-source (can self-host)
- PostgreSQL (more powerful than Firestore)
- Real SQL (not limited NoSQL queries)
- Row Level Security (better security model)
- Cheaper at scale

### **Why TypeScript instead of JavaScript?**
- Catch bugs before runtime
- Better IDE experience
- Self-documenting code
- Industry standard for serious apps

### **Why Tailwind instead of styled-components/CSS Modules?**
- Faster development (no context-switching)
- Smaller bundle size (purges unused CSS)
- Consistent design system
- Better mobile responsiveness

### **Why PWA instead of React Native?**
- ✅ One codebase for web + mobile
- ✅ Instant updates (no app store approval)
- ✅ Lower development cost
- ✅ Faster iteration
- ❌ Native apps can come later if validated

---

## 📚 RESOURCES FOR DEEPER LEARNING

**Next.js:**
- Docs: https://nextjs.org/docs
- Learn: https://nextjs.org/learn

**Supabase:**
- Docs: https://supabase.com/docs
- RLS Guide: https://supabase.com/docs/guides/auth/row-level-security

**TypeScript:**
- Handbook: https://www.typescriptlang.org/docs/handbook/

**Tailwind:**
- Docs: https://tailwindcss.com/docs

**PWA:**
- Guide: https://web.dev/progressive-web-apps/

---

## 🎯 SUMMARY FOR OTHER ENGINEERS

**"Tribe v3 is a full-stack TypeScript application built with Next.js 15 and Supabase. It uses server-side rendering for performance, PostgreSQL with Row Level Security for data protection, and WebSockets for real-time features. The frontend is a Progressive Web App deployable to iOS/Android without native code. Everything is type-safe with TypeScript and styled with Tailwind CSS. The entire stack is serverless - hosted on Vercel (frontend) and Supabase (backend), with automatic scaling and global CDN distribution."**

**Key differentiators:**
- Real-time collaboration (WebSockets)
- Bilingual from day one (i18n)
- Security-first (RLS)
- Mobile-first (PWA)
- Type-safe (TypeScript)
- Serverless (zero ops)

