import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmployeeRow {
  email: string;
  first_name: string;
  last_name: string;
  executive_upgrade: string | boolean;
  row_number: number;
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

const parseCSV = (text: string): EmployeeRow[] => {
  const lines = text.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const rows = lines.slice(1).map((line, index) => {
    const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
    const row: any = { row_number: index + 2 };
    headers.forEach((header, i) => {
      row[header] = values[i] || '';
    });
    return row;
  });
  
  return rows;
};

const validateEmployee = (employee: EmployeeRow): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (!employee.email || !employee.email.includes('@')) {
    errors.push('Invalid email address');
  }
  if (!employee.first_name) {
    errors.push('Missing first name');
  }
  if (!employee.last_name) {
    errors.push('Missing last name');
  }
  
  return { valid: errors.length === 0, errors };
};

const processEmployees = async (employees: EmployeeRow[], jobId: string) => {
  let successCount = 0;
  let failCount = 0;
  const errorDetails: any[] = [];

  for (let i = 0; i < employees.length; i++) {
    const employee = employees[i];
    
    try {
      // Update progress
      await supabase
        .from('csv_upload_jobs')
        .update({ processed_rows: i + 1 })
        .eq('id', jobId);

      // Validate employee data
      const validation = validateEmployee(employee);
      if (!validation.valid) {
        failCount++;
        errorDetails.push({
          row: employee.row_number,
          email: employee.email,
          errors: validation.errors
        });
        continue;
      }

      // Check if employee already exists
      const { data: existing } = await supabase
        .from('corporate_employees')
        .select('id')
        .eq('email', employee.email.toLowerCase())
        .single();

      if (existing) {
        failCount++;
        errorDetails.push({
          row: employee.row_number,
          email: employee.email,
          errors: ['Employee already exists']
        });
        continue;
      }

      // Convert executive_upgrade to boolean
      const executiveUpgrade = employee.executive_upgrade === 'true' || employee.executive_upgrade === true;

      // Send invitation via existing edge function
      const { error: inviteError } = await supabase.functions.invoke('corporate-invite-employee', {
        body: {
          email: employee.email.toLowerCase(),
          executiveUpgrade,
          firstName: employee.first_name,
          lastName: employee.last_name,
          fromCSV: true
        }
      });

      if (inviteError) {
        failCount++;
        errorDetails.push({
          row: employee.row_number,
          email: employee.email,
          errors: [inviteError.message || 'Failed to send invitation']
        });
      } else {
        successCount++;
      }

      // Small delay to prevent rate limiting
      if (i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

    } catch (error: any) {
      failCount++;
      errorDetails.push({
        row: employee.row_number,
        email: employee.email,
        errors: [error.message || 'Unknown error']
      });
    }
  }

  // Update final job status
  await supabase
    .from('csv_upload_jobs')
    .update({
      status: failCount === 0 ? 'completed' : (successCount === 0 ? 'failed' : 'completed'),
      processed_rows: employees.length,
      successful_rows: successCount,
      failed_rows: failCount,
      error_details: errorDetails,
      completed_at: new Date().toISOString()
    })
    .eq('id', jobId);

  return { successCount, failCount, errorDetails };
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { filePath, fileName } = await req.json();
    
    if (!filePath || !fileName) {
      throw new Error('Missing filePath or fileName');
    }

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Invalid authentication');
    }

    console.log(`Processing CSV upload for user: ${user.id}, file: ${fileName}`);

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('corporate-uploads')
      .download(filePath);

    if (downloadError) {
      throw new Error(`Failed to download file: ${downloadError.message}`);
    }

    // Parse CSV content
    const fileText = await fileData.text();
    const employees = parseCSV(fileText);

    if (employees.length === 0) {
      throw new Error('No valid employee data found in CSV');
    }

    console.log(`Found ${employees.length} employees to process`);

    // Create upload job record
    const { data: jobData, error: jobError } = await supabase
      .from('csv_upload_jobs')
      .insert({
        user_id: user.id,
        file_path: filePath,
        file_name: fileName,
        status: 'processing',
        total_rows: employees.length,
        processed_rows: 0,
        successful_rows: 0,
        failed_rows: 0
      })
      .select()
      .single();

    if (jobError) {
      throw new Error(`Failed to create job record: ${jobError.message}`);
    }

    // Process employees in background
    EdgeRuntime.waitUntil(processEmployees(employees, jobData.id));

    return new Response(
      JSON.stringify({ 
        success: true, 
        jobId: jobData.id,
        totalRows: employees.length,
        message: 'CSV processing started successfully'
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );

  } catch (error: any) {
    console.error('Error in process-csv-employees function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }
};

serve(handler);