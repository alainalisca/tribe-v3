-- Migration 021: Local Fitness Events
-- Curated directory of real recurring and one-time fitness events in Medellín

CREATE TABLE IF NOT EXISTS local_fitness_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description_en TEXT,
  description_es TEXT,
  sport_type TEXT NOT NULL, -- running, cycling, hiking, yoga, crossfit, calisthenics, swimming, multi-sport
  event_type TEXT NOT NULL DEFAULT 'recurring', -- recurring, one-time, series
  location_name TEXT NOT NULL,
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  address TEXT,
  start_date DATE, -- null for recurring events like Ciclovía
  end_date DATE,
  recurrence_pattern TEXT, -- weekly, monthly, yearly, null for one-time
  recurrence_day TEXT, -- 'sunday', 'saturday', etc.
  start_time TIME,
  end_time TIME,
  organizer TEXT, -- INDER, parkrun, community, etc.
  website_url TEXT,
  is_free BOOLEAN DEFAULT true,
  price_info TEXT, -- "Free" / "$50,000 COP registration"
  difficulty TEXT DEFAULT 'all', -- easy, moderate, hard, all
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE local_fitness_events ENABLE ROW LEVEL SECURITY;

-- Anyone can read active events
CREATE POLICY "Anyone can read active events" ON local_fitness_events
  FOR SELECT USING (is_active = true);

-- Admins can manage all events
CREATE POLICY "Admins can manage events" ON local_fitness_events
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );

-- Index for common queries
CREATE INDEX idx_local_fitness_events_sport_type ON local_fitness_events(sport_type);
CREATE INDEX idx_local_fitness_events_is_active ON local_fitness_events(is_active);

-- =============================================================================
-- Seed: 20 real Medellín fitness events
-- =============================================================================

INSERT INTO local_fitness_events (name, description_en, description_es, sport_type, event_type, location_name, location_lat, location_lng, address, start_date, end_date, recurrence_pattern, recurrence_day, start_time, end_time, organizer, website_url, is_free, price_info, difficulty, is_active) VALUES

-- 1. Ciclovía Dominical
('Ciclovía Dominical',
 'Every Sunday, major roads are closed to cars and opened for cyclists, runners, skaters, and pedestrians. Over 30 km of routes across the city.',
 'Cada domingo, las vías principales se cierran al tráfico vehicular y se abren para ciclistas, corredores, patinadores y peatones. Más de 30 km de rutas por la ciudad.',
 'cycling', 'recurring', 'Avenida El Poblado / Avenida Las Vegas', 6.2088, -75.5713,
 'Multiple routes across Medellín', NULL, NULL, 'weekly', 'sunday',
 '07:00', '13:00', 'INDER Medellín', 'https://www.inder.gov.co', true, 'Free / Gratis', 'all', true),

-- 2. parkrun Medellín
('parkrun Medellín',
 'Free, weekly, timed 5K run every Saturday morning. All paces welcome — walk, jog, or run. Part of the global parkrun movement.',
 'Carrera gratuita de 5K cronometrada cada sábado por la mañana. Todos los ritmos son bienvenidos — caminar, trotar o correr. Parte del movimiento global parkrun.',
 'running', 'recurring', 'Parque de El Poblado', 6.2076, -75.5658,
 'Parque de El Poblado, Carrera 43A, El Poblado', NULL, NULL, 'weekly', 'saturday',
 '07:00', '08:00', 'parkrun Colombia', 'https://www.parkrun.com.co/elpoblado/', true, 'Free / Gratis', 'all', true),

-- 3. INDER Aeróbicos al Parque
('INDER Aeróbicos al Parque',
 'Free outdoor group aerobics classes in parks across Medellín. High-energy sessions led by certified INDER instructors.',
 'Clases gratuitas de aeróbicos grupales al aire libre en parques de Medellín. Sesiones de alta energía dirigidas por instructores certificados del INDER.',
 'multi-sport', 'recurring', 'Various Parks / Varios Parques', 6.2518, -75.5636,
 'Parque de los Deseos, Parque Juanes de la Paz, and others', NULL, NULL, 'weekly', 'saturday',
 '08:00', '09:30', 'INDER Medellín', 'https://www.inder.gov.co', true, 'Free / Gratis', 'all', true),

