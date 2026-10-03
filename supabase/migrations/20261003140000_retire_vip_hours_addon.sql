-- Retire the legacy "VIP Hours: Early morning visits (4 AM - 7 AM) +$50"
-- checkout add-on. Early-morning slots are now priced by the premium-hours
-- model (05:00-07:00 weekdays, +$10 for non-members, free for members —
-- 20261003130000_premium_hours.sql), so the add-on let a patient pay twice
-- for the same window. Extended Hours and Weekend Service were already off.
UPDATE public.add_on_prices
   SET active = false
 WHERE id = '75a0a394-6a3d-4423-8d2f-862b48264be2'
   AND name = 'VIP Hours';
