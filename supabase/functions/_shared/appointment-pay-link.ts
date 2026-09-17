const DEFAULT_SITE = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com';

function newToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function createOrRefreshAppointmentPayLink(
  admin: any,
  appointmentId: string,
  site = DEFAULT_SITE,
): Promise<{ token: string; url: string; expiresAt: string }> {
  const { data: existingToken } = await admin
    .from('appointment_pay_tokens')
    .select('access_token, expires_at')
    .eq('appointment_id', appointmentId)
    .is('revoked_at', null)
    .is('paid_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingToken?.access_token && existingToken?.expires_at) {
    return {
      token: existingToken.access_token,
      url: `${site}/pay/${existingToken.access_token}`,
      expiresAt: existingToken.expires_at,
    };
  }

  const { data: appt, error: apptErr } = await admin
    .from('appointments')
    .select('id, appointment_date')
    .eq('id', appointmentId)
    .maybeSingle();

  if (apptErr || !appt) {
    throw new Error(`appointment_not_found:${appointmentId}`);
  }

  await admin
    .from('appointment_pay_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('appointment_id', appointmentId)
    .is('revoked_at', null)
    .is('paid_at', null);

  const apptDate = new Date(String(appt.appointment_date).substring(0, 10) + 'T23:59:59-04:00');
  const apptPlus1 = new Date(apptDate.getTime() + 24 * 60 * 60 * 1000);
  const nowPlus30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const expiresAt = new Date(Math.min(apptPlus1.getTime(), nowPlus30.getTime()));

  const token = newToken();
  const { error: insErr } = await admin.from('appointment_pay_tokens').insert({
    appointment_id: appointmentId,
    access_token: token,
    expires_at: expiresAt.toISOString(),
  });

  if (insErr) {
    throw new Error(insErr.message);
  }

  return {
    token,
    url: `${site}/pay/${token}`,
    expiresAt: expiresAt.toISOString(),
  };
}