-- 4. INDER Yoga en el Parque
('INDER Yoga en el Parque',
 'Free outdoor yoga sessions at Parque de los Deseos. Open to all levels. Bring your own mat.',
 'Sesiones gratuitas de yoga al aire libre en el Parque de los Deseos. Abierto a todos los niveles. Trae tu propio tapete.',
 'yoga', 'recurring', 'Parque de los Deseos', 6.2710, -75.5662,
 'Parque de los Deseos, Calle 71 #73-20, Aranjuez', NULL, NULL, 'weekly', 'saturday',
 '08:00', '09:30', 'INDER Medellín', 'https://www.inder.gov.co', true, 'Free / Gratis', 'easy', true),

-- 5. Medellín Runners Club
('Medellín Runners Club',
 'Weekly group runs through the city. Multiple pace groups available. Routes vary each week. Tuesdays and Thursdays at 6 PM.',
 'Carreras grupales semanales por la ciudad. Múltiples grupos de ritmo disponibles. Las rutas varían cada semana. Martes y jueves a las 6 PM.',
 'running', 'recurring', 'Parque del Poblado', 6.2076, -75.5658,
 'Meeting point: Parque del Poblado, El Poblado', NULL, NULL, 'weekly', 'tuesday',
 '18:00', '19:30', 'Medellín Runners', 'https://www.instagram.com/medellinrunners/', true, 'Free / Gratis', 'moderate', true),

-- 6. Ciclovía Nocturna
('Ciclovía Nocturna',
 'Monthly night cycling event on the last Friday of each month. Routes illuminated with lights and music. A unique Medellín experience.',
 'Evento mensual de ciclismo nocturno el último viernes de cada mes. Rutas iluminadas con luces y música. Una experiencia única en Medellín.',
 'cycling', 'recurring', 'Centro de Medellín', 6.2442, -75.5812,
 'Starts at Parque de las Luces, Centro', NULL, NULL, 'monthly', 'friday',
 '19:00', '23:00', 'Alcaldía de Medellín', 'https://www.medellin.gov.co', true, 'Free / Gratis', 'all', true),

-- 7. Cerro El Volador Hike
('Cerro El Volador Hike',
 'Weekly guided hike to the summit of Cerro El Volador, Medellín''s iconic urban hill. Great views of the Aburrá Valley. Community organized.',
 'Caminata guiada semanal a la cima del Cerro El Volador, el icónico cerro urbano de Medellín. Excelentes vistas del Valle de Aburrá. Organizada por la comunidad.',
 'hiking', 'recurring', 'Cerro El Volador', 6.2655, -75.5906,
 'Entrance: Carrera 65 con Calle 50, near Universidad Nacional', NULL, NULL, 'weekly', 'saturday',
 '07:00', '09:00', 'Community / Comunidad', NULL, true, 'Free / Gratis', 'moderate', true),

-- 8. CrossFit BullBox Open Session
('CrossFit BullBox Open Session',
 'Monthly free intro session at CrossFit BullBox in Ciudad del Río. Perfect for beginners curious about CrossFit. Equipment provided.',
 'Sesión introductoria gratuita mensual en CrossFit BullBox en Ciudad del Río. Perfecta para principiantes curiosos sobre CrossFit. Equipamiento incluido.',
 'crossfit', 'recurring', 'CrossFit BullBox Ciudad del Río', 6.2268, -75.5721,
 'Calle 19 #43G-50, Ciudad del Río', NULL, NULL, 'monthly', 'saturday',
 '09:00', '10:30', 'CrossFit BullBox', 'https://www.instagram.com/crossfitbullbox/', true, 'Free / Gratis', 'all', true),

-- 9. Calisthenics Medellín Meetup
('Calisthenics Medellín Meetup',
 'Free outdoor calisthenics training at Parque Lineal. All levels welcome. Learn bodyweight exercises from experienced practitioners.',
 'Entrenamiento gratuito de calistenia al aire libre en el Parque Lineal. Todos los niveles son bienvenidos. Aprende ejercicios con peso corporal de practicantes experimentados.',
 'calisthenics', 'recurring', 'Parque Lineal La Presidenta', 6.2031, -75.5665,
 'Parque Lineal La Presidenta, El Poblado', NULL, NULL, 'weekly', 'saturday',
 '09:00', '11:00', 'Calisthenics Medellín', 'https://www.instagram.com/calisthenics_medellin/', true, 'Free / Gratis', 'all', true),

