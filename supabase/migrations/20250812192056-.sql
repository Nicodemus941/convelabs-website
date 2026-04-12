-- Add missing RLS policies for new tables

-- Admin can manage all services
CREATE POLICY "Admins can manage services" ON public.services_enhanced
FOR ALL USING (is_user_admin())
WITH CHECK (is_user_admin());

-- Staff can view services they're assigned to
CREATE POLICY "Staff can view assigned services" ON public.services_enhanced
FOR SELECT USING (
  services_enhanced.id IN (
    SELECT ssa.service_id FROM public.service_staff_assignments ssa
    JOIN public.staff_profiles sp ON ssa.staff_id = sp.id
    WHERE sp.user_id = auth.uid()
  )
);

-- Public can view active services
CREATE POLICY "Public can view active services" ON public.services_enhanced
FOR SELECT USING (is_active = true);

-- Service staff assignments policies
CREATE POLICY "Admins can manage service assignments" ON public.service_staff_assignments
FOR ALL USING (is_user_admin())
WITH CHECK (is_user_admin());

CREATE POLICY "Staff can view their assignments" ON public.service_staff_assignments
FOR SELECT USING (
  staff_id IN (
    SELECT sp.id FROM public.staff_profiles sp WHERE sp.user_id = auth.uid()
  )
);

-- Time off request policies
CREATE POLICY "Staff can manage their time off requests" ON public.staff_time_off_requests
FOR ALL USING (
  staff_id IN (
    SELECT sp.id FROM public.staff_profiles sp WHERE sp.user_id = auth.uid()
  )
)
WITH CHECK (
  staff_id IN (
    SELECT sp.id FROM public.staff_profiles sp WHERE sp.user_id = auth.uid()
  )
);

CREATE POLICY "Admins can manage all time off requests" ON public.staff_time_off_requests
FOR ALL USING (is_user_admin())
WITH CHECK (is_user_admin());

-- Staff date blocks policies
CREATE POLICY "Admins can manage staff blocks" ON public.staff_date_blocks
FOR ALL USING (is_user_admin())
WITH CHECK (is_user_admin());

CREATE POLICY "Staff can view their blocks" ON public.staff_date_blocks
FOR SELECT USING (
  staff_id IN (
    SELECT sp.id FROM public.staff_profiles sp WHERE sp.user_id = auth.uid()
  )
);

-- Lab orders policies
CREATE POLICY "Patients can upload lab orders for their appointments" ON public.appointment_lab_orders
FOR INSERT WITH CHECK (
  uploaded_by = auth.uid() AND
  appointment_id IN (
    SELECT a.id FROM public.appointments a WHERE a.patient_id = auth.uid()
  )
);

CREATE POLICY "Patients can view their lab orders" ON public.appointment_lab_orders
FOR SELECT USING (
  appointment_id IN (
    SELECT a.id FROM public.appointments a WHERE a.patient_id = auth.uid()
  )
);

CREATE POLICY "Assigned staff can view lab orders" ON public.appointment_lab_orders
FOR SELECT USING (
  appointment_id IN (
    SELECT a.id FROM public.appointments a
    JOIN public.staff_profiles sp ON a.phlebotomist_id = sp.id
    WHERE sp.user_id = auth.uid()
  )
);

CREATE POLICY "Admins can manage all lab orders" ON public.appointment_lab_orders
FOR ALL USING (is_user_admin())
WITH CHECK (is_user_admin());

-- SMS notifications policies
CREATE POLICY "System can manage SMS notifications" ON public.sms_notifications
FOR ALL USING (true)
WITH CHECK (true);

CREATE POLICY "Staff can view SMS for their appointments" ON public.sms_notifications
FOR SELECT USING (
  appointment_id IN (
    SELECT a.id FROM public.appointments a
    JOIN public.staff_profiles sp ON a.phlebotomist_id = sp.id
    WHERE sp.user_id = auth.uid()
  )
);

-- Appointment status updates policies
CREATE POLICY "Staff can update their appointment statuses" ON public.appointment_status_updates
FOR ALL USING (
  updated_by IN (
    SELECT sp.id FROM public.staff_profiles sp WHERE sp.user_id = auth.uid()
  )
)
WITH CHECK (
  updated_by IN (
    SELECT sp.id FROM public.staff_profiles sp WHERE sp.user_id = auth.uid()
  )
);

CREATE POLICY "Admins can view all status updates" ON public.appointment_status_updates
FOR ALL USING (is_user_admin())
WITH CHECK (is_user_admin());

-- Review requests policies
CREATE POLICY "Patients can view their review requests" ON public.review_requests
FOR SELECT USING (patient_id = auth.uid());

CREATE POLICY "System can manage review requests" ON public.review_requests
FOR ALL USING (true)
WITH CHECK (true);

-- Appointment cancellations policies
CREATE POLICY "Users can view their cancellations" ON public.appointment_cancellations
FOR SELECT USING (
  cancelled_by = auth.uid() OR
  appointment_id IN (
    SELECT a.id FROM public.appointments a WHERE a.patient_id = auth.uid()
  )
);

CREATE POLICY "System can manage cancellations" ON public.appointment_cancellations
FOR ALL USING (true)
WITH CHECK (true);