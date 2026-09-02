
CREATE TABLE public.routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#1d4ed8',
  path jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
); 
GRANT SELECT ON public.routes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.routes TO authenticated;
GRANT ALL ON public.routes TO service_role;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "routes public read" ON public.routes FOR SELECT USING (true);

CREATE TABLE public.bus_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid REFERENCES public.routes(id) ON DELETE CASCADE,
  name text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  sequence integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bus_stops TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bus_stops TO authenticated;
GRANT ALL ON public.bus_stops TO service_role;
ALTER TABLE public.bus_stops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bus_stops public read" ON public.bus_stops FOR SELECT USING (true);

CREATE TABLE public.buses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_number text NOT NULL UNIQUE,
  registration text,
  capacity integer NOT NULL DEFAULT 40,
  route_id uuid REFERENCES public.routes(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.buses TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.buses TO authenticated;
GRANT ALL ON public.buses TO service_role;
ALTER TABLE public.buses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "buses public read" ON public.buses FOR SELECT USING (true);

CREATE TABLE public.trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_id uuid NOT NULL REFERENCES public.buses(id) ON DELETE CASCADE,
  route_id uuid REFERENCES public.routes(id) ON DELETE SET NULL,
  driver_name text,
  status text NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE UNIQUE INDEX trips_one_active_per_bus ON public.trips (bus_id) WHERE status = 'active';
CREATE INDEX trips_status_idx ON public.trips (status);
GRANT SELECT, INSERT, UPDATE ON public.trips TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trips TO authenticated;
GRANT ALL ON public.trips TO service_role;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trips public read" ON public.trips FOR SELECT USING (true);
CREATE POLICY "trips public insert" ON public.trips FOR INSERT WITH CHECK (true);
CREATE POLICY "trips public update" ON public.trips FOR UPDATE USING (true) WITH CHECK (true);

CREATE TABLE public.live_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_id uuid NOT NULL REFERENCES public.buses(id) ON DELETE CASCADE,
  trip_id uuid REFERENCES public.trips(id) ON DELETE CASCADE,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  accuracy double precision,
  speed double precision,
  heading double precision,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX live_locations_bus_time_idx ON public.live_locations (bus_id, recorded_at DESC);
GRANT SELECT, INSERT ON public.live_locations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_locations TO authenticated;
GRANT ALL ON public.live_locations TO service_role;
ALTER TABLE public.live_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "live_locations public read" ON public.live_locations FOR SELECT USING (true);
CREATE POLICY "live_locations public insert" ON public.live_locations FOR INSERT WITH CHECK (true);

ALTER TABLE public.live_locations REPLICA IDENTITY FULL;
ALTER TABLE public.trips REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_locations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trips;

INSERT INTO public.routes (id, code, name, color, path) VALUES
 ('11111111-1111-4111-8111-111111111111','R1','CBS - Nashik Road Station','#1d4ed8','[[19.9975,73.7898],[19.9865,73.7975],[19.9720,73.8090],[19.9560,73.8290],[19.9480,73.8420]]'),
 ('22222222-2222-4222-8222-222222222222','R2','Gangapur Road - Panchavati','#059669','[[20.0060,73.7500],[20.0030,73.7680],[20.0000,73.7860],[20.0110,73.7960],[20.0210,73.8020]]'),
 ('33333333-3333-4333-8333-333333333333','R3','Satpur MIDC - CBS','#b45309','[[20.0090,73.7160],[20.0040,73.7390],[19.9990,73.7620],[19.9975,73.7898]]'),
 ('44444444-4444-4444-8444-444444444444','R4','Deolali Camp - Trimbak Naka','#7c3aed','[[19.9450,73.8340],[19.9640,73.8130],[19.9800,73.7990],[19.9950,73.7830],[20.0020,73.7690]]');

INSERT INTO public.bus_stops (route_id, name, lat, lng, sequence) VALUES
 ('11111111-1111-4111-8111-111111111111','Central Bus Stand (CBS)',19.9975,73.7898,1),
 ('11111111-1111-4111-8111-111111111111','Dwarka Circle',19.9865,73.7975,2),
 ('11111111-1111-4111-8111-111111111111','Upnagar',19.9720,73.8090,3),
 ('11111111-1111-4111-8111-111111111111','Nashik Road Station',19.9480,73.8420,4),
 ('22222222-2222-4222-8222-222222222222','Gangapur Gaon',20.0060,73.7500,1),
 ('22222222-2222-4222-8222-222222222222','Ashok Stambh',20.0000,73.7860,2),
 ('22222222-2222-4222-8222-222222222222','Panchavati Karanja',20.0110,73.7960,3),
 ('33333333-3333-4333-8333-333333333333','Satpur MIDC Gate',20.0090,73.7160,1),
 ('33333333-3333-4333-8333-333333333333','Ambad Link Road',20.0040,73.7390,2),
 ('33333333-3333-4333-8333-333333333333','Trimbak Naka',19.9990,73.7620,3),
 ('44444444-4444-4444-8444-444444444444','Deolali Camp',19.9450,73.8340,1),
 ('44444444-4444-4444-8444-444444444444','Nashik City Centre Mall',19.9800,73.7990,2);

INSERT INTO public.buses (bus_number, registration, capacity, route_id) VALUES
 ('NS-01','MH15 AB 1001',42,'11111111-1111-4111-8111-111111111111'),
 ('NS-02','MH15 AB 1002',42,'11111111-1111-4111-8111-111111111111'),
 ('NS-03','MH15 AB 1003',36,'22222222-2222-4222-8222-222222222222'),
 ('NS-04','MH15 AB 1004',36,'33333333-3333-4333-8333-333333333333'),
 ('NS-05','MH15 AB 1005',50,'44444444-4444-4444-8444-444444444444'),
 ('NS-06','MH15 AB 1006',50,'22222222-2222-4222-8222-222222222222');