-- 10. Swim Club Atanasio Girardot
('Swim Club Atanasio Girardot',
 'Weekly lap swimming group at the Complejo Acuático Atanasio Girardot. Open to intermediate and advanced swimmers. Pool entry fee applies.',
 'Grupo semanal de natación por carriles en el Complejo Acuático Atanasio Girardot. Abierto a nadadores intermedios y avanzados. Aplica tarifa de entrada a la piscina.',
 'swimming', 'recurring', 'Complejo Acuático Atanasio Girardot', 6.2566, -75.5877,
 'Unidad Deportiva Atanasio Girardot, Calle 48 #73-10', NULL, NULL, 'weekly', 'tuesday',
 '06:00', '07:30', 'Community / Comunidad', NULL, false, '$5,000 COP pool entry / Entrada piscina', 'moderate', true),

-- 11. Ruta de la Montaña Trail Run
('Ruta de la Montaña Trail Run',
 'Monthly trail running event in the mountains surrounding Medellín. Various distances from 5K to 21K. Routes change monthly.',
 'Evento mensual de trail running en las montañas que rodean Medellín. Varias distancias desde 5K hasta 21K. Las rutas cambian mensualmente.',
 'running', 'recurring', 'Various Mountain Trails', 6.2900, -75.5500,
 'Meeting points vary — check social media for each month', NULL, NULL, 'monthly', 'sunday',
 '06:00', '11:00', 'Ruta de la Montaña', 'https://www.instagram.com/rutadelamontana/', true, 'Free / Gratis', 'hard', true),

-- 12. Bici-Café Ride
('Bici-Café Ride',
 'Weekend cycling + coffee group ride. Ride together to a different café each week. Relaxed pace, social atmosphere. 30-50 km routes.',
 'Rodada grupal de ciclismo + café los fines de semana. Pedaleamos juntos a un café diferente cada semana. Ritmo relajado, ambiente social. Rutas de 30-50 km.',
 'cycling', 'recurring', 'Parque Lleras', 6.2085, -75.5674,
 'Start: Parque Lleras, El Poblado', NULL, NULL, 'weekly', 'saturday',
 '06:30', '10:00', 'Bici-Café Medellín', 'https://www.instagram.com/bicicafemedellin/', true, 'Free ride / Coffee at your own expense', 'moderate', true),

-- 13. Yoga Medellín (Parque Arví)
('Yoga Medellín (Parque Arví)',
 'Monthly outdoor yoga session in Parque Arví ecological park. Connect with nature while practicing yoga. Bring your own mat and water.',
 'Sesión mensual de yoga al aire libre en el Parque Arví. Conéctate con la naturaleza mientras practicas yoga. Trae tu propio tapete y agua.',
 'yoga', 'recurring', 'Parque Arví', 6.2812, -75.5037,
 'Parque Arví, Santa Elena', NULL, NULL, 'monthly', 'sunday',
 '09:00', '10:30', 'Yoga Medellín', 'https://www.instagram.com/yogamedellin/', true, 'Free / Gratis (Metrocable ticket required)', 'easy', true),

-- 14. Bootcamp El Poblado
('Bootcamp El Poblado',
 'Weekly free bootcamp workout at Parque El Poblado. High-intensity circuit training combining cardio and strength. All fitness levels.',
 'Entrenamiento gratuito semanal de bootcamp en el Parque El Poblado. Circuito de alta intensidad combinando cardio y fuerza. Todos los niveles de fitness.',
 'multi-sport', 'recurring', 'Parque El Poblado', 6.2076, -75.5658,
 'Parque El Poblado, Carrera 43A, El Poblado', NULL, NULL, 'weekly', 'wednesday',
 '06:00', '07:00', 'Community / Comunidad', NULL, true, 'Free / Gratis', 'hard', true),

