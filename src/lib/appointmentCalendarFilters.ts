type CalendarAppointmentLike = {
  id?: string | null;
  family_group_id?: string | null;
  companion_role?: string | null;
  appointment_time?: string | null;
  address?: string | null;
  status?: string | null;
};

export function isInvoiceOnlyAppointment(appt: CalendarAppointmentLike): boolean {
  const address = (appt.address || '').toLowerCase();
  return !appt.appointment_time || address.includes('invoice only');
}

export function isPrimaryCalendarRow(appt: CalendarAppointmentLike): boolean {
  return !appt.family_group_id || appt.id === appt.family_group_id || !appt.companion_role;
}

export function filterCalendarAppointments<T extends CalendarAppointmentLike>(
  appointments: T[],
  options?: { keepCancelled?: boolean }
): T[] {
  return appointments.filter((appt) => {
    if (isInvoiceOnlyAppointment(appt)) return false;
    if (!options?.keepCancelled && appt.status === 'cancelled') return false;
    return isPrimaryCalendarRow(appt);
  });
}
