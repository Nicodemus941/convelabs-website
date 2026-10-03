-- Invoice-only placeholder rows (address 'Invoice Only' / service_type
-- 'invoice') are not visits. assign_default_phlebotomist gave them the sole
-- cleared phleb, which put them on the phleb's schedule and let a payout be
-- computed on the placeholder instead of the visit (Abby Ritenour 2026-10-02).
-- Same body as before plus the placeholder guard. Forward-only: existing
-- placeholders keep their phleb so no payout row is disturbed.

CREATE OR REPLACE FUNCTION public.assign_default_phlebotomist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
declare
  cnt int;
  sole_phleb uuid;
begin
  if new.address = 'Invoice Only' or new.service_type = 'invoice' then
    return new;
  end if;

  if new.phlebotomist_id is null then
    select count(*) into cnt
    from staff_profiles sp
    join user_roles ur
      on ur.user_id = sp.user_id and ur.role = 'phlebotomist'
    where coalesce(sp.exclude_from_auto_assignment, false) = false
      and coalesce(sp.compliance_status, '') = 'cleared';

    if cnt = 1 then
      select sp.user_id into sole_phleb
      from staff_profiles sp
      join user_roles ur
        on ur.user_id = sp.user_id and ur.role = 'phlebotomist'
      where coalesce(sp.exclude_from_auto_assignment, false) = false
        and coalesce(sp.compliance_status, '') = 'cleared'
      limit 1;

      new.phlebotomist_id := sole_phleb;
    end if;
  end if;
  return new;
end;
$function$;