-- 15. INDER Natación Recreativa
('INDER Natación Recreativa',
 'Free recreational swimming at INDER public pools across the city. Multiple locations and schedules available. Open to all ages.',
 'Natación recreativa gratuita en las piscinas públicas del INDER en toda la ciudad. Múltiples ubicaciones y horarios disponibles. Abierto a todas las edades.',
 'swimming', 'recurring', 'INDER Public Pools', 6.2566, -75.5877,
 'Unidad Deportiva Atanasio Girardot and satellite pools', NULL, NULL, 'weekly', 'saturday',
 '08:00', '12:00', 'INDER Medellín', 'https://www.inder.gov.co', true, 'Free / Gratis', 'all', true),

-- 16. Medellín Marathon (Annual)
('Maratón de Medellín',
 'Annual city marathon through the streets of Medellín. Distances: 5K, 10K, 21K half marathon, and full 42K marathon. Registration required.',
 'Maratón anual por las calles de Medellín. Distancias: 5K, 10K, 21K media maratón y 42K maratón completa. Inscripción requerida.',
 'running', 'one-time', 'Centro de Medellín', 6.2442, -75.5812,
 'Start/Finish: Alpujarra Administrative Center', '2026-10-18', '2026-10-18', 'yearly', NULL,
 '05:30', '12:00', 'Maratón de las Flores', 'https://www.maratonmedellin.com', false, '$80,000-$180,000 COP depending on distance', 'hard', true),

-- 17. Carrera de la Mujer
('Carrera de la Mujer',
 'Annual women''s race celebrating International Women''s Day. Various distances: 5K and 10K. Open to women of all ages and fitness levels.',
 'Carrera anual de mujeres celebrando el Día Internacional de la Mujer. Varias distancias: 5K y 10K. Abierta a mujeres de todas las edades y niveles de fitness.',
 'running', 'one-time', 'Parque de los Pies Descalzos', 6.2530, -75.5745,
 'Start: Parque de los Pies Descalzos, Centro', '2027-03-08', '2027-03-08', 'yearly', NULL,
 '07:00', '11:00', 'Liga de Atletismo de Antioquia', 'https://www.instagram.com/carreradelamujer_med/', false, '$50,000 COP registration', 'all', true),

-- 18. Night Running Medellín
('Night Running Medellín',
 'Weekly evening running group. Well-lit routes through the city. Safety in numbers. 5-8 km at a moderate pace. Headlamps recommended.',
 'Grupo semanal de running nocturno. Rutas bien iluminadas por la ciudad. Seguridad en grupo. 5-8 km a ritmo moderado. Se recomiendan linternas frontales.',
 'running', 'recurring', 'Estadio Atanasio Girardot', 6.2566, -75.5877,
 'Meeting point: Main entrance, Estadio Atanasio Girardot', NULL, NULL, 'weekly', 'wednesday',
 '19:00', '20:30', 'Night Running MDE', 'https://www.instagram.com/nightrunningmde/', true, 'Free / Gratis', 'moderate', true),

-- 19. Parkour Medellín
('Parkour Medellín',
 'Weekly parkour training at Parque de los Pies Descalzos. Learn movement skills, vaults, and flow. All levels from beginner to advanced.',
 'Entrenamiento semanal de parkour en el Parque de los Pies Descalzos. Aprende habilidades de movimiento, saltos y flujo. Todos los niveles, de principiante a avanzado.',
 'multi-sport', 'recurring', 'Parque de los Pies Descalzos', 6.2530, -75.5745,
 'Parque de los Pies Descalzos, Plaza Mayor area', NULL, NULL, 'weekly', 'sunday',
 '10:00', '12:00', 'Parkour Medellín', 'https://www.instagram.com/parkourmedellin/', true, 'Free / Gratis', 'moderate', true),

-- 20. Skateboarding Medellín
('Skateboarding Medellín',
 'Weekly skateboarding meetup at the Estadio skatepark. Sessions for all levels. Bring your own board. Helmets recommended.',
 'Encuentro semanal de skateboarding en el skatepark del Estadio. Sesiones para todos los niveles. Trae tu propia tabla. Se recomienda casco.',
 'multi-sport', 'recurring', 'Skatepark Estadio', 6.2553, -75.5890,
 'Skatepark Unidad Deportiva Atanasio Girardot', NULL, NULL, 'weekly', 'saturday',
 '15:00', '18:00', 'Skateboarding Medellín', 'https://www.instagram.com/skateboardingmedellin/', true, 'Free / Gratis', 'all', true);
