import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are the ConveLabs AI Operations Assistant. You help office staff manage a mobile phlebotomy business.

You have tools to query appointments, patients, SMS messages, invoices, and system health. You can also resend notifications and update appointment statuses.

Guidelines:
- Be concise and action-oriented
- When you find issues, explain what's wrong and offer to fix them
- When asked to take action, confirm exactly what you did
- Format data as readable tables when showing multiple records
- Use EST/ET timezone for all times (the business is in Florida)
- Today's date is provided in each request
- If you can't find something, suggest alternative searches
- For patient privacy, don't expose full emails or phone numbers unless the user asks

When showing appointments, always include: patient name, date, time, status, and payment status.
When showing patients, include: name, email, phone, and last visit date.`;

// ── Tool definitions for Claude ─────────────────────────────────────────
const tools = [
  {
    name: "search_appointments",
    description:
      "Search appointments by patient name, email, phone, date range, or status. Returns up to 20 results.",
    input_schema: {
      type: "object" as const,
      properties: {
        patient_query: {
          type: "string",
          description: "Patient name, email, or phone to search for",
        },
        date_from: {
          type: "string",
          description: "Start date (YYYY-MM-DD). Defaults to today.",
        },
        date_to: {
          type: "string",
          description: "End date (YYYY-MM-DD). Defaults to 7 days from now.",
        },
        status: {
          type: "string",
          enum: [
            "scheduled",
            "confirmed",
            "en_route",
            "in_progress",
            "completed",
            "cancelled",
            "no_show",
            "rescheduled",
          ],
          description: "Filter by appointment status",
        },
        invoice_status: {
          type: "string",
          enum: ["pending", "sent", "reminded", "final_warning", "paid", "overdue", "waived", "voided"],
          description: "Filter by invoice/payment status",
        },
      },
      required: [],
    },
  },
  {
    name: "search_patients",
    description:
      "Search patients by name, email, or phone number. Returns patient info with their last visit date.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Patient name, email, or phone to search for",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_sms_history",
    description:
      "Get SMS message history for a patient or phone number. Shows delivery status.",
    input_schema: {
      type: "object" as const,
      properties: {
        patient_query: {
          type: "string",
          description: "Patient name, phone, or email",
        },
        status: {
          type: "string",
          enum: ["sent", "delivered", "failed", "queued"],
          description: "Filter by delivery status",
        },
        limit: {
          type: "number",
          description: "Max results (default 10)",
        },
      },
      required: [],
    },
  },
  {
    name: "system_health_check",
    description:
      "Run a system health check. Returns: today's appointment count, unassigned phlebotomists, missing lab orders, failed SMS, overdue invoices, and tomorrow's readiness.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_todays_schedule",
    description:
      "Get today's full appointment schedule with patient names, times, phlebotomist assignments, and statuses.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_tomorrows_schedule",
    description:
      "Get tomorrow's full appointment schedule with readiness status.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "resend_notification",
    description:
      "Resend a notification (confirmation email, SMS reminder, or invoice) for a specific appointment.",
    input_schema: {
      type: "object" as const,
      properties: {
        appointment_id: {
          type: "string",
          description: "The appointment UUID",
        },
        notification_type: {
          type: "string",
          enum: ["confirmation", "sms_reminder", "invoice"],
          description: "Type of notification to resend",
        },
      },
      required: ["appointment_id", "notification_type"],
    },
  },
  {
    name: "update_appointment_status",
    description:
      "Update an appointment's status. Use with caution — this changes the appointment state.",
    input_schema: {
      type: "object" as const,
      properties: {
        appointment_id: {
          type: "string",
          description: "The appointment UUID",
        },
        new_status: {
          type: "string",
          enum: [
            "scheduled",
            "confirmed",
            "en_route",
            "in_progress",
            "completed",
            "cancelled",
            "no_show",
            "rescheduled",
          ],
          description: "The new status",
        },
        reason: {
          type: "string",
          description: "Reason for the status change (logged for audit)",
        },
      },
      required: ["appointment_id", "new_status"],
    },
  },
  {
    name: "update_invoice_status",
    description:
      "Update an invoice/payment status (mark paid, void, etc.).",
    input_schema: {
      type: "object" as const,
      properties: {
        appointment_id: {
          type: "string",
          description: "The appointment UUID",
        },
        new_status: {
          type: "string",
          enum: ["paid", "voided", "waived"],
          description: "The new invoice status",
        },
      },
      required: ["appointment_id", "new_status"],
    },
  },
  {
    name: "update_patient",
    description:
      "Update a patient's contact info or address in tenant_patients. Also updates any future appointment records to keep them in sync.",
    input_schema: {
      type: "object" as const,
      properties: {
        patient_query: {
          type: "string",
          description: "Patient name, email, or phone to find the patient",
        },
        address: {
          type: "string",
          description: "New street address",
        },
        city: {
          type: "string",
          description: "New city",
        },
        state: {
          type: "string",
          description: "New state (2-letter code)",
        },
        zipcode: {
          type: "string",
          description: "New ZIP code",
        },
        email: {
          type: "string",
          description: "New email address",
        },
        phone: {
          type: "string",
          description: "New phone number",
        },
      },
      required: ["patient_query"],
    },
  },
  {
    name: "get_activity_log",
    description:
      "Get recent activity log entries, optionally filtered by type or patient.",
    input_schema: {
      type: "object" as const,
      properties: {
        activity_type: {
          type: "string",
          enum: ["call", "sms", "email", "cancellation", "reschedule", "payment", "note"],
          description: "Filter by activity type",
        },
        patient_query: {
          type: "string",
          description: "Filter by patient name",
        },
        limit: {
          type: "number",
          description: "Max results (default 15)",
        },
      },
      required: [],
    },
  },
];

// ── Tool execution ──────────────────────────────────────────────────────

function todayET(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function tomorrowET(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

async function executeTool(
  supabase: any,
  supabaseUrl: string,
  supabaseKey: string,
  name: string,
  input: any
): Promise<any> {
  const today = todayET();
  const tomorrow = tomorrowET();

  switch (name) {
    case "search_appointments": {
      let q = supabase
        .from("appointments")
        .select(
          "id, patient_name, patient_email, patient_phone, appointment_date, appointment_time, status, invoice_status, service_type, total_price, phlebotomist_id, address, notes"
        )
        .order("appointment_date", { ascending: false })
        .limit(20);

      if (input.patient_query) {
        const pq = input.patient_query;
        q = q.or(
          `patient_name.ilike.%${pq}%,patient_email.ilike.%${pq}%,patient_phone.ilike.%${pq}%`
        );
      }
      if (input.date_from) q = q.gte("appointment_date", input.date_from);
      if (input.date_to) q = q.lte("appointment_date", input.date_to + "T23:59:59");
      if (input.status) q = q.eq("status", input.status);
      if (input.invoice_status) q = q.eq("invoice_status", input.invoice_status);

      const { data, error } = await q;
      if (error) return { error: error.message };
      return { count: data?.length || 0, appointments: data || [] };
    }

    case "search_patients": {
      const pq = input.query;
      const { data, error } = await supabase
        .from("tenant_patients")
        .select(
          "id, first_name, last_name, email, phone, address, city, state, zipcode, is_active, created_at"
        )
        .or(
          `first_name.ilike.%${pq}%,last_name.ilike.%${pq}%,email.ilike.%${pq}%,phone.ilike.%${pq}%`
        )
        .eq("is_active", true)
        .limit(15);

      if (error) return { error: error.message };

      // Get last appointment for each patient
      const patients = data || [];
      for (const p of patients) {
        const { data: appts } = await supabase
          .from("appointments")
          .select("appointment_date, status")
          .or(`patient_email.eq.${p.email},patient_phone.eq.${p.phone}`)
          .order("appointment_date", { ascending: false })
          .limit(1);
        p.last_visit = appts?.[0]?.appointment_date || null;
        p.last_visit_status = appts?.[0]?.status || null;
      }

      return { count: patients.length, patients };
    }

    case "get_sms_history": {
      let q = supabase
        .from("sms_messages")
        .select("id, patient_id, direction, body, status, created_at, from_number, to_number")
        .order("created_at", { ascending: false })
        .limit(input.limit || 10);

      if (input.status) q = q.eq("status", input.status);

      if (input.patient_query) {
        // First find patient by name/phone/email
        const pq = input.patient_query;
        const { data: patients } = await supabase
          .from("tenant_patients")
          .select("id, first_name, last_name, phone")
          .or(
            `first_name.ilike.%${pq}%,last_name.ilike.%${pq}%,email.ilike.%${pq}%,phone.ilike.%${pq}%`
          )
          .limit(5);

        if (patients && patients.length > 0) {
          const ids = patients.map((p: any) => p.id);
          q = q.in("patient_id", ids);
        }
      }

      const { data, error } = await q;
      if (error) return { error: error.message };
      return { count: data?.length || 0, messages: data || [] };
    }

    case "system_health_check": {
      const results: any = {};

      // Today's appointments
      const { count: todayCount } = await supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .gte("appointment_date", today)
        .lt("appointment_date", today + "T23:59:59")
        .not("status", "in", '("cancelled","rescheduled")');
      results.todays_appointments = todayCount || 0;

      // Unassigned phlebotomist
      const { data: unassigned } = await supabase
        .from("appointments")
        .select("id, patient_name, appointment_time")
        .gte("appointment_date", today)
        .lt("appointment_date", today + "T23:59:59")
        .is("phlebotomist_id", null)
        .not("status", "in", '("cancelled","rescheduled","completed")');
      results.unassigned_today = unassigned || [];

      // Missing lab orders
      const { data: missingLabs } = await supabase
        .from("appointments")
        .select("id, patient_name, appointment_time")
        .gte("appointment_date", today)
        .eq("service_type", "mobile")
        .or("lab_order_url.is.null,lab_order_url.eq.")
        .not("status", "in", '("cancelled","rescheduled","completed")');
      results.missing_lab_orders = missingLabs || [];

      // Failed SMS in last 24h
      const yesterday = new Date(Date.now() - 86400000).toISOString();
      const { count: failedSms } = await supabase
        .from("sms_notifications")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed")
        .gte("created_at", yesterday);
      results.failed_sms_24h = failedSms || 0;

      // Overdue invoices
      const { data: overdue } = await supabase
        .from("appointments")
        .select("id, patient_name, total_price, appointment_date")
        .in("invoice_status", ["sent", "reminded", "final_warning"])
        .not("status", "in", '("cancelled","rescheduled")')
        .order("appointment_date", { ascending: true });
      results.overdue_invoices = overdue || [];

      // Tomorrow's readiness
      const { data: tomorrowAppts } = await supabase
        .from("appointments")
        .select("id, patient_name, appointment_time, phlebotomist_id, service_type, lab_order_url")
        .gte("appointment_date", tomorrow)
        .lt("appointment_date", tomorrow + "T23:59:59")
        .not("status", "in", '("cancelled","rescheduled")');
      results.tomorrow_appointments = tomorrowAppts || [];
      results.tomorrow_unassigned = (tomorrowAppts || []).filter(
        (a: any) => !a.phlebotomist_id
      );
      results.tomorrow_missing_labs = (tomorrowAppts || []).filter(
        (a: any) =>
          a.service_type === "mobile" && !a.lab_order_url
      );

      return results;
    }

    case "get_todays_schedule": {
      const { data, error } = await supabase
        .from("appointments")
        .select(
          "id, patient_name, patient_phone, appointment_time, status, invoice_status, service_type, total_price, phlebotomist_id, address"
        )
        .gte("appointment_date", today)
        .lt("appointment_date", today + "T23:59:59")
        .not("status", "in", '("cancelled","rescheduled")')
        .order("appointment_time", { ascending: true });
      if (error) return { error: error.message };
      return { date: today, count: data?.length || 0, appointments: data || [] };
    }

    case "get_tomorrows_schedule": {
      const { data, error } = await supabase
        .from("appointments")
        .select(
          "id, patient_name, patient_phone, appointment_time, status, invoice_status, service_type, total_price, phlebotomist_id, address, lab_order_url"
        )
        .gte("appointment_date", tomorrow)
        .lt("appointment_date", tomorrow + "T23:59:59")
        .not("status", "in", '("cancelled","rescheduled")')
        .order("appointment_time", { ascending: true });
      if (error) return { error: error.message };
      return { date: tomorrow, count: data?.length || 0, appointments: data || [] };
    }

    case "resend_notification": {
      const { appointment_id, notification_type } = input;

      // Get appointment details first
      const { data: appt, error: apptErr } = await supabase
        .from("appointments")
        .select("*")
        .eq("id", appointment_id)
        .single();

      if (apptErr || !appt) return { error: "Appointment not found" };

      const fnMap: Record<string, string> = {
        confirmation: "send-appointment-confirmation",
        sms_reminder: "send-sms-notification",
        invoice: "send-appointment-invoice",
      };

      const fnName = fnMap[notification_type];
      if (!fnName) return { error: `Unknown notification type: ${notification_type}` };

      try {
        const fnUrl = `${supabaseUrl}/functions/v1/${fnName}`;
        let payload: any;

        if (notification_type === "sms_reminder") {
          payload = {
            to: appt.patient_phone,
            message: `Hi ${appt.patient_name?.split(" ")[0] || "there"}, this is a reminder about your ConveLabs appointment. Questions? Call (941) 527-9169`,
          };
        } else {
          payload = { appointmentId: appointment_id };
        }

        const resp = await fetch(fnUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify(payload),
        });

        const result = await resp.json();
        return {
          success: true,
          notification_type,
          patient: appt.patient_name,
          result,
        };
      } catch (e: any) {
        return { error: `Failed to resend: ${e.message}` };
      }
    }

    case "update_appointment_status": {
      const { appointment_id, new_status, reason } = input;

      const { data, error } = await supabase
        .from("appointments")
        .update({
          status: new_status,
          notes: reason
            ? `[Status changed to ${new_status}: ${reason}]`
            : undefined,
        })
        .eq("id", appointment_id)
        .select("id, patient_name, status")
        .single();

      if (error) return { error: error.message };

      // Log to activity_log if table exists
      try {
        await supabase.from("activity_log").insert({
          appointment_id,
          activity_type: new_status === "cancelled" ? "cancellation" : "reschedule",
          description: `Status changed to ${new_status}${reason ? `: ${reason}` : ""}`,
        });
      } catch (_) {
        /* activity_log may not exist */
      }

      return { success: true, appointment: data };
    }

    case "update_invoice_status": {
      const { appointment_id, new_status } = input;

      const { data, error } = await supabase
        .from("appointments")
        .update({ invoice_status: new_status })
        .eq("id", appointment_id)
        .select("id, patient_name, invoice_status")
        .single();

      if (error) return { error: error.message };
      return { success: true, appointment: data };
    }

    case "update_patient": {
      const { patient_query, address, city, state, zipcode, email, phone } = input;

      // Find the patient by name, email, or phone
      const { data: patients, error: searchErr } = await supabase
        .from("tenant_patients")
        .select("id, first_name, last_name, email, phone, address, city, state, zipcode")
        .or(
          `first_name.ilike.%${patient_query}%,last_name.ilike.%${patient_query}%,email.ilike.%${patient_query}%,phone.ilike.%${patient_query}%`
        )
        .eq("is_active", true)
        .limit(5);

      if (searchErr) return { error: searchErr.message };
      if (!patients || patients.length === 0) return { error: `No patient found matching "${patient_query}"` };
      if (patients.length > 1) {
        return {
          error: `Multiple patients found matching "${patient_query}". Please be more specific.`,
          matches: patients.map((p: any) => `${p.first_name} ${p.last_name} (${p.email || p.phone || "no contact"})`),
        };
      }

      const patient = patients[0];
      const updates: Record<string, any> = {};
      if (address !== undefined) updates.address = address;
      if (city !== undefined) updates.city = city;
      if (state !== undefined) updates.state = state;
      if (zipcode !== undefined) updates.zipcode = zipcode;
      if (email !== undefined) updates.email = email;
      if (phone !== undefined) updates.phone = phone;

      if (Object.keys(updates).length === 0) {
        return { error: "No fields to update. Provide at least one of: address, city, state, zipcode, email, phone." };
      }

      // Update tenant_patients
      const { error: updateErr } = await supabase
        .from("tenant_patients")
        .update(updates)
        .eq("id", patient.id);

      if (updateErr) return { error: `Failed to update patient: ${updateErr.message}` };

      // Sync future appointments for this patient
      const apptUpdates: Record<string, any> = {};
      if (address !== undefined || city !== undefined || state !== undefined || zipcode !== undefined) {
        const fullAddr = [
          address || patient.address,
          city || patient.city,
          state || patient.state,
          zipcode || patient.zipcode,
        ].filter(Boolean).join(", ");
        apptUpdates.address = fullAddr;
        apptUpdates.zipcode = zipcode || patient.zipcode;
      }
      if (email !== undefined) apptUpdates.patient_email = email;
      if (phone !== undefined) apptUpdates.patient_phone = phone;

      if (Object.keys(apptUpdates).length > 0) {
        // Update future appointments by matching patient email or phone
        const patientEmail = email || patient.email;
        const patientPhone = phone || patient.phone;
        const filters: string[] = [];
        if (patientEmail) filters.push(`patient_email.eq.${patientEmail}`);
        if (patientPhone) filters.push(`patient_phone.eq.${patientPhone}`);
        // Also match by patient_id if we have it
        filters.push(`patient_id.eq.${patient.id}`);

        if (filters.length > 0) {
          const { count } = await supabase
            .from("appointments")
            .update(apptUpdates)
            .or(filters.join(","))
            .gte("appointment_date", today)
            .not("status", "in", '("cancelled","completed","rescheduled")');

          return {
            success: true,
            patient: `${patient.first_name} ${patient.last_name}`,
            fields_updated: Object.keys(updates),
            future_appointments_synced: count || 0,
          };
        }
      }

      return {
        success: true,
        patient: `${patient.first_name} ${patient.last_name}`,
        fields_updated: Object.keys(updates),
        future_appointments_synced: 0,
      };
    }

    case "get_activity_log": {
      let q = supabase
        .from("activity_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(input.limit || 15);

      if (input.activity_type) q = q.eq("activity_type", input.activity_type);

      const { data, error } = await q;
      if (error) return { error: error.message };
      return { count: data?.length || 0, entries: data || [] };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ── Main handler ────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicApiKey) {
      throw new Error("ANTHROPIC_API_KEY is not configured in Supabase secrets");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { messages } = await req.json();
    const today = todayET();

    // Build Claude messages (filter system messages, inject date context)
    const claudeMessages = messages
      .filter((m: any) => m.role !== "system")
      .map((m: any) => ({ role: m.role, content: m.content }));

    const systemWithDate = `${SYSTEM_PROMPT}\n\nToday's date: ${today}`;

    // Tool-use loop: Claude may call multiple tools before giving a final answer
    let iterations = 0;
    while (iterations < 6) {
      iterations++;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicApiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 2048,
          system: systemWithDate,
          tools,
          messages: claudeMessages,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("Claude API error:", response.status, errText);
        throw new Error(`Claude API ${response.status}: ${errText}`);
      }

      const data = await response.json();

      // If stop reason is end_turn or no tool use, return the text
      if (data.stop_reason === "end_turn" || !data.content.some((c: any) => c.type === "tool_use")) {
        const text = data.content
          .filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join("");

        return new Response(
          JSON.stringify({ success: true, response: text, usage: data.usage }),
          { headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Execute tool calls
      claudeMessages.push({ role: "assistant", content: data.content });

      const toolResults: any[] = [];
      for (const block of data.content) {
        if (block.type === "tool_use") {
          console.log(`Executing tool: ${block.name}`, block.input);
          const result = await executeTool(
            supabase,
            supabaseUrl,
            supabaseKey,
            block.name,
            block.input
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        }
      }

      claudeMessages.push({ role: "user", content: toolResults });
    }

    // If we exhaust iterations, return what we have
    return new Response(
      JSON.stringify({
        success: true,
        response: "I ran into a complex query that needed too many steps. Could you try rephrasing with more specific details?",
      }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("AI Ops Assistant error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
