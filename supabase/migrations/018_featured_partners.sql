-- Featured Partners: monetization feature for priority placement and enhanced storefronts
-- Migration 018

CREATE TABLE IF NOT EXISTS featured_partners (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  business_name TEXT NOT NULL,
  business_type TEXT DEFAULT 'studio' CHECK (business_type IN ('studio', 'gym', 'academy', 'club', 'independent')),
  description TEXT,
  description_es TEXT,
  logo_url TEXT,
  banner_url TEXT,
  website_url TEXT,
  phone TEXT,
  address TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  specialties TEXT[] DEFAULT '{}',
  tier TEXT DEFAULT 'standard' CHECK (tier IN ('standard', 'premium', 'elite')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'expired')),
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  monthly_fee_cents INT DEFAULT 0,
  currency TEXT DEFAULT 'COP',
  -- Metrics
  total_impressions INT DEFAULT 0,
  total_clicks INT DEFAULT 0,
  total_bookings INT DEFAULT 0,
  -- Requirements
  min_sessions_per_month INT DEFAULT 4,
  min_rating NUMERIC(2,1) DEFAULT 4.0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE featured_partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active partners" ON featured_partners
  FOR SELECT USING (status = 'active');
CREATE POLICY "Partners manage own record" ON featured_partners
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins manage all" ON featured_partners
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );

-- Partner instructors: studios can have multiple instructors
CREATE TABLE IF NOT EXISTS partner_instructors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  partner_id UUID REFERENCES featured_partners(id) ON DELETE CASCADE,
  instructor_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'instructor',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(partner_id, instructor_id)
);

ALTER TABLE partner_instructors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read active" ON partner_instructors FOR SELECT USING (is_active = true);
CREATE POLICY "Partners manage own instructors" ON partner_instructors FOR ALL USING (
  EXISTS (SELECT 1 FROM featured_partners WHERE id = partner_id AND user_id = auth.uid())
);
