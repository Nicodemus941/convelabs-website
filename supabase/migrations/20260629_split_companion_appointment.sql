-- Split a companion out of its family group into a standalone appointment on a
-- new date/time/address. The primary appointment is left intact and still
-- serviced. Optionally waives/re-prices the fee and moves a lab order that was
-- mis-filed onto the primary back onto the companion (prevents the wrong panel
-- being drawn from the primary patient). Admin-gated. Applied 2026-06-29.
create or replace function public.split_companion_appointment(
  p_companion_id uuid,
  p_new_date date,
  p_new_time text,
  p_new_address text,
  p_new_zip text default null,
  p_waive_fee boolean default true,
  p_new_total numeric default null,
  p_move_lab_from_primary boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_companion appointments%rowtype;
  v_primary_id uuid;
  v_moved_labs boolean := false;
begin
  if not exists (
    select 1 from user_roles
    where user_id = auth.uid()
      and role::text in ('super_admin','office_manager','admin','owner')
  ) then
    raise exception 'not authorized';
  end if;

  select * into v_companion from appointments where id = p_companion_id;
  if not found then
    raise exception 'appointment % not found', p_companion_id;
  end if;

  v_primary_id := v_companion.family_group_id;

  if p_move_lab_from_primary
     and v_primary_id is not null
     and v_primary_id <> p_companion_id
     and coalesce(jsonb_array_length(v_companion.lab_order_panels), 0) = 0 then
    update appointments c set
      lab_order_panels   = p.lab_order_panels,
      lab_order_ocr_text = p.lab_order_ocr_text,
      lab_order_file_path= p.lab_order_file_path,
      fasting_required   = p.fasting_required,
      urine_required     = p.urine_required,
      ocr_processed_at   = now()
    from appointments p
    where c.id = p_companion_id and p.id = v_primary_id
      and coalesce(jsonb_array_length(p.lab_order_panels), 0) > 0;

    if found then
      v_moved_labs := true;
      update appointments set
        lab_order_panels = '[]'::jsonb,
        lab_order_ocr_text = null,
        lab_order_file_path = null,
        urine_required = false,
        updated_at = now()
      where id = v_primary_id;
    end if;
  end if;

  update appointments set
    appointment_date = (p_new_date::timestamptz + interval '16 hours'),
    appointment_time = p_new_time,
    address          = coalesce(p_new_address, address),
    zipcode          = coalesce(p_new_zip, zipcode),
    latitude = null, longitude = null, delivery_location = null,
    family_group_id = null,
    companion_role  = null,
    service_name    = case when service_name = 'Companion Blood Draw' then 'Mobile Blood Draw' else service_name end,
    total_amount = case when p_waive_fee then 0 else coalesce(p_new_total, total_amount) end,
    service_price= case when p_waive_fee then 0 else coalesce(p_new_total, service_price) end,
    total_price  = case when p_waive_fee then 0 else coalesce(p_new_total, total_price) end,
    bill_override_reason = case when p_waive_fee
      then 'Companion fee waived; split to own appointment' else bill_override_reason end,
    reschedule_count = coalesce(reschedule_count,0) + 1,
    rescheduled_at = now(),
    status = 'confirmed',
    updated_at = now()
  where id = p_companion_id;

  return jsonb_build_object(
    'ok', true, 'companion_id', p_companion_id, 'primary_id', v_primary_id,
    'moved_labs', v_moved_labs, 'new_date', p_new_date, 'new_time', p_new_time,
    'fee_waived', p_waive_fee
  );
end;
$$;

revoke all on function public.split_companion_appointment(uuid,date,text,text,text,boolean,numeric,boolean) from public, anon;
grant execute on function public.split_companion_appointment(uuid,date,text,text,text,boolean,numeric,boolean) to authenticated;
