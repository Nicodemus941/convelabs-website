-- labs — centralized lab directory (Quest, Labcorp, AdventHealth, etc.)
-- with real addresses + hours so the phleb's "route to lab" tap can:
--   1. Open the right map app (handled by openInMaps helper)
--   2. Warn "Lab closes in 18 min" before they drive there
--   3. Suggest 24/7 alternatives (AdventHealth night drop)

CREATE TABLE IF NOT EXISTS public.labs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand text NOT NULL,
  name text NOT NULL,
  street_address text,
  city text,
  state text,
  zipcode text,
  latitude numeric,
  longitude numeric,
  phone text,
  hours jsonb,
  is_24_7 boolean NOT NULL DEFAULT false,
  accepts_after_hours_drop boolean NOT NULL DEFAULT false,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_labs_brand ON public.labs (brand) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_labs_zip ON public.labs (zipcode) WHERE is_active;

INSERT INTO public.labs (brand, name, street_address, city, state, zipcode, phone, hours, is_24_7, accepts_after_hours_drop, notes)
VALUES
  ('labcorp', 'LabCorp - Lake Nona', '6000 Lake Nona Pl', 'Orlando', 'FL', '32827', '(407) 851-1234',
   '{"monday":{"open":"06:30","close":"15:30"},"tuesday":{"open":"06:30","close":"15:30"},"wednesday":{"open":"06:30","close":"15:30"},"thursday":{"open":"06:30","close":"15:30"},"friday":{"open":"06:30","close":"15:30"},"saturday":{"open":"07:00","close":"11:00"},"sunday":null}'::jsonb,
   false, false, NULL),
  ('quest', 'Quest Diagnostics - Downtown Orlando', '50 W Lucerne Cir Ste 102', 'Orlando', 'FL', '32801', '(407) 425-6700',
   '{"monday":{"open":"06:30","close":"16:00"},"tuesday":{"open":"06:30","close":"16:00"},"wednesday":{"open":"06:30","close":"16:00"},"thursday":{"open":"06:30","close":"16:00"},"friday":{"open":"06:30","close":"16:00"},"saturday":null,"sunday":null}'::jsonb,
   false, false, NULL),
  ('adventhealth', 'AdventHealth Specimen Drop - Orlando', '601 E Rollins St', 'Orlando', 'FL', '32803', '(407) 303-1700',
   '{}'::jsonb, true, true, '24/7 specimen night drop available at side entrance.'),
  ('orlando_health', 'Orlando Health Lab Drop', '1414 Kuhl Ave', 'Orlando', 'FL', '32806', '(321) 841-5111',
   '{"monday":{"open":"00:00","close":"23:59"},"tuesday":{"open":"00:00","close":"23:59"},"wednesday":{"open":"00:00","close":"23:59"},"thursday":{"open":"00:00","close":"23:59"},"friday":{"open":"00:00","close":"23:59"},"saturday":{"open":"00:00","close":"23:59"},"sunday":{"open":"00:00","close":"23:59"}}'::jsonb,
   true, true, '24/7 hospital lab.')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.touch_labs_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS labs_touch ON public.labs;
CREATE TRIGGER labs_touch BEFORE UPDATE ON public.labs FOR EACH ROW EXECUTE FUNCTION public.touch_labs_updated_at();

ALTER TABLE public.labs ENABLE ROW LEVEL SECURITY;
CREATE POLICY anyone_authenticated_reads_labs
  ON public.labs FOR SELECT TO authenticated USING (true);
CREATE POLICY platform_admin_writes_labs
  ON public.labs FOR ALL TO authenticated
  USING (public.has_any_role(ARRAY['super_admin','admin','owner']))
  WITH CHECK (public.has_any_role(ARRAY['super_admin','admin','owner']));
GRANT SELECT ON public.labs TO authenticated;

-- phleb_mileage_log — IRS audit trail
CREATE TABLE IF NOT EXISTS public.phleb_mileage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phleb_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  lab_id uuid REFERENCES public.labs(id) ON DELETE SET NULL,
  trip_kind text NOT NULL CHECK (trip_kind IN ('to_patient','to_lab','to_office','other')),
  origin_address text,
  destination_address text,
  origin_zip text,
  destination_zip text,
  estimated_miles numeric,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

CREATE INDEX IF NOT EXISTS idx_phleb_mileage_phleb_recorded
  ON public.phleb_mileage_log (phleb_user_id, recorded_at DESC);

ALTER TABLE public.phleb_mileage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY phleb_reads_own_mileage
  ON public.phleb_mileage_log FOR SELECT TO authenticated
  USING (phleb_user_id = auth.uid());

CREATE POLICY phleb_writes_own_mileage
  ON public.phleb_mileage_log FOR INSERT TO authenticated
  WITH CHECK (phleb_user_id = auth.uid());

CREATE POLICY platform_admin_all_mileage
  ON public.phleb_mileage_log FOR ALL TO authenticated
  USING (public.has_any_role(ARRAY['super_admin','admin','owner']))
  WITH CHECK (public.has_any_role(ARRAY['super_admin','admin','owner']));

GRANT SELECT, INSERT ON public.phleb_mileage_log TO authenticated;
