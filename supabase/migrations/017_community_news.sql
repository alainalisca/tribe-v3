-- Community News table for Medellín sports/fitness news articles
CREATE TABLE IF NOT EXISTS community_news (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  title_es TEXT,
  summary TEXT NOT NULL,
  summary_es TEXT,
  body_url TEXT NOT NULL,
  image_url TEXT,
  source TEXT NOT NULL,
  category TEXT DEFAULT 'general' CHECK (category IN ('general', 'running', 'cycling', 'fitness', 'events', 'health')),
  published_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE community_news ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read news"
  ON community_news FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage news"
  ON community_news FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );

-- Seed sample articles
INSERT INTO community_news (title, title_es, summary, summary_es, body_url, source, category, published_at) VALUES
(
  'INDER Medellín Opens New Public Fitness Parks',
  'INDER Medellín Abre Nuevos Parques de Fitness Públicos',
  'The city of Medellín has opened three new outdoor fitness parks with free equipment for all residents. Located in Laureles, Belén, and Envigado, the parks feature pull-up bars, parallel bars, and stretching stations.',
  'La ciudad de Medellín ha abierto tres nuevos parques de fitness al aire libre con equipos gratuitos para todos los residentes. Ubicados en Laureles, Belén y Envigado, los parques cuentan con barras de dominadas, barras paralelas y estaciones de estiramiento.',
  'https://www.inder.gov.co/noticias',
  'INDER',
  'fitness',
  now() - interval '1 day'
),
(
  'Ciclovía Dominical: Sunday Cycling Routes Expanded',
  'Ciclovía Dominical: Rutas de Ciclismo Dominical Ampliadas',
  'Medellín expands its popular Sunday Ciclovía with two new routes covering an additional 12 km through the Aburrá Valley. The new routes connect El Poblado to Sabaneta and Laureles to Estadio.',
  'Medellín amplía su popular Ciclovía Dominical con dos nuevas rutas que cubren 12 km adicionales a través del Valle de Aburrá. Las nuevas rutas conectan El Poblado con Sabaneta y Laureles con Estadio.',
  'https://www.medellin.gov.co/ciclovias',
  'INDER',
  'cycling',
  now() - interval '2 days'
),
(
  'Medellín Marathon 2026 Registration Opens',
  'Maratón de Medellín 2026 Abre Inscripciones',
  'Registration is now open for the annual Medellín Marathon. The race features 10K, 21K, and 42K categories with routes through the city''s most scenic neighborhoods. Early bird pricing available until May.',
  'Las inscripciones están abiertas para el Maratón anual de Medellín. La carrera cuenta con categorías de 10K, 21K y 42K con rutas por los barrios más pintorescos de la ciudad. Precios de preventa disponibles hasta mayo.',
  'https://www.maratonmedellin.com',
  'Community',
  'running',
  now() - interval '3 days'
),
(
  'New Calisthenics Parks in El Poblado',
  'Nuevos Parques de Calistenia en El Poblado',
  'El Poblado welcomes two new calisthenics parks designed for bodyweight training. Free community classes are offered every Saturday morning for beginners and intermediate athletes.',
  'El Poblado da la bienvenida a dos nuevos parques de calistenia diseñados para entrenamiento con peso corporal. Se ofrecen clases comunitarias gratuitas todos los sábados por la mañana para atletas principiantes e intermedios.',
  'https://www.inder.gov.co/calistenia',
  'INDER',
  'fitness',
  now() - interval '5 days'
),
(
  'Tribe Community: 500+ Athletes and Growing',
  'Comunidad Tribe: Más de 500 Atletas y Creciendo',
  'Tribe has reached a milestone of over 500 active athletes in Medellín! Thank you for being part of the community. New features including training groups and popular routes are coming soon.',
  'Tribe ha alcanzado un hito de más de 500 atletas activos en Medellín. ¡Gracias por ser parte de la comunidad! Próximamente llegarán nuevas funciones, incluyendo grupos de entrenamiento y rutas populares.',
  'https://tribe.fitness/blog/500-athletes',
  'Tribe',
  'general',
  now() - interval '7 days'
),
(
  'Best Running Routes in the Aburrá Valley',
  'Las Mejores Rutas de Running en el Valle de Aburrá',
  'Discover the top 10 running routes in the Aburrá Valley, from beginner-friendly flat paths along the river to challenging hill climbs in Las Palmas. Includes distance, elevation, and safety tips.',
  'Descubre las 10 mejores rutas de running en el Valle de Aburrá, desde caminos planos para principiantes junto al río hasta desafiantes subidas en Las Palmas. Incluye distancia, elevación y consejos de seguridad.',
  'https://tribe.fitness/blog/best-running-routes',
  'Tribe',
  'running',
  now() - interval '10 days'
);
