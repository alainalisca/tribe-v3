-- Migration 016: Replace strava_routes with curated popular_routes table
-- Removes dependency on Strava API; seeds Medellín running/cycling/hiking routes

CREATE TABLE IF NOT EXISTS popular_routes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  sport_type TEXT NOT NULL CHECK (sport_type IN ('running', 'cycling', 'hiking')),
  distance_km NUMERIC(5,1) NOT NULL,
  elevation_gain_m INT DEFAULT 0,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'moderate', 'hard')),
  start_lat DOUBLE PRECISION NOT NULL,
  start_lng DOUBLE PRECISION NOT NULL,
  description_en TEXT,
  description_es TEXT,
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  submitted_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE popular_routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read routes" ON popular_routes FOR SELECT USING (true);
CREATE POLICY "Admins can manage routes" ON popular_routes FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
);

-- Seed 15 Medellín routes
INSERT INTO popular_routes (name, sport_type, distance_km, elevation_gain_m, difficulty, start_lat, start_lng, description_en, description_es) VALUES
('Ciclovía Dominical', 'cycling', 25.0, 50, 'easy', 6.2518, -75.5636, 'Sunday car-free cycling route through the city. Flat, family-friendly, with water stations.', 'Ruta ciclística dominical libre de carros. Plana, familiar, con estaciones de hidratación.'),
('Río Medellín Trail', 'running', 8.5, 30, 'easy', 6.2442, -75.5812, 'Flat riverside path along the Medellín River. Great for easy runs and cycling.', 'Sendero plano a lo largo del Río Medellín. Ideal para trotes suaves y ciclismo.'),
('Cerro El Volador Loop', 'running', 5.2, 180, 'moderate', 6.2630, -75.5920, 'Hill loop with panoramic city views. Popular morning trail run.', 'Circuito en cerro con vistas panorámicas de la ciudad. Popular para correr en la mañana.'),
('Parque Arví - Sendero de la Naturaleza', 'hiking', 12.0, 450, 'hard', 6.2850, -75.5010, 'Mountain trails through cloud forest. Take the Metrocable to get there.', 'Senderos de montaña por bosque de niebla. Llega en Metrocable.'),
('La Strada Cycling Route', 'cycling', 35.0, 800, 'hard', 6.2100, -75.5700, 'Classic Medellín climb through La Strada. Challenging elevation with stunning views.', 'Clásica subida de Medellín por La Strada. Elevación desafiante con vistas impresionantes.'),
('Cerro Nutibara Loop', 'running', 3.0, 80, 'easy', 6.2370, -75.5780, 'Short loop around the iconic Pueblito Paisa hill. Perfect for beginners.', 'Circuito corto alrededor del icónico Pueblito Paisa. Perfecto para principiantes.'),
('Las Palmas Climb', 'cycling', 18.0, 650, 'hard', 6.2050, -75.5550, 'The famous Las Palmas climb. A rite of passage for Medellín cyclists.', 'La famosa subida de Las Palmas. Un rito de paso para ciclistas de Medellín.'),
('Estadio to Laureles Riverside', 'running', 6.0, 20, 'easy', 6.2560, -75.5900, 'Flat path from the stadium through Laureles along the river. Shaded and scenic.', 'Sendero plano del estadio por Laureles a lo largo del río. Sombreado y escénico.'),
('Avenida El Poblado Running Path', 'running', 4.5, 40, 'easy', 6.2100, -75.5680, 'Popular urban running path along Avenida El Poblado with wide sidewalks.', 'Ruta urbana popular a lo largo de la Avenida El Poblado con andenes amplios.'),
('Parque Lleras to Parque El Poblado', 'running', 3.2, 30, 'easy', 6.2090, -75.5700, 'Short urban loop connecting two popular parks in El Poblado.', 'Circuito urbano corto conectando dos parques populares en El Poblado.'),
('UPB Campus Circuit', 'running', 2.8, 15, 'easy', 6.2460, -75.5890, 'University campus loop with flat paths and green surroundings.', 'Circuito del campus universitario con senderos planos y entorno verde.'),
('Envigado Riverside Trail', 'running', 7.0, 60, 'moderate', 6.1750, -75.5830, 'Trail along La Ayurá creek through Envigado. Mix of paved and natural paths.', 'Sendero a lo largo de la quebrada La Ayurá por Envigado. Mezcla de pavimento y naturaleza.'),
('La Catedral Hill Climb', 'cycling', 15.0, 550, 'hard', 6.1900, -75.5600, 'Steep climb to La Catedral with challenging gradients and mountain air.', 'Subida empinada a La Catedral con pendientes desafiantes y aire de montaña.'),
('Sabaneta Greenway', 'cycling', 10.0, 80, 'easy', 6.1510, -75.6170, 'Flat greenway through Sabaneta. Perfect for casual cycling and families.', 'Ciclovía plana por Sabaneta. Perfecta para ciclismo casual y familias.'),
('Parques del Río Path', 'running', 4.0, 10, 'easy', 6.2500, -75.5750, 'Modern riverside park path along the Medellín River. Flat with art installations.', 'Sendero del parque moderno a lo largo del Río Medellín. Plano con instalaciones de arte.');
