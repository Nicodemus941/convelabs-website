export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      ab_test_assignments: {
        Row: {
          assigned_at: string
          experiment_id: string
          id: string
          session_id: string
          user_id: string | null
          variant: string
        }
        Insert: {
          assigned_at?: string
          experiment_id: string
          id?: string
          session_id: string
          user_id?: string | null
          variant: string
        }
        Update: {
          assigned_at?: string
          experiment_id?: string
          id?: string
          session_id?: string
          user_id?: string | null
          variant?: string
        }
        Relationships: [
          {
            foreignKeyName: "ab_test_assignments_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "ab_test_experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      ab_test_experiments: {
        Row: {
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          name: string
          start_date: string
          status: string
          success_metric: string
          traffic_split: Json
          updated_at: string
          variants: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          name: string
          start_date?: string
          status?: string
          success_metric: string
          traffic_split: Json
          updated_at?: string
          variants: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          name?: string
          start_date?: string
          status?: string
          success_metric?: string
          traffic_split?: Json
          updated_at?: string
          variants?: Json
        }
        Relationships: []
      }
      ab_test_performance: {
        Row: {
          click_rate: number | null
          clicks: number | null
          conversion_rate: number | null
          conversions: number | null
          created_at: string | null
          date: string
          experiment_id: string
          hour: number
          id: string
          impressions: number | null
          revenue_cents: number | null
          revenue_per_visitor: number | null
          updated_at: string | null
          variant: string
        }
        Insert: {
          click_rate?: number | null
          clicks?: number | null
          conversion_rate?: number | null
          conversions?: number | null
          created_at?: string | null
          date?: string
          experiment_id: string
          hour?: number
          id?: string
          impressions?: number | null
          revenue_cents?: number | null
          revenue_per_visitor?: number | null
          updated_at?: string | null
          variant: string
        }
        Update: {
          click_rate?: number | null
          clicks?: number | null
          conversion_rate?: number | null
          conversions?: number | null
          created_at?: string | null
          date?: string
          experiment_id?: string
          hour?: number
          id?: string
          impressions?: number | null
          revenue_cents?: number | null
          revenue_per_visitor?: number | null
          updated_at?: string | null
          variant?: string
        }
        Relationships: [
          {
            foreignKeyName: "ab_test_performance_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "ab_test_experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      add_on_prices: {
        Row: {
          active: boolean | null
          created_at: string | null
          description: string | null
          id: string
          name: string
          price: number
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          price: number
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          price?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      agreements: {
        Row: {
          created_at: string
          description: string | null
          document_path: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          document_path: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          document_path?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      analytics_metrics_cache: {
        Row: {
          additional_data: Json | null
          calculated_at: string | null
          expires_at: string
          id: string
          metric_count: number | null
          metric_name: string
          metric_value: number
          period_start: string
          time_period: string
        }
        Insert: {
          additional_data?: Json | null
          calculated_at?: string | null
          expires_at: string
          id?: string
          metric_count?: number | null
          metric_name: string
          metric_value: number
          period_start: string
          time_period: string
        }
        Update: {
          additional_data?: Json | null
          calculated_at?: string | null
          expires_at?: string
          id?: string
          metric_count?: number | null
          metric_name?: string
          metric_value?: number
          period_start?: string
          time_period?: string
        }
        Relationships: []
      }
      api_call_logs: {
        Row: {
          api_key_id: string | null
          created_at: string
          endpoint: string
          error_message: string | null
          id: string
          method: string
          response_time_ms: number
          status_code: number
        }
        Insert: {
          api_key_id?: string | null
          created_at?: string
          endpoint: string
          error_message?: string | null
          id?: string
          method: string
          response_time_ms: number
          status_code: number
        }
        Update: {
          api_key_id?: string | null
          created_at?: string
          endpoint?: string
          error_message?: string | null
          id?: string
          method?: string
          response_time_ms?: number
          status_code?: number
        }
        Relationships: [
          {
            foreignKeyName: "api_call_logs_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          key_hash: string
          key_name: string
          key_prefix: string
          last_used_at: string | null
          tenant_name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          key_hash: string
          key_name: string
          key_prefix: string
          last_used_at?: string | null
          tenant_name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          key_hash?: string
          key_name?: string
          key_prefix?: string
          last_used_at?: string | null
          tenant_name?: string
        }
        Relationships: []
      }
      api_logs: {
        Row: {
          created_at: string | null
          endpoint: string
          error_message: string | null
          id: number
          member_id: string | null
          response: Json | null
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          endpoint: string
          error_message?: string | null
          id?: never
          member_id?: string | null
          response?: Json | null
          status: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          endpoint?: string
          error_message?: string | null
          id?: never
          member_id?: string | null
          response?: Json | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      appointment_cancellations: {
        Row: {
          appointment_id: string | null
          cancellation_fee: number | null
          cancelled_at: string | null
          cancelled_by: string | null
          hours_before_appointment: number | null
          id: string
          policy_applied: string | null
          reason: string | null
          refund_amount: number | null
        }
        Insert: {
          appointment_id?: string | null
          cancellation_fee?: number | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          hours_before_appointment?: number | null
          id?: string
          policy_applied?: string | null
          reason?: string | null
          refund_amount?: number | null
        }
        Update: {
          appointment_id?: string | null
          cancellation_fee?: number | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          hours_before_appointment?: number | null
          id?: string
          policy_applied?: string | null
          reason?: string | null
          refund_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "appointment_cancellations_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_lab_orders: {
        Row: {
          access_log: Json | null
          appointment_id: string | null
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          original_filename: string
          uploaded_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          access_log?: Json | null
          appointment_id?: string | null
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          original_filename: string
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          access_log?: Json | null
          appointment_id?: string | null
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          original_filename?: string
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointment_lab_orders_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_notifications: {
        Row: {
          appointment_id: string | null
          created_at: string | null
          id: string
          notification_type: string
          recipient_id: string | null
          scheduled_for: string
          sent_at: string | null
          status: string
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string | null
          id?: string
          notification_type: string
          recipient_id?: string | null
          scheduled_for: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          appointment_id?: string | null
          created_at?: string | null
          id?: string
          notification_type?: string
          recipient_id?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_notifications_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_slots: {
        Row: {
          appointment_id: string | null
          buffer_time_minutes: number
          created_at: string
          date: string
          end_time: string
          id: string
          is_booked: boolean
          phlebotomist_id: string
          start_time: string
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          buffer_time_minutes?: number
          created_at?: string
          date: string
          end_time: string
          id?: string
          is_booked?: boolean
          phlebotomist_id: string
          start_time: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          buffer_time_minutes?: number
          created_at?: string
          date?: string
          end_time?: string
          id?: string
          is_booked?: boolean
          phlebotomist_id?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_appointment_slots_appointment"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_appointment_slots_phlebotomist"
            columns: ["phlebotomist_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_status_updates: {
        Row: {
          appointment_id: string | null
          created_at: string | null
          eta_minutes: number | null
          id: string
          lab_name: string | null
          notes: string | null
          status: string
          tracking_id: string | null
          updated_by: string | null
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string | null
          eta_minutes?: number | null
          id?: string
          lab_name?: string | null
          notes?: string | null
          status: string
          tracking_id?: string | null
          updated_by?: string | null
        }
        Update: {
          appointment_id?: string | null
          created_at?: string | null
          eta_minutes?: number | null
          id?: string
          lab_name?: string | null
          notes?: string | null
          status?: string
          tracking_id?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointment_status_updates_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_status_updates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          address: string
          address_city: string | null
          address_state: string | null
          address_street: string | null
          address_zip: string | null
          appointment_date: string
          appointment_time: string | null
          arrival_time: string | null
          cancellation_fee: number | null
          cancellation_reason: string | null
          cancelled_at: string | null
          completion_time: string | null
          created_at: string | null
          credit_used: boolean | null
          delivery_details: Json | null
          distance_from_previous_miles: number | null
          doctor_id: string | null
          duration_minutes: number | null
          estimated_travel_time: number | null
          estimated_travel_time_minutes: number | null
          eta_minutes: number | null
          extended_hours: boolean | null
          external_booking_id: string | null
          id: string
          lab_destination: string | null
          lab_order_file_path: string | null
          latitude: number | null
          longitude: number | null
          member_status: string | null
          next_appointment_id: string | null
          notes: string | null
          original_appointment_id: string | null
          patient_id: string
          payment_reference: string | null
          payment_status: string | null
          phlebotomist_id: string | null
          previous_appointment_id: string | null
          rescheduled_at: string | null
          rescheduling_fee: number | null
          route_position: number | null
          service_id: string | null
          service_type: string | null
          start_time: string | null
          status: string
          tenant_id: string | null
          total_amount: number | null
          total_price: number | null
          updated_at: string | null
          urine_test_included: boolean | null
          vip_hours: boolean | null
          weekend_service: boolean | null
          zipcode: string
        }
        Insert: {
          address: string
          address_city?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          appointment_date: string
          appointment_time?: string | null
          arrival_time?: string | null
          cancellation_fee?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          completion_time?: string | null
          created_at?: string | null
          credit_used?: boolean | null
          delivery_details?: Json | null
          distance_from_previous_miles?: number | null
          doctor_id?: string | null
          duration_minutes?: number | null
          estimated_travel_time?: number | null
          estimated_travel_time_minutes?: number | null
          eta_minutes?: number | null
          extended_hours?: boolean | null
          external_booking_id?: string | null
          id?: string
          lab_destination?: string | null
          lab_order_file_path?: string | null
          latitude?: number | null
          longitude?: number | null
          member_status?: string | null
          next_appointment_id?: string | null
          notes?: string | null
          original_appointment_id?: string | null
          patient_id: string
          payment_reference?: string | null
          payment_status?: string | null
          phlebotomist_id?: string | null
          previous_appointment_id?: string | null
          rescheduled_at?: string | null
          rescheduling_fee?: number | null
          route_position?: number | null
          service_id?: string | null
          service_type?: string | null
          start_time?: string | null
          status?: string
          tenant_id?: string | null
          total_amount?: number | null
          total_price?: number | null
          updated_at?: string | null
          urine_test_included?: boolean | null
          vip_hours?: boolean | null
          weekend_service?: boolean | null
          zipcode: string
        }
        Update: {
          address?: string
          address_city?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          appointment_date?: string
          appointment_time?: string | null
          arrival_time?: string | null
          cancellation_fee?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          completion_time?: string | null
          created_at?: string | null
          credit_used?: boolean | null
          delivery_details?: Json | null
          distance_from_previous_miles?: number | null
          doctor_id?: string | null
          duration_minutes?: number | null
          estimated_travel_time?: number | null
          estimated_travel_time_minutes?: number | null
          eta_minutes?: number | null
          extended_hours?: boolean | null
          external_booking_id?: string | null
          id?: string
          lab_destination?: string | null
          lab_order_file_path?: string | null
          latitude?: number | null
          longitude?: number | null
          member_status?: string | null
          next_appointment_id?: string | null
          notes?: string | null
          original_appointment_id?: string | null
          patient_id?: string
          payment_reference?: string | null
          payment_status?: string | null
          phlebotomist_id?: string | null
          previous_appointment_id?: string | null
          rescheduled_at?: string | null
          rescheduling_fee?: number | null
          route_position?: number | null
          service_id?: string | null
          service_type?: string | null
          start_time?: string | null
          status?: string
          tenant_id?: string | null
          total_amount?: number | null
          total_price?: number | null
          updated_at?: string | null
          urine_test_included?: boolean | null
          vip_hours?: boolean | null
          weekend_service?: boolean | null
          zipcode?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_original_appointment_id_fkey"
            columns: ["original_appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          id: string
          new_data: Json | null
          old_data: Json | null
          operation: string
          table_name: string
          timestamp: string | null
          user_id: string | null
        }
        Insert: {
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          operation: string
          table_name: string
          timestamp?: string | null
          user_id?: string | null
        }
        Update: {
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          operation?: string
          table_name?: string
          timestamp?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      auth_rate_limits: {
        Row: {
          attempt_count: number | null
          blocked_until: string | null
          email: string | null
          first_attempt: string | null
          id: string
          ip_address: unknown
          last_attempt: string | null
        }
        Insert: {
          attempt_count?: number | null
          blocked_until?: string | null
          email?: string | null
          first_attempt?: string | null
          id?: string
          ip_address: unknown
          last_attempt?: string | null
        }
        Update: {
          attempt_count?: number | null
          blocked_until?: string | null
          email?: string | null
          first_attempt?: string | null
          id?: string
          ip_address?: unknown
          last_attempt?: string | null
        }
        Relationships: []
      }
      booking_attribution: {
        Row: {
          appointment_id: string | null
          booking_completed_at: string | null
          booking_id: string | null
          campaign_data: Json | null
          created_at: string | null
          first_page: string | null
          id: string
          pages_visited: string[] | null
          service_amount: number
          service_type: string
          session_id: string
          total_session_time_seconds: number | null
          traffic_source: string | null
        }
        Insert: {
          appointment_id?: string | null
          booking_completed_at?: string | null
          booking_id?: string | null
          campaign_data?: Json | null
          created_at?: string | null
          first_page?: string | null
          id?: string
          pages_visited?: string[] | null
          service_amount: number
          service_type: string
          session_id: string
          total_session_time_seconds?: number | null
          traffic_source?: string | null
        }
        Update: {
          appointment_id?: string | null
          booking_completed_at?: string | null
          booking_id?: string | null
          campaign_data?: Json | null
          created_at?: string | null
          first_page?: string | null
          id?: string
          pages_visited?: string[] | null
          service_amount?: number
          service_type?: string
          session_id?: string
          total_session_time_seconds?: number | null
          traffic_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_attribution_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_attribution_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "visitor_sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      booking_holds: {
        Row: {
          add_on_ids: string[] | null
          created_at: string
          expires_at: string
          id: string
          partner_code: string | null
          patient_data: Json
          service_price: number | null
          service_type: string
          slot_id: string
          status: string
          stripe_checkout_url: string | null
          stripe_session_id: string | null
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          add_on_ids?: string[] | null
          created_at?: string
          expires_at: string
          id?: string
          partner_code?: string | null
          patient_data: Json
          service_price?: number | null
          service_type: string
          slot_id: string
          status?: string
          stripe_checkout_url?: string | null
          stripe_session_id?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          add_on_ids?: string[] | null
          created_at?: string
          expires_at?: string
          id?: string
          partner_code?: string | null
          patient_data?: Json
          service_price?: number | null
          service_type?: string
          slot_id?: string
          status?: string
          stripe_checkout_url?: string | null
          stripe_session_id?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      booking_sync_failures: {
        Row: {
          created_at: string | null
          ghs_error: string | null
          ghs_status_code: number | null
          hold_id: string | null
          id: string
          payload: Json | null
          resolved: boolean | null
          retry_count: number | null
        }
        Insert: {
          created_at?: string | null
          ghs_error?: string | null
          ghs_status_code?: number | null
          hold_id?: string | null
          id?: string
          payload?: Json | null
          resolved?: boolean | null
          retry_count?: number | null
        }
        Update: {
          created_at?: string | null
          ghs_error?: string | null
          ghs_status_code?: number | null
          hold_id?: string | null
          id?: string
          payload?: Json | null
          resolved?: boolean | null
          retry_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_sync_failures_hold_id_fkey"
            columns: ["hold_id"]
            isOneToOne: false
            referencedRelation: "booking_holds"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          token: string
          used: boolean
          user_data: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          token: string
          used?: boolean
          user_data: Json
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          token?: string
          used?: boolean
          user_data?: Json
          user_id?: string
        }
        Relationships: []
      }
      campaign_items: {
        Row: {
          campaign_id: string | null
          created_at: string | null
          discount_percentage: number | null
          id: string
          panel_id: string | null
          test_id: string | null
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string | null
          discount_percentage?: number | null
          id?: string
          panel_id?: string | null
          test_id?: string | null
        }
        Update: {
          campaign_id?: string | null
          created_at?: string | null
          discount_percentage?: number | null
          id?: string
          panel_id?: string | null
          test_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_items_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "promotional_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_items_panel_id_fkey"
            columns: ["panel_id"]
            isOneToOne: false
            referencedRelation: "test_panels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_items_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "lab_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          sender_name: string
          sender_type: string
          session_id: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          sender_name: string
          sender_type: string
          session_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          sender_name?: string
          sender_type?: string
          session_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      checkout_sessions: {
        Row: {
          amount: number | null
          completed_at: string | null
          created_at: string
          currency: string | null
          id: string
          membership_id: string | null
          metadata: Json | null
          payment_status: string | null
          status: string
          stripe_customer_id: string | null
          stripe_session_id: string
          user_id: string | null
          webhook_received_at: string | null
        }
        Insert: {
          amount?: number | null
          completed_at?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          membership_id?: string | null
          metadata?: Json | null
          payment_status?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_session_id: string
          user_id?: string | null
          webhook_received_at?: string | null
        }
        Update: {
          amount?: number | null
          completed_at?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          membership_id?: string | null
          metadata?: Json | null
          payment_status?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_session_id?: string
          user_id?: string | null
          webhook_received_at?: string | null
        }
        Relationships: []
      }
      compliance_audits: {
        Row: {
          audit_name: string
          audit_type: string
          auditor_name: string
          completed_date: string | null
          corrective_actions: string | null
          created_at: string | null
          findings: string | null
          follow_up_date: string | null
          id: string
          recommendations: string | null
          scheduled_date: string
          status: Database["public"]["Enums"]["audit_status"] | null
          updated_at: string | null
        }
        Insert: {
          audit_name: string
          audit_type: string
          auditor_name: string
          completed_date?: string | null
          corrective_actions?: string | null
          created_at?: string | null
          findings?: string | null
          follow_up_date?: string | null
          id?: string
          recommendations?: string | null
          scheduled_date: string
          status?: Database["public"]["Enums"]["audit_status"] | null
          updated_at?: string | null
        }
        Update: {
          audit_name?: string
          audit_type?: string
          auditor_name?: string
          completed_date?: string | null
          corrective_actions?: string | null
          created_at?: string | null
          findings?: string | null
          follow_up_date?: string | null
          id?: string
          recommendations?: string | null
          scheduled_date?: string
          status?: Database["public"]["Enums"]["audit_status"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      compliance_documents: {
        Row: {
          approved_by: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          document_name: string
          document_path: string
          document_type: string
          effective_date: string
          expiration_date: string | null
          id: string
          review_date: string | null
          status: Database["public"]["Enums"]["document_status"] | null
          updated_at: string | null
          version: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          document_name: string
          document_path: string
          document_type: string
          effective_date: string
          expiration_date?: string | null
          id?: string
          review_date?: string | null
          status?: Database["public"]["Enums"]["document_status"] | null
          updated_at?: string | null
          version?: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          document_name?: string
          document_path?: string
          document_type?: string
          effective_date?: string
          expiration_date?: string | null
          id?: string
          review_date?: string | null
          status?: Database["public"]["Enums"]["document_status"] | null
          updated_at?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_documents_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      concierge_lab_messages: {
        Row: {
          collection_date: string
          created_at: string
          delivery_date: string
          doctor_id: string
          id: string
          lab_name: string
          notes: string | null
          patient_name: string
          read: boolean
          specimen_id: string
          status: string
          updated_at: string
        }
        Insert: {
          collection_date: string
          created_at?: string
          delivery_date: string
          doctor_id: string
          id?: string
          lab_name: string
          notes?: string | null
          patient_name: string
          read?: boolean
          specimen_id: string
          status: string
          updated_at?: string
        }
        Update: {
          collection_date?: string
          created_at?: string
          delivery_date?: string
          doctor_id?: string
          id?: string
          lab_name?: string
          notes?: string | null
          patient_name?: string
          read?: boolean
          specimen_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      conversion_alerts: {
        Row: {
          acknowledged_at: string | null
          alert_data: Json | null
          alert_type: string
          created_at: string | null
          id: string
          message: string
          resolved_at: string | null
          session_id: string | null
          severity: string
          title: string
          triggered_at: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          alert_data?: Json | null
          alert_type: string
          created_at?: string | null
          id?: string
          message: string
          resolved_at?: string | null
          session_id?: string | null
          severity?: string
          title: string
          triggered_at?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          alert_data?: Json | null
          alert_type?: string
          created_at?: string | null
          id?: string
          message?: string
          resolved_at?: string | null
          session_id?: string | null
          severity?: string
          title?: string
          triggered_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversion_alerts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "visitor_sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      conversion_events: {
        Row: {
          created_at: string
          event_type: string
          event_value: number | null
          experiment_id: string | null
          id: string
          metadata: Json | null
          session_id: string
          user_id: string | null
          variant: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          event_value?: number | null
          experiment_id?: string | null
          id?: string
          metadata?: Json | null
          session_id: string
          user_id?: string | null
          variant?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          event_value?: number | null
          experiment_id?: string | null
          id?: string
          metadata?: Json | null
          session_id?: string
          user_id?: string | null
          variant?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversion_events_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "ab_test_experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      conversion_funnel_events: {
        Row: {
          abandoned_at_stage: boolean | null
          converted_to_next_stage: boolean | null
          created_at: string | null
          event_data: Json | null
          id: string
          occurred_at: string | null
          session_id: string
          stage: string
          stage_order: number
          time_to_next_stage_seconds: number | null
        }
        Insert: {
          abandoned_at_stage?: boolean | null
          converted_to_next_stage?: boolean | null
          created_at?: string | null
          event_data?: Json | null
          id?: string
          occurred_at?: string | null
          session_id: string
          stage: string
          stage_order: number
          time_to_next_stage_seconds?: number | null
        }
        Update: {
          abandoned_at_stage?: boolean | null
          converted_to_next_stage?: boolean | null
          created_at?: string | null
          event_data?: Json | null
          id?: string
          occurred_at?: string | null
          session_id?: string
          stage?: string
          stage_order?: number
          time_to_next_stage_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "conversion_funnel_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "visitor_sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      corporate_accounts: {
        Row: {
          billing_address: Json | null
          company_name: string
          contact_email: string
          contact_name: string
          contact_phone: string | null
          corporate_id: string
          created_at: string
          employee_count: number | null
          id: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_plan: string
          updated_at: string
        }
        Insert: {
          billing_address?: Json | null
          company_name: string
          contact_email: string
          contact_name: string
          contact_phone?: string | null
          corporate_id: string
          created_at?: string
          employee_count?: number | null
          id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_plan?: string
          updated_at?: string
        }
        Update: {
          billing_address?: Json | null
          company_name?: string
          contact_email?: string
          contact_name?: string
          contact_phone?: string | null
          corporate_id?: string
          created_at?: string
          employee_count?: number | null
          id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_plan?: string
          updated_at?: string
        }
        Relationships: []
      }
      corporate_demo_requests: {
        Row: {
          company: string
          created_at: string
          email: string
          first_name: string
          id: string
          industry: string
          last_name: string
          message: string | null
          phone: string
          preferred_time: string
          status: string
        }
        Insert: {
          company: string
          created_at?: string
          email: string
          first_name: string
          id?: string
          industry: string
          last_name: string
          message?: string | null
          phone: string
          preferred_time: string
          status?: string
        }
        Update: {
          company?: string
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          industry?: string
          last_name?: string
          message?: string | null
          phone?: string
          preferred_time?: string
          status?: string
        }
        Relationships: []
      }
      corporate_employees: {
        Row: {
          corporate_account_id: string | null
          created_at: string
          email: string
          employee_id: string | null
          executive_upgrade: boolean
          id: string
          invitation_expires_at: string | null
          invitation_token: string | null
          member_id: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          corporate_account_id?: string | null
          created_at?: string
          email: string
          employee_id?: string | null
          executive_upgrade?: boolean
          id?: string
          invitation_expires_at?: string | null
          invitation_token?: string | null
          member_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          corporate_account_id?: string | null
          created_at?: string
          email?: string
          employee_id?: string | null
          executive_upgrade?: boolean
          id?: string
          invitation_expires_at?: string | null
          invitation_token?: string | null
          member_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "corporate_employees_corporate_account_id_fkey"
            columns: ["corporate_account_id"]
            isOneToOne: false
            referencedRelation: "corporate_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_notifications: {
        Row: {
          days_to_expiration: number | null
          email_sent: boolean | null
          id: string
          notification_type: string
          sent_at: string | null
          sms_sent: boolean | null
          threshold_percentage: number | null
          user_id: string
        }
        Insert: {
          days_to_expiration?: number | null
          email_sent?: boolean | null
          id?: string
          notification_type: string
          sent_at?: string | null
          sms_sent?: boolean | null
          threshold_percentage?: number | null
          user_id: string
        }
        Update: {
          days_to_expiration?: number | null
          email_sent?: boolean | null
          id?: string
          notification_type?: string
          sent_at?: string | null
          sms_sent?: boolean | null
          threshold_percentage?: number | null
          user_id?: string
        }
        Relationships: []
      }
      credit_packs: {
        Row: {
          credits_amount: number
          credits_remaining: number
          expires_at: string | null
          id: string
          is_active: boolean | null
          price: number
          purchase_date: string | null
          stripe_checkout_id: string | null
          stripe_payment_id: string | null
          user_id: string
        }
        Insert: {
          credits_amount: number
          credits_remaining: number
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          price: number
          purchase_date?: string | null
          stripe_checkout_id?: string | null
          stripe_payment_id?: string | null
          user_id: string
        }
        Update: {
          credits_amount?: number
          credits_remaining?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          price?: number
          purchase_date?: string | null
          stripe_checkout_id?: string | null
          stripe_payment_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      credit_pools: {
        Row: {
          created_at: string | null
          credits_total: number
          credits_used: number
          id: string
          next_renewal: string
          owner_id: string
          plan_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          credits_total: number
          credits_used?: number
          id?: string
          next_renewal: string
          owner_id: string
          plan_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          credits_total?: number
          credits_used?: number
          id?: string
          next_renewal?: string
          owner_id?: string
          plan_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_pools_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "membership_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      csv_upload_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_details: Json | null
          failed_rows: number | null
          file_name: string
          file_path: string
          id: string
          processed_rows: number | null
          status: string
          successful_rows: number | null
          total_rows: number | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_details?: Json | null
          failed_rows?: number | null
          file_name: string
          file_path: string
          id?: string
          processed_rows?: number | null
          status?: string
          successful_rows?: number | null
          total_rows?: number | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_details?: Json | null
          failed_rows?: number | null
          file_name?: string
          file_path?: string
          id?: string
          processed_rows?: number | null
          status?: string
          successful_rows?: number | null
          total_rows?: number | null
          user_id?: string
        }
        Relationships: []
      }
      delivery_logs: {
        Row: {
          appointment_id: string | null
          created_at: string | null
          delivery_time: string | null
          id: string
          lab_destination: string
          lab_id: string | null
          lab_tech_name: string | null
          phlebotomist_id: string
          shipping_slip_path: string | null
          updated_at: string | null
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string | null
          delivery_time?: string | null
          id?: string
          lab_destination: string
          lab_id?: string | null
          lab_tech_name?: string | null
          phlebotomist_id: string
          shipping_slip_path?: string | null
          updated_at?: string | null
        }
        Update: {
          appointment_id?: string | null
          created_at?: string | null
          delivery_time?: string | null
          id?: string
          lab_destination?: string
          lab_id?: string | null
          lab_tech_name?: string | null
          phlebotomist_id?: string
          shipping_slip_path?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_logs_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      distance_calculations: {
        Row: {
          calculated_at: string | null
          distance_miles: number
          from_lat: number
          from_lng: number
          id: string
          to_lat: number
          to_lng: number
          travel_time_seconds: number
        }
        Insert: {
          calculated_at?: string | null
          distance_miles: number
          from_lat: number
          from_lng: number
          id?: string
          to_lat: number
          to_lng: number
          travel_time_seconds: number
        }
        Update: {
          calculated_at?: string | null
          distance_miles?: number
          from_lat?: number
          from_lng?: number
          id?: string
          to_lat?: number
          to_lng?: number
          travel_time_seconds?: number
        }
        Relationships: []
      }
      doctor_patients: {
        Row: {
          active: boolean | null
          created_at: string | null
          doctor_id: string
          id: string
          patient_id: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          doctor_id: string
          id?: string
          patient_id: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          doctor_id?: string
          id?: string
          patient_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      document_acknowledgments: {
        Row: {
          acknowledged_at: string
          document_id: string
          id: string
          user_id: string
          version_acknowledged: number
        }
        Insert: {
          acknowledged_at?: string
          document_id: string
          id?: string
          user_id: string
          version_acknowledged: number
        }
        Update: {
          acknowledged_at?: string
          document_id?: string
          id?: string
          user_id?: string
          version_acknowledged?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_acknowledgments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      document_role_access: {
        Row: {
          created_at: string
          document_id: string
          id: string
          role: string
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          role: string
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_role_access_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          change_notes: string | null
          created_by: string | null
          document_id: string
          file_path: string
          id: string
          published_at: string
          version_number: number
        }
        Insert: {
          change_notes?: string | null
          created_by?: string | null
          document_id: string
          file_path: string
          id?: string
          published_at?: string
          version_number: number
        }
        Update: {
          change_notes?: string | null
          created_by?: string | null
          document_id?: string
          file_path?: string
          id?: string
          published_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          category_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          document_type: string
          file_path: string
          id: string
          is_draft: boolean
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_type: string
          file_path: string
          id?: string
          is_draft?: boolean
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_type?: string
          file_path?: string
          id?: string
          is_draft?: boolean
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "documents_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "document_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaigns: {
        Row: {
          campaign_name: string
          campaign_type: string
          created_at: string | null
          emails_clicked: number | null
          emails_delivered: number | null
          emails_opened: number | null
          emails_sent: number | null
          id: string
          status: string | null
          subject: string
          template_name: string
          total_recipients: number | null
          updated_at: string | null
        }
        Insert: {
          campaign_name: string
          campaign_type: string
          created_at?: string | null
          emails_clicked?: number | null
          emails_delivered?: number | null
          emails_opened?: number | null
          emails_sent?: number | null
          id?: string
          status?: string | null
          subject: string
          template_name: string
          total_recipients?: number | null
          updated_at?: string | null
        }
        Update: {
          campaign_name?: string
          campaign_type?: string
          created_at?: string | null
          emails_clicked?: number | null
          emails_delivered?: number | null
          emails_opened?: number | null
          emails_sent?: number | null
          id?: string
          status?: string | null
          subject?: string
          template_name?: string
          total_recipients?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      email_delivery_logs: {
        Row: {
          campaign_id: string | null
          clicked_at: string | null
          created_at: string | null
          delivery_status: string | null
          error_message: string | null
          id: string
          opened_at: string | null
          recipient_email: string
          sent_at: string | null
          subject: string
          user_id: string | null
        }
        Insert: {
          campaign_id?: string | null
          clicked_at?: string | null
          created_at?: string | null
          delivery_status?: string | null
          error_message?: string | null
          id?: string
          opened_at?: string | null
          recipient_email: string
          sent_at?: string | null
          subject: string
          user_id?: string | null
        }
        Update: {
          campaign_id?: string | null
          clicked_at?: string | null
          created_at?: string | null
          delivery_status?: string | null
          error_message?: string | null
          id?: string
          opened_at?: string | null
          recipient_email?: string
          sent_at?: string | null
          subject?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_delivery_logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          body_html: string
          body_text: string | null
          error_message: string | null
          id: string
          metadata: Json | null
          recipient_email: string
          sent_at: string
          status: string
          subject: string
          template_id: string | null
          user_id: string | null
        }
        Insert: {
          body_html: string
          body_text?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          recipient_email: string
          sent_at?: string
          status?: string
          subject: string
          template_id?: string | null
          user_id?: string | null
        }
        Update: {
          body_html?: string
          body_text?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          recipient_email?: string
          sent_at?: string
          status?: string
          subject?: string
          template_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_preferences: {
        Row: {
          appointment_reminders: boolean | null
          billing_notifications: boolean | null
          created_at: string
          id: string
          marketing_emails: boolean | null
          service_updates: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          appointment_reminders?: boolean | null
          billing_notifications?: boolean | null
          created_at?: string
          id?: string
          marketing_emails?: boolean | null
          service_updates?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          appointment_reminders?: boolean | null
          billing_notifications?: boolean | null
          created_at?: string
          id?: string
          marketing_emails?: boolean | null
          service_updates?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          created_at: string
          description: string | null
          html_template: string
          id: string
          name: string
          subject_template: string
          text_template: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          html_template: string
          id?: string
          name: string
          subject_template: string
          text_template?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          html_template?: string
          id?: string
          name?: string
          subject_template?: string
          text_template?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      franchise_analytics: {
        Row: {
          appointments_count: number | null
          compliance_score: number | null
          created_at: string | null
          customer_satisfaction: number | null
          date: string
          id: string
          member_visits: number | null
          new_members: number | null
          revenue: number | null
          staff_utilization: number | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          appointments_count?: number | null
          compliance_score?: number | null
          created_at?: string | null
          customer_satisfaction?: number | null
          date: string
          id?: string
          member_visits?: number | null
          new_members?: number | null
          revenue?: number | null
          staff_utilization?: number | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          appointments_count?: number | null
          compliance_score?: number | null
          created_at?: string | null
          customer_satisfaction?: number | null
          date?: string
          id?: string
          member_visits?: number | null
          new_members?: number | null
          revenue?: number | null
          staff_utilization?: number | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "franchise_analytics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      franchise_applications: {
        Row: {
          agreed_to_terms: boolean
          background: string
          created_at: string
          email: string
          estimated_budget: number
          full_name: string
          healthcare_experience: boolean
          id: string
          location: string
          phone: string
          resume_file_path: string | null
          status: string
        }
        Insert: {
          agreed_to_terms?: boolean
          background: string
          created_at?: string
          email: string
          estimated_budget: number
          full_name: string
          healthcare_experience: boolean
          id?: string
          location: string
          phone: string
          resume_file_path?: string | null
          status?: string
        }
        Update: {
          agreed_to_terms?: boolean
          background?: string
          created_at?: string
          email?: string
          estimated_budget?: number
          full_name?: string
          healthcare_experience?: boolean
          id?: string
          location?: string
          phone?: string
          resume_file_path?: string | null
          status?: string
        }
        Relationships: []
      }
      franchise_locations: {
        Row: {
          address_line1: string
          address_line2: string | null
          city: string
          country: string | null
          created_at: string | null
          email: string | null
          id: string
          is_active: boolean | null
          is_primary: boolean | null
          latitude: number | null
          longitude: number | null
          name: string
          phone: string | null
          service_radius_miles: number | null
          state: string
          tenant_id: string | null
          updated_at: string | null
          zip_code: string
        }
        Insert: {
          address_line1: string
          address_line2?: string | null
          city: string
          country?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          is_primary?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name: string
          phone?: string | null
          service_radius_miles?: number | null
          state: string
          tenant_id?: string | null
          updated_at?: string | null
          zip_code: string
        }
        Update: {
          address_line1?: string
          address_line2?: string | null
          city?: string
          country?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          is_primary?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name?: string
          phone?: string | null
          service_radius_miles?: number | null
          state?: string
          tenant_id?: string | null
          updated_at?: string | null
          zip_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "franchise_locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      franchise_onboarding_steps: {
        Row: {
          completed: boolean | null
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          description: string | null
          id: string
          order_index: number | null
          required: boolean | null
          step_category: string
          step_name: string
          tenant_id: string | null
          updated_at: string | null
          verification_data: Json | null
        }
        Insert: {
          completed?: boolean | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          order_index?: number | null
          required?: boolean | null
          step_category: string
          step_name: string
          tenant_id?: string | null
          updated_at?: string | null
          verification_data?: Json | null
        }
        Update: {
          completed?: boolean | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          order_index?: number | null
          required?: boolean | null
          step_category?: string
          step_name?: string
          tenant_id?: string | null
          updated_at?: string | null
          verification_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "franchise_onboarding_steps_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      franchise_owners: {
        Row: {
          address: string
          company_name: string
          contact_email: string
          contact_phone: string
          created_at: string
          id: string
          territory_ids: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          address: string
          company_name: string
          contact_email: string
          contact_phone: string
          created_at?: string
          id?: string
          territory_ids?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          address?: string
          company_name?: string
          contact_email?: string
          contact_phone?: string
          created_at?: string
          id?: string
          territory_ids?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      franchise_performance: {
        Row: {
          client_retention_rate: number | null
          created_at: string
          date: string
          franchise_owner_id: string
          id: string
          new_clients: number
          revenue: number
          services_count: number
          updated_at: string
        }
        Insert: {
          client_retention_rate?: number | null
          created_at?: string
          date: string
          franchise_owner_id: string
          id?: string
          new_clients: number
          revenue: number
          services_count: number
          updated_at?: string
        }
        Update: {
          client_retention_rate?: number | null
          created_at?: string
          date?: string
          franchise_owner_id?: string
          id?: string
          new_clients?: number
          revenue?: number
          services_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "franchise_performance_franchise_owner_id_fkey"
            columns: ["franchise_owner_id"]
            isOneToOne: false
            referencedRelation: "franchise_owners"
            referencedColumns: ["id"]
          },
        ]
      }
      franchise_staff: {
        Row: {
          created_at: string
          email: string
          franchise_owner_id: string
          full_name: string
          id: string
          role: string
          territory_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          franchise_owner_id: string
          full_name: string
          id?: string
          role: string
          territory_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          franchise_owner_id?: string
          full_name?: string
          id?: string
          role?: string
          territory_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "franchise_staff_franchise_owner_id_fkey"
            columns: ["franchise_owner_id"]
            isOneToOne: false
            referencedRelation: "franchise_owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "franchise_staff_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "territories"
            referencedColumns: ["id"]
          },
        ]
      }
      franchise_staff_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          email: string
          expires_at: string
          first_name: string | null
          id: string
          invitation_token: string
          invited_by: string
          last_name: string | null
          onboarding_completed: boolean | null
          phone: string | null
          role: string
          status: string | null
          tenant_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          email: string
          expires_at: string
          first_name?: string | null
          id?: string
          invitation_token: string
          invited_by: string
          last_name?: string | null
          onboarding_completed?: boolean | null
          phone?: string | null
          role: string
          status?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          email?: string
          expires_at?: string
          first_name?: string | null
          id?: string
          invitation_token?: string
          invited_by?: string
          last_name?: string | null
          onboarding_completed?: boolean | null
          phone?: string | null
          role?: string
          status?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "franchise_staff_invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      franchise_territories: {
        Row: {
          cities: string[] | null
          created_at: string | null
          description: string | null
          geographic_boundaries: Json | null
          id: string
          is_active: boolean | null
          name: string
          states: string[] | null
          updated_at: string | null
          zip_codes: string[] | null
        }
        Insert: {
          cities?: string[] | null
          created_at?: string | null
          description?: string | null
          geographic_boundaries?: Json | null
          id?: string
          is_active?: boolean | null
          name: string
          states?: string[] | null
          updated_at?: string | null
          zip_codes?: string[] | null
        }
        Update: {
          cities?: string[] | null
          created_at?: string | null
          description?: string | null
          geographic_boundaries?: Json | null
          id?: string
          is_active?: boolean | null
          name?: string
          states?: string[] | null
          updated_at?: string | null
          zip_codes?: string[] | null
        }
        Relationships: []
      }
      ghs_webhook_events: {
        Row: {
          booking_id: string | null
          error_message: string | null
          event_id: string
          event_type: string
          id: string
          payload_json: Json | null
          processed_at: string | null
          processed_status: string
          received_at: string | null
          retry_count: number | null
        }
        Insert: {
          booking_id?: string | null
          error_message?: string | null
          event_id: string
          event_type: string
          id?: string
          payload_json?: Json | null
          processed_at?: string | null
          processed_status?: string
          received_at?: string | null
          retry_count?: number | null
        }
        Update: {
          booking_id?: string | null
          error_message?: string | null
          event_id?: string
          event_type?: string
          id?: string
          payload_json?: Json | null
          processed_at?: string | null
          processed_status?: string
          received_at?: string | null
          retry_count?: number | null
        }
        Relationships: []
      }
      health_action_plans: {
        Row: {
          action_items: Json
          created_at: string
          description: string | null
          id: string
          status: string
          target_date: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action_items?: Json
          created_at?: string
          description?: string | null
          id?: string
          status?: string
          target_date?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action_items?: Json
          created_at?: string
          description?: string | null
          id?: string
          status?: string
          target_date?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      health_chat_history: {
        Row: {
          content: string
          created_at: string
          id: string
          lab_result_id: string | null
          message_type: string
          session_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          lab_result_id?: string | null
          message_type: string
          session_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          lab_result_id?: string | null
          message_type?: string
          session_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      health_insights: {
        Row: {
          content: string
          created_at: string
          id: string
          insight_type: string
          is_read: boolean | null
          lab_result_id: string
          priority: number | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          insight_type: string
          is_read?: boolean | null
          lab_result_id: string
          priority?: number | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          insight_type?: string
          is_read?: boolean | null
          lab_result_id?: string
          priority?: number | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_insights_lab_result_id_fkey"
            columns: ["lab_result_id"]
            isOneToOne: false
            referencedRelation: "lab_results"
            referencedColumns: ["id"]
          },
        ]
      }
      high_value_lead_alerts: {
        Row: {
          acknowledged_at: string | null
          alert_type: string
          assigned_to: string | null
          created_at: string
          id: string
          lead_profile_id: string
          message: string
          potential_revenue: number | null
          recommended_action: string | null
          resolved_at: string | null
          risk_level: string | null
          severity: string | null
          title: string
          urgency_level: number | null
        }
        Insert: {
          acknowledged_at?: string | null
          alert_type: string
          assigned_to?: string | null
          created_at?: string
          id?: string
          lead_profile_id: string
          message: string
          potential_revenue?: number | null
          recommended_action?: string | null
          resolved_at?: string | null
          risk_level?: string | null
          severity?: string | null
          title: string
          urgency_level?: number | null
        }
        Update: {
          acknowledged_at?: string | null
          alert_type?: string
          assigned_to?: string | null
          created_at?: string
          id?: string
          lead_profile_id?: string
          message?: string
          potential_revenue?: number | null
          recommended_action?: string | null
          resolved_at?: string | null
          risk_level?: string | null
          severity?: string | null
          title?: string
          urgency_level?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "high_value_lead_alerts_lead_profile_id_fkey"
            columns: ["lead_profile_id"]
            isOneToOne: false
            referencedRelation: "lead_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          created_at: string | null
          current_quantity: number
          id: string
          name: string
          reorder_threshold: number
          unit_size: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_quantity?: number
          id?: string
          name: string
          reorder_threshold: number
          unit_size: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_quantity?: number
          id?: string
          name?: string
          reorder_threshold?: number
          unit_size?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      inventory_usage: {
        Row: {
          appointment_id: string
          created_at: string | null
          id: string
          item_id: string
          phlebotomist_id: string
          quantity_used: number
        }
        Insert: {
          appointment_id: string
          created_at?: string | null
          id?: string
          item_id: string
          phlebotomist_id: string
          quantity_used: number
        }
        Update: {
          appointment_id?: string
          created_at?: string | null
          id?: string
          item_id?: string
          phlebotomist_id?: string
          quantity_used?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_usage_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_usage_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_result_requests: {
        Row: {
          admin_processed_by: string | null
          created_at: string
          email_sent_at: string | null
          id: string
          notes: string | null
          processed_at: string | null
          requested_at: string
          result_file_name: string | null
          result_file_path: string | null
          sms_sent_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_processed_by?: string | null
          created_at?: string
          email_sent_at?: string | null
          id?: string
          notes?: string | null
          processed_at?: string | null
          requested_at?: string
          result_file_name?: string | null
          result_file_path?: string | null
          sms_sent_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_processed_by?: string | null
          created_at?: string
          email_sent_at?: string | null
          id?: string
          notes?: string | null
          processed_at?: string | null
          requested_at?: string
          result_file_name?: string | null
          result_file_path?: string | null
          sms_sent_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lab_results: {
        Row: {
          appointment_id: string | null
          created_at: string
          id: string
          lab_name: string | null
          notes: string | null
          optimal_range_max: number | null
          optimal_range_min: number | null
          reference_range_max: number | null
          reference_range_min: number | null
          status: string
          test_category: string
          test_date: string
          test_name: string
          unit: string
          updated_at: string
          uploaded_at: string
          user_id: string
          user_value: number
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          id?: string
          lab_name?: string | null
          notes?: string | null
          optimal_range_max?: number | null
          optimal_range_min?: number | null
          reference_range_max?: number | null
          reference_range_min?: number | null
          status: string
          test_category: string
          test_date: string
          test_name: string
          unit: string
          updated_at?: string
          uploaded_at?: string
          user_id: string
          user_value: number
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          id?: string
          lab_name?: string | null
          notes?: string | null
          optimal_range_max?: number | null
          optimal_range_min?: number | null
          reference_range_max?: number | null
          reference_range_min?: number | null
          status?: string
          test_category?: string
          test_date?: string
          test_name?: string
          unit?: string
          updated_at?: string
          uploaded_at?: string
          user_id?: string
          user_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "lab_results_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_test_purchase_items: {
        Row: {
          created_at: string | null
          id: string
          panel_id: string | null
          purchase_id: string | null
          quantity: number | null
          test_id: string | null
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          panel_id?: string | null
          purchase_id?: string | null
          quantity?: number | null
          test_id?: string | null
          unit_price: number
        }
        Update: {
          created_at?: string | null
          id?: string
          panel_id?: string | null
          purchase_id?: string | null
          quantity?: number | null
          test_id?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "lab_test_purchase_items_panel_id_fkey"
            columns: ["panel_id"]
            isOneToOne: false
            referencedRelation: "test_panels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_test_purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "lab_test_purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_test_purchase_items_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "lab_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_test_purchases: {
        Row: {
          appointment_scheduled: boolean | null
          created_at: string | null
          id: string
          payment_status: string | null
          status: string | null
          stripe_payment_intent_id: string | null
          total_amount: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          appointment_scheduled?: boolean | null
          created_at?: string | null
          id?: string
          payment_status?: string | null
          status?: string | null
          stripe_payment_intent_id?: string | null
          total_amount: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          appointment_scheduled?: boolean | null
          created_at?: string | null
          id?: string
          payment_status?: string | null
          status?: string | null
          stripe_payment_intent_id?: string | null
          total_amount?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      lab_tests: {
        Row: {
          base_price: number
          category_id: string | null
          created_at: string | null
          description: string | null
          fasting_required: boolean | null
          id: string
          is_active: boolean | null
          lab_compatibility: string[] | null
          member_price: number | null
          popularity_score: number | null
          preparation_instructions: string | null
          specimen_type: string | null
          test_code: string
          test_meaning: string | null
          test_name: string
          turnaround_time_days: number | null
          updated_at: string | null
        }
        Insert: {
          base_price: number
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          fasting_required?: boolean | null
          id?: string
          is_active?: boolean | null
          lab_compatibility?: string[] | null
          member_price?: number | null
          popularity_score?: number | null
          preparation_instructions?: string | null
          specimen_type?: string | null
          test_code: string
          test_meaning?: string | null
          test_name: string
          turnaround_time_days?: number | null
          updated_at?: string | null
        }
        Update: {
          base_price?: number
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          fasting_required?: boolean | null
          id?: string
          is_active?: boolean | null
          lab_compatibility?: string[] | null
          member_price?: number | null
          popularity_score?: number | null
          preparation_instructions?: string | null
          specimen_type?: string | null
          test_code?: string
          test_meaning?: string | null
          test_name?: string
          turnaround_time_days?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lab_tests_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "test_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_follow_up_actions: {
        Row: {
          action_type: string
          conversion_value: number | null
          converted_to_booking: boolean | null
          created_at: string
          executed_at: string | null
          id: string
          lead_profile_id: string
          message_content: string | null
          offer_type: string | null
          offer_value: string | null
          priority: string | null
          response_received: boolean | null
          status: string | null
          subject_line: string | null
          trigger_stage: string
        }
        Insert: {
          action_type: string
          conversion_value?: number | null
          converted_to_booking?: boolean | null
          created_at?: string
          executed_at?: string | null
          id?: string
          lead_profile_id: string
          message_content?: string | null
          offer_type?: string | null
          offer_value?: string | null
          priority?: string | null
          response_received?: boolean | null
          status?: string | null
          subject_line?: string | null
          trigger_stage: string
        }
        Update: {
          action_type?: string
          conversion_value?: number | null
          converted_to_booking?: boolean | null
          created_at?: string
          executed_at?: string | null
          id?: string
          lead_profile_id?: string
          message_content?: string | null
          offer_type?: string | null
          offer_value?: string | null
          priority?: string | null
          response_received?: boolean | null
          status?: string | null
          subject_line?: string | null
          trigger_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_follow_up_actions_lead_profile_id_fkey"
            columns: ["lead_profile_id"]
            isOneToOne: false
            referencedRelation: "lead_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_profiles: {
        Row: {
          abandoned_booking: boolean | null
          behavioral_score: number | null
          clicked_book_now: boolean | null
          conversion_probability: number | null
          created_at: string
          demographic_score: number | null
          device_type: string | null
          follow_up_stage: string | null
          id: string
          intent_score: number | null
          ip_address: unknown
          landing_page: string | null
          last_follow_up_at: string | null
          last_interaction_at: string | null
          lead_grade: string | null
          location_city: string | null
          location_country: string | null
          location_state: string | null
          location_zipcode: string | null
          predicted_ltv: number | null
          pricing_page_viewed: boolean | null
          recommended_service: string | null
          referrer: string | null
          services_viewed: string[] | null
          session_id: string
          started_pre_qualification: boolean | null
          total_page_views: number | null
          total_score: number | null
          total_time_seconds: number | null
          traffic_source: string | null
          updated_at: string
          user_id: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          wealth_index: number | null
        }
        Insert: {
          abandoned_booking?: boolean | null
          behavioral_score?: number | null
          clicked_book_now?: boolean | null
          conversion_probability?: number | null
          created_at?: string
          demographic_score?: number | null
          device_type?: string | null
          follow_up_stage?: string | null
          id?: string
          intent_score?: number | null
          ip_address?: unknown
          landing_page?: string | null
          last_follow_up_at?: string | null
          last_interaction_at?: string | null
          lead_grade?: string | null
          location_city?: string | null
          location_country?: string | null
          location_state?: string | null
          location_zipcode?: string | null
          predicted_ltv?: number | null
          pricing_page_viewed?: boolean | null
          recommended_service?: string | null
          referrer?: string | null
          services_viewed?: string[] | null
          session_id: string
          started_pre_qualification?: boolean | null
          total_page_views?: number | null
          total_score?: number | null
          total_time_seconds?: number | null
          traffic_source?: string | null
          updated_at?: string
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          wealth_index?: number | null
        }
        Update: {
          abandoned_booking?: boolean | null
          behavioral_score?: number | null
          clicked_book_now?: boolean | null
          conversion_probability?: number | null
          created_at?: string
          demographic_score?: number | null
          device_type?: string | null
          follow_up_stage?: string | null
          id?: string
          intent_score?: number | null
          ip_address?: unknown
          landing_page?: string | null
          last_follow_up_at?: string | null
          last_interaction_at?: string | null
          lead_grade?: string | null
          location_city?: string | null
          location_country?: string | null
          location_state?: string | null
          location_zipcode?: string | null
          predicted_ltv?: number | null
          pricing_page_viewed?: boolean | null
          recommended_service?: string | null
          referrer?: string | null
          services_viewed?: string[] | null
          session_id?: string
          started_pre_qualification?: boolean | null
          total_page_views?: number | null
          total_score?: number | null
          total_time_seconds?: number | null
          traffic_source?: string | null
          updated_at?: string
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          wealth_index?: number | null
        }
        Relationships: []
      }
      lead_scoring_events: {
        Row: {
          behavioral_points: number | null
          created_at: string
          demographic_points: number | null
          event_data: Json | null
          event_type: string
          id: string
          intent_points: number | null
          lead_profile_id: string
          page_path: string | null
          service_name: string | null
          session_id: string
          time_spent_seconds: number | null
        }
        Insert: {
          behavioral_points?: number | null
          created_at?: string
          demographic_points?: number | null
          event_data?: Json | null
          event_type: string
          id?: string
          intent_points?: number | null
          lead_profile_id: string
          page_path?: string | null
          service_name?: string | null
          session_id: string
          time_spent_seconds?: number | null
        }
        Update: {
          behavioral_points?: number | null
          created_at?: string
          demographic_points?: number | null
          event_data?: Json | null
          event_type?: string
          id?: string
          intent_points?: number | null
          lead_profile_id?: string
          page_path?: string | null
          service_name?: string | null
          session_id?: string
          time_spent_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_scoring_events_lead_profile_id_fkey"
            columns: ["lead_profile_id"]
            isOneToOne: false
            referencedRelation: "lead_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_source_performance: {
        Row: {
          avg_lead_score: number | null
          avg_order_value_cents: number | null
          avg_time_on_site: number | null
          bounce_rate: number | null
          cold_leads: number | null
          conversion_rate: number | null
          cost_per_acquisition_cents: number | null
          created_at: string
          date: string
          hot_leads: number | null
          hour: number
          id: string
          landing_page: string | null
          predicted_monthly_bookings: number | null
          predicted_monthly_revenue_cents: number | null
          roi_percentage: number | null
          total_bookings: number | null
          total_revenue_cents: number | null
          total_visitors: number | null
          traffic_source: string
          unique_visitors: number | null
          updated_at: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          warm_leads: number | null
        }
        Insert: {
          avg_lead_score?: number | null
          avg_order_value_cents?: number | null
          avg_time_on_site?: number | null
          bounce_rate?: number | null
          cold_leads?: number | null
          conversion_rate?: number | null
          cost_per_acquisition_cents?: number | null
          created_at?: string
          date?: string
          hot_leads?: number | null
          hour?: number
          id?: string
          landing_page?: string | null
          predicted_monthly_bookings?: number | null
          predicted_monthly_revenue_cents?: number | null
          roi_percentage?: number | null
          total_bookings?: number | null
          total_revenue_cents?: number | null
          total_visitors?: number | null
          traffic_source: string
          unique_visitors?: number | null
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          warm_leads?: number | null
        }
        Update: {
          avg_lead_score?: number | null
          avg_order_value_cents?: number | null
          avg_time_on_site?: number | null
          bounce_rate?: number | null
          cold_leads?: number | null
          conversion_rate?: number | null
          cost_per_acquisition_cents?: number | null
          created_at?: string
          date?: string
          hot_leads?: number | null
          hour?: number
          id?: string
          landing_page?: string | null
          predicted_monthly_bookings?: number | null
          predicted_monthly_revenue_cents?: number | null
          roi_percentage?: number | null
          total_bookings?: number | null
          total_revenue_cents?: number | null
          total_visitors?: number | null
          traffic_source?: string
          unique_visitors?: number | null
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          warm_leads?: number | null
        }
        Relationships: []
      }
      member_location_preferences: {
        Row: {
          allowed_tenant_ids: string[] | null
          auto_select_nearest: boolean | null
          created_at: string | null
          id: string
          last_used_tenant_id: string | null
          preferred_tenant_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          allowed_tenant_ids?: string[] | null
          auto_select_nearest?: boolean | null
          created_at?: string | null
          id?: string
          last_used_tenant_id?: string | null
          preferred_tenant_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          allowed_tenant_ids?: string[] | null
          auto_select_nearest?: boolean | null
          created_at?: string | null
          id?: string
          last_used_tenant_id?: string | null
          preferred_tenant_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_location_preferences_last_used_tenant_id_fkey"
            columns: ["last_used_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_location_preferences_preferred_tenant_id_fkey"
            columns: ["preferred_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      "membership plans": {
        Row: {
          active: boolean | null
          attrs: Json | null
          created: string | null
          default_price: string | null
          description: string | null
          id: string | null
          name: string | null
          updated: string | null
        }
        Insert: {
          active?: boolean | null
          attrs?: Json | null
          created?: string | null
          default_price?: string | null
          description?: string | null
          id?: string | null
          name?: string | null
          updated?: string | null
        }
        Update: {
          active?: boolean | null
          attrs?: Json | null
          created?: string | null
          default_price?: string | null
          description?: string | null
          id?: string | null
          name?: string | null
          updated?: string | null
        }
        Relationships: []
      }
      membership_plans: {
        Row: {
          annual_price: number
          created_at: string | null
          credits_per_year: number
          description: string | null
          id: string
          is_concierge_plan: boolean
          is_essential_care: boolean
          is_family_plan: boolean
          max_users: number
          monthly_price: number
          name: string
          quarterly_price: number
          stripe_annual_price_id: string | null
          stripe_monthly_price_id: string | null
          stripe_quarterly_price_id: string | null
          stripe_supernova_annual_price_id: string | null
          supernova_annual_price: number | null
          updated_at: string | null
        }
        Insert: {
          annual_price: number
          created_at?: string | null
          credits_per_year: number
          description?: string | null
          id?: string
          is_concierge_plan?: boolean
          is_essential_care?: boolean
          is_family_plan?: boolean
          max_users?: number
          monthly_price: number
          name: string
          quarterly_price: number
          stripe_annual_price_id?: string | null
          stripe_monthly_price_id?: string | null
          stripe_quarterly_price_id?: string | null
          stripe_supernova_annual_price_id?: string | null
          supernova_annual_price?: number | null
          updated_at?: string | null
        }
        Update: {
          annual_price?: number
          created_at?: string | null
          credits_per_year?: number
          description?: string | null
          id?: string
          is_concierge_plan?: boolean
          is_essential_care?: boolean
          is_family_plan?: boolean
          max_users?: number
          monthly_price?: number
          name?: string
          quarterly_price?: number
          stripe_annual_price_id?: string | null
          stripe_monthly_price_id?: string | null
          stripe_quarterly_price_id?: string | null
          stripe_supernova_annual_price_id?: string | null
          supernova_annual_price?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      memberships: {
        Row: {
          canceled_at: string | null
          created_at: string | null
          current_period_end: string | null
          id: string
          is_active: boolean | null
          status: string | null
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_product_id: string | null
          stripe_subscription_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          canceled_at?: string | null
          created_at?: string | null
          current_period_end?: string | null
          id?: string
          is_active?: boolean | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          canceled_at?: string | null
          created_at?: string | null
          current_period_end?: string | null
          id?: string
          is_active?: boolean | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      "New Cust": {
        Row: {
          attrs: Json | null
          created: string | null
          description: string | null
          email: string | null
          id: string | null
          name: string | null
        }
        Insert: {
          attrs?: Json | null
          created?: string | null
          description?: string | null
          email?: string | null
          id?: string | null
          name?: string | null
        }
        Update: {
          attrs?: Json | null
          created?: string | null
          description?: string | null
          email?: string | null
          id?: string | null
          name?: string | null
        }
        Relationships: []
      }
      notification_logs: {
        Row: {
          created_at: string | null
          delivery_confirmed_at: string | null
          error_message: string | null
          id: string
          message: string
          metadata: Json | null
          notification_type: string
          recipient_email: string | null
          recipient_id: string | null
          recipient_phone: string | null
          recipient_type: string
          sent_at: string | null
          status: string
          subject: string | null
        }
        Insert: {
          created_at?: string | null
          delivery_confirmed_at?: string | null
          error_message?: string | null
          id?: string
          message: string
          metadata?: Json | null
          notification_type: string
          recipient_email?: string | null
          recipient_id?: string | null
          recipient_phone?: string | null
          recipient_type: string
          sent_at?: string | null
          status?: string
          subject?: string | null
        }
        Update: {
          created_at?: string | null
          delivery_confirmed_at?: string | null
          error_message?: string | null
          id?: string
          message?: string
          metadata?: Json | null
          notification_type?: string
          recipient_email?: string | null
          recipient_id?: string | null
          recipient_phone?: string | null
          recipient_type?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
        }
        Relationships: []
      }
      notification_test_logs: {
        Row: {
          admin_user_id: string
          created_at: string
          error_message: string | null
          id: string
          notification_types: string[]
          results: Json | null
          status: string
          test_email: string
          test_phone: string | null
        }
        Insert: {
          admin_user_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          notification_types: string[]
          results?: Json | null
          status?: string
          test_email: string
          test_phone?: string | null
        }
        Update: {
          admin_user_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          notification_types?: string[]
          results?: Json | null
          status?: string
          test_email?: string
          test_phone?: string | null
        }
        Relationships: []
      }
      organizational_assignments: {
        Row: {
          assigned_manager_id: string | null
          created_at: string
          end_date: string | null
          hourly_rate: number | null
          id: string
          is_primary_assignment: boolean
          organizational_level_id: string
          role_definition_id: string
          staff_id: string
          start_date: string
          territory_coverage: string[] | null
          updated_at: string
        }
        Insert: {
          assigned_manager_id?: string | null
          created_at?: string
          end_date?: string | null
          hourly_rate?: number | null
          id?: string
          is_primary_assignment?: boolean
          organizational_level_id: string
          role_definition_id: string
          staff_id: string
          start_date?: string
          territory_coverage?: string[] | null
          updated_at?: string
        }
        Update: {
          assigned_manager_id?: string | null
          created_at?: string
          end_date?: string | null
          hourly_rate?: number | null
          id?: string
          is_primary_assignment?: boolean
          organizational_level_id?: string
          role_definition_id?: string
          staff_id?: string
          start_date?: string
          territory_coverage?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizational_assignments_assigned_manager_id_fkey"
            columns: ["assigned_manager_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizational_assignments_organizational_level_id_fkey"
            columns: ["organizational_level_id"]
            isOneToOne: false
            referencedRelation: "organizational_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizational_assignments_role_definition_id_fkey"
            columns: ["role_definition_id"]
            isOneToOne: false
            referencedRelation: "staff_role_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizational_assignments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizational_levels: {
        Row: {
          city_name: string | null
          created_at: string
          district_code: string | null
          id: string
          is_active: boolean
          level_type: Database["public"]["Enums"]["organizational_level"]
          name: string
          parent_level_id: string | null
          region_code: string | null
          state_code: string | null
          updated_at: string
        }
        Insert: {
          city_name?: string | null
          created_at?: string
          district_code?: string | null
          id?: string
          is_active?: boolean
          level_type: Database["public"]["Enums"]["organizational_level"]
          name: string
          parent_level_id?: string | null
          region_code?: string | null
          state_code?: string | null
          updated_at?: string
        }
        Update: {
          city_name?: string | null
          created_at?: string
          district_code?: string | null
          id?: string
          is_active?: boolean
          level_type?: Database["public"]["Enums"]["organizational_level"]
          name?: string
          parent_level_id?: string | null
          region_code?: string | null
          state_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizational_levels_parent_level_id_fkey"
            columns: ["parent_level_id"]
            isOneToOne: false
            referencedRelation: "organizational_levels"
            referencedColumns: ["id"]
          },
        ]
      }
      page_view_events: {
        Row: {
          bounce: boolean | null
          clicks_count: number | null
          created_at: string | null
          exit_page: boolean | null
          form_interactions: number | null
          id: string
          page_path: string
          page_title: string | null
          referrer: string | null
          scroll_depth_percentage: number | null
          session_id: string
          time_on_page_seconds: number | null
          viewed_at: string | null
        }
        Insert: {
          bounce?: boolean | null
          clicks_count?: number | null
          created_at?: string | null
          exit_page?: boolean | null
          form_interactions?: number | null
          id?: string
          page_path: string
          page_title?: string | null
          referrer?: string | null
          scroll_depth_percentage?: number | null
          session_id: string
          time_on_page_seconds?: number | null
          viewed_at?: string | null
        }
        Update: {
          bounce?: boolean | null
          clicks_count?: number | null
          created_at?: string | null
          exit_page?: boolean | null
          form_interactions?: number | null
          id?: string
          page_path?: string
          page_title?: string | null
          referrer?: string | null
          scroll_depth_percentage?: number | null
          session_id?: string
          time_on_page_seconds?: number | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "page_view_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "visitor_sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      page_views: {
        Row: {
          city: string | null
          country: string | null
          created_at: string | null
          id: string
          ip_address: unknown
          latitude: number | null
          longitude: number | null
          path: string
          referrer: string | null
          session_id: string | null
          state: string | null
          time_on_page: number | null
          user_agent: string | null
          user_id: string | null
          zip_code: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string | null
          id?: string
          ip_address?: unknown
          latitude?: number | null
          longitude?: number | null
          path: string
          referrer?: string | null
          session_id?: string | null
          state?: string | null
          time_on_page?: number | null
          user_agent?: string | null
          user_id?: string | null
          zip_code?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string | null
          id?: string
          ip_address?: unknown
          latitude?: number | null
          longitude?: number | null
          path?: string
          referrer?: string | null
          session_id?: string | null
          state?: string | null
          time_on_page?: number | null
          user_agent?: string | null
          user_id?: string | null
          zip_code?: string | null
        }
        Relationships: []
      }
      panel_tests: {
        Row: {
          created_at: string | null
          id: string
          panel_id: string | null
          test_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          panel_id?: string | null
          test_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          panel_id?: string | null
          test_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "panel_tests_panel_id_fkey"
            columns: ["panel_id"]
            isOneToOne: false
            referencedRelation: "test_panels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "panel_tests_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "lab_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      partnership_onboarding: {
        Row: {
          additional_notes: string | null
          contact_email: string
          contact_phone: string
          created_at: string
          id: string
          logo_path: string | null
          number_of_staff_accounts: number
          practice_description: string
          practice_name: string
          preferred_domain: string
          primary_color: string
          secondary_color: string
          services: string
          session_id: string | null
          status: string
          submission_date: string
        }
        Insert: {
          additional_notes?: string | null
          contact_email: string
          contact_phone: string
          created_at?: string
          id?: string
          logo_path?: string | null
          number_of_staff_accounts?: number
          practice_description: string
          practice_name: string
          preferred_domain: string
          primary_color: string
          secondary_color: string
          services: string
          session_id?: string | null
          status?: string
          submission_date?: string
        }
        Update: {
          additional_notes?: string | null
          contact_email?: string
          contact_phone?: string
          created_at?: string
          id?: string
          logo_path?: string | null
          number_of_staff_accounts?: number
          practice_description?: string
          practice_name?: string
          preferred_domain?: string
          primary_color?: string
          secondary_color?: string
          services?: string
          session_id?: string | null
          status?: string
          submission_date?: string
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          account_details: Json | null
          created_at: string
          id: string
          is_default: boolean | null
          method_type: string
          staff_profile_id: string
          stripe_account_id: string | null
          updated_at: string
        }
        Insert: {
          account_details?: Json | null
          created_at?: string
          id?: string
          is_default?: boolean | null
          method_type: string
          staff_profile_id: string
          stripe_account_id?: string | null
          updated_at?: string
        }
        Update: {
          account_details?: Json | null
          created_at?: string
          id?: string
          is_default?: boolean | null
          method_type?: string
          staff_profile_id?: string
          stripe_account_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_staff_profile_id_fkey"
            columns: ["staff_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number | null
          created_at: string | null
          currency: string | null
          email: string | null
          id: number
          metadata: Json | null
          payment_intent: string | null
          session_id: string | null
          status: string | null
          stripe_customer_id: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          currency?: string | null
          email?: string | null
          id?: never
          metadata?: Json | null
          payment_intent?: string | null
          session_id?: string | null
          status?: string | null
          stripe_customer_id?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          currency?: string | null
          email?: string | null
          id?: never
          metadata?: Json | null
          payment_intent?: string | null
          session_id?: string | null
          status?: string | null
          stripe_customer_id?: string | null
        }
        Relationships: []
      }
      payouts: {
        Row: {
          amount: number | null
          arrival_date: string | null
          attrs: Json | null
          created: string | null
          currency: string | null
          description: string | null
          id: string | null
          statement_descriptor: string | null
          status: string | null
        }
        Insert: {
          amount?: number | null
          arrival_date?: string | null
          attrs?: Json | null
          created?: string | null
          currency?: string | null
          description?: string | null
          id?: string | null
          statement_descriptor?: string | null
          status?: string | null
        }
        Update: {
          amount?: number | null
          arrival_date?: string | null
          attrs?: Json | null
          created?: string | null
          currency?: string | null
          description?: string | null
          id?: string | null
          statement_descriptor?: string | null
          status?: string | null
        }
        Relationships: []
      }
      payroll_entries: {
        Row: {
          amount: number
          appointments_completed: number | null
          created_at: string
          hours_worked: number | null
          id: string
          notes: string | null
          payment_date: string | null
          payment_method_id: string | null
          payment_reference: string | null
          payroll_period_id: string
          staff_profile_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          appointments_completed?: number | null
          created_at?: string
          hours_worked?: number | null
          id?: string
          notes?: string | null
          payment_date?: string | null
          payment_method_id?: string | null
          payment_reference?: string | null
          payroll_period_id: string
          staff_profile_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          appointments_completed?: number | null
          created_at?: string
          hours_worked?: number | null
          id?: string
          notes?: string | null
          payment_date?: string | null
          payment_method_id?: string | null
          payment_reference?: string | null
          payroll_period_id?: string
          staff_profile_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_entries_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_entries_payroll_period_id_fkey"
            columns: ["payroll_period_id"]
            isOneToOne: false
            referencedRelation: "payroll_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_entries_staff_profile_id_fkey"
            columns: ["staff_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_periods: {
        Row: {
          created_at: string
          id: string
          payment_date: string
          period_end: string
          period_start: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          payment_date: string
          period_end: string
          period_start: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          payment_date?: string
          period_end?: string
          period_start?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      performance_reviews: {
        Row: {
          action_plan: string | null
          areas_for_improvement: string | null
          communication_rating: number | null
          created_at: string | null
          goals: string | null
          id: string
          next_review_date: string | null
          overall_rating: number | null
          professionalism_rating: number | null
          punctuality_rating: number | null
          review_period_end: string
          review_period_start: string
          reviewer_id: string | null
          staff_profile_id: string | null
          status: string | null
          strengths: string | null
          technical_skills_rating: number | null
          updated_at: string | null
        }
        Insert: {
          action_plan?: string | null
          areas_for_improvement?: string | null
          communication_rating?: number | null
          created_at?: string | null
          goals?: string | null
          id?: string
          next_review_date?: string | null
          overall_rating?: number | null
          professionalism_rating?: number | null
          punctuality_rating?: number | null
          review_period_end: string
          review_period_start: string
          reviewer_id?: string | null
          staff_profile_id?: string | null
          status?: string | null
          strengths?: string | null
          technical_skills_rating?: number | null
          updated_at?: string | null
        }
        Update: {
          action_plan?: string | null
          areas_for_improvement?: string | null
          communication_rating?: number | null
          created_at?: string | null
          goals?: string | null
          id?: string
          next_review_date?: string | null
          overall_rating?: number | null
          professionalism_rating?: number | null
          punctuality_rating?: number | null
          review_period_end?: string
          review_period_start?: string
          reviewer_id?: string | null
          staff_profile_id?: string | null
          status?: string | null
          strengths?: string | null
          technical_skills_rating?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_reviews_staff_profile_id_fkey"
            columns: ["staff_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      phlebotomist_locations: {
        Row: {
          accuracy: number | null
          created_at: string
          id: string
          latitude: number
          longitude: number
          phlebotomist_id: string
          status: string
          updated_at: string
        }
        Insert: {
          accuracy?: number | null
          created_at?: string
          id?: string
          latitude: number
          longitude: number
          phlebotomist_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          accuracy?: number | null
          created_at?: string
          id?: string
          latitude?: number
          longitude?: number
          phlebotomist_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "phlebotomist_locations_phlebotomist_id_fkey"
            columns: ["phlebotomist_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      phlebotomist_schedules: {
        Row: {
          created_at: string | null
          date: string
          end_time: string
          id: string
          is_available: boolean | null
          phlebotomist_id: string
          service_area_ids: string[] | null
          start_time: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          date: string
          end_time: string
          id?: string
          is_available?: boolean | null
          phlebotomist_id: string
          service_area_ids?: string[] | null
          start_time: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string
          end_time?: string
          id?: string
          is_available?: boolean | null
          phlebotomist_id?: string
          service_area_ids?: string[] | null
          start_time?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "phlebotomist_schedules_phlebotomist_id_fkey"
            columns: ["phlebotomist_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          stripe_customer_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id: string
          stripe_customer_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          stripe_customer_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      promotional_campaigns: {
        Row: {
          campaign_name: string
          created_at: string | null
          description: string | null
          discount_percentage: number | null
          end_date: string
          id: string
          is_active: boolean | null
          start_date: string
          target_audience: string | null
          updated_at: string | null
        }
        Insert: {
          campaign_name: string
          created_at?: string | null
          description?: string | null
          discount_percentage?: number | null
          end_date: string
          id?: string
          is_active?: boolean | null
          start_date: string
          target_audience?: string | null
          updated_at?: string | null
        }
        Update: {
          campaign_name?: string
          created_at?: string | null
          description?: string | null
          discount_percentage?: number | null
          end_date?: string
          id?: string
          is_active?: boolean | null
          start_date?: string
          target_audience?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          created_at: string
          id: string
          subscription: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          subscription: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          subscription?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quality_incidents: {
        Row: {
          affected_staff_id: string | null
          appointment_id: string | null
          corrective_action: string | null
          created_at: string | null
          id: string
          incident_date: string
          incident_description: string
          incident_title: string
          preventive_action: string | null
          reported_by: string | null
          resolution_date: string | null
          root_cause: string | null
          severity: Database["public"]["Enums"]["incident_severity"]
          status: string | null
          updated_at: string | null
        }
        Insert: {
          affected_staff_id?: string | null
          appointment_id?: string | null
          corrective_action?: string | null
          created_at?: string | null
          id?: string
          incident_date: string
          incident_description: string
          incident_title: string
          preventive_action?: string | null
          reported_by?: string | null
          resolution_date?: string | null
          root_cause?: string | null
          severity: Database["public"]["Enums"]["incident_severity"]
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          affected_staff_id?: string | null
          appointment_id?: string | null
          corrective_action?: string | null
          created_at?: string | null
          id?: string
          incident_date?: string
          incident_description?: string
          incident_title?: string
          preventive_action?: string | null
          reported_by?: string | null
          resolution_date?: string | null
          root_cause?: string | null
          severity?: Database["public"]["Enums"]["incident_severity"]
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quality_incidents_affected_staff_id_fkey"
            columns: ["affected_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quality_incidents_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quality_incidents_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quality_metrics: {
        Row: {
          actual_value: number | null
          appointment_id: string | null
          created_at: string | null
          id: string
          measurement_period: string
          metric_name: string
          metric_type: string
          notes: string | null
          staff_profile_id: string | null
          target_value: number
          updated_at: string | null
        }
        Insert: {
          actual_value?: number | null
          appointment_id?: string | null
          created_at?: string | null
          id?: string
          measurement_period: string
          metric_name: string
          metric_type: string
          notes?: string | null
          staff_profile_id?: string | null
          target_value: number
          updated_at?: string | null
        }
        Update: {
          actual_value?: number | null
          appointment_id?: string | null
          created_at?: string | null
          id?: string
          measurement_period?: string
          metric_name?: string
          metric_type?: string
          notes?: string | null
          staff_profile_id?: string | null
          target_value?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quality_metrics_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quality_metrics_staff_profile_id_fkey"
            columns: ["staff_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reporting_structure: {
        Row: {
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          manager_id: string
          organizational_level_id: string
          relationship_type: string
          subordinate_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          manager_id: string
          organizational_level_id: string
          relationship_type?: string
          subordinate_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          manager_id?: string
          organizational_level_id?: string
          relationship_type?: string
          subordinate_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reporting_structure_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reporting_structure_organizational_level_id_fkey"
            columns: ["organizational_level_id"]
            isOneToOne: false
            referencedRelation: "organizational_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reporting_structure_subordinate_id_fkey"
            columns: ["subordinate_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rescheduling_fees: {
        Row: {
          appointment_id: string
          created_at: string
          fee_amount: number
          id: string
          paid_at: string | null
          payment_status: string
          stripe_payment_intent_id: string | null
          user_id: string
        }
        Insert: {
          appointment_id: string
          created_at?: string
          fee_amount?: number
          id?: string
          paid_at?: string | null
          payment_status?: string
          stripe_payment_intent_id?: string | null
          user_id: string
        }
        Update: {
          appointment_id?: string
          created_at?: string
          fee_amount?: number
          id?: string
          paid_at?: string | null
          payment_status?: string
          stripe_payment_intent_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rescheduling_fees_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      retest_reminders: {
        Row: {
          created_at: string
          id: string
          lab_result_id: string
          notes: string | null
          reminder_date: string
          status: string
          test_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lab_result_id: string
          notes?: string | null
          reminder_date: string
          status?: string
          test_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lab_result_id?: string
          notes?: string | null
          reminder_date?: string
          status?: string
          test_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "retest_reminders_lab_result_id_fkey"
            columns: ["lab_result_id"]
            isOneToOne: false
            referencedRelation: "lab_results"
            referencedColumns: ["id"]
          },
        ]
      }
      review_requests: {
        Row: {
          appointment_id: string | null
          clicked_at: string | null
          completed_at: string | null
          created_at: string | null
          id: string
          patient_id: string | null
          rating: number | null
          review_url: string
          sent_at: string | null
        }
        Insert: {
          appointment_id?: string | null
          clicked_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          patient_id?: string | null
          rating?: number | null
          review_url: string
          sent_at?: string | null
        }
        Update: {
          appointment_id?: string | null
          clicked_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          patient_id?: string | null
          rating?: number | null
          review_url?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_requests_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          actions: string[]
          created_at: string
          id: string
          permission_name: string
          permission_scope: string
          resource_type: string
          role_definition_id: string
        }
        Insert: {
          actions: string[]
          created_at?: string
          id?: string
          permission_name: string
          permission_scope: string
          resource_type: string
          role_definition_id: string
        }
        Update: {
          actions?: string[]
          created_at?: string
          id?: string
          permission_name?: string
          permission_scope?: string
          resource_type?: string
          role_definition_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_definition_id_fkey"
            columns: ["role_definition_id"]
            isOneToOne: false
            referencedRelation: "staff_role_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      route_plans: {
        Row: {
          created_at: string | null
          date: string
          id: string
          optimized_at: string | null
          phlebotomist_id: string | null
          status: string | null
          total_appointments: number | null
          total_distance_miles: number | null
          total_travel_time_minutes: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: string
          optimized_at?: string | null
          phlebotomist_id?: string | null
          status?: string | null
          total_appointments?: number | null
          total_distance_miles?: number | null
          total_travel_time_minutes?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          optimized_at?: string | null
          phlebotomist_id?: string | null
          status?: string | null
          total_appointments?: number | null
          total_distance_miles?: number | null
          total_travel_time_minutes?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "route_plans_phlebotomist_id_fkey"
            columns: ["phlebotomist_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      route_stops: {
        Row: {
          appointment_id: string | null
          created_at: string | null
          distance_to_next_miles: number | null
          estimated_arrival_time: string | null
          estimated_departure_time: string | null
          id: string
          route_plan_id: string | null
          stop_order: number
          travel_time_to_next_minutes: number | null
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string | null
          distance_to_next_miles?: number | null
          estimated_arrival_time?: string | null
          estimated_departure_time?: string | null
          id?: string
          route_plan_id?: string | null
          stop_order: number
          travel_time_to_next_minutes?: number | null
        }
        Update: {
          appointment_id?: string | null
          created_at?: string | null
          distance_to_next_miles?: number | null
          estimated_arrival_time?: string | null
          estimated_departure_time?: string | null
          id?: string
          route_plan_id?: string | null
          stop_order?: number
          travel_time_to_next_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "route_stops_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_stops_route_plan_id_fkey"
            columns: ["route_plan_id"]
            isOneToOne: false
            referencedRelation: "route_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_campaigns: {
        Row: {
          created_at: string
          estimated_recipients: number
          id: string
          manual_emails: string[] | null
          processed_at: string | null
          recipient_filter: Json | null
          reply_to: string
          result: Json | null
          scheduled_for: string
          sender_email: string
          sender_name: string
          status: string
          template_data: Json
          template_name: string
        }
        Insert: {
          created_at?: string
          estimated_recipients?: number
          id?: string
          manual_emails?: string[] | null
          processed_at?: string | null
          recipient_filter?: Json | null
          reply_to: string
          result?: Json | null
          scheduled_for: string
          sender_email: string
          sender_name: string
          status?: string
          template_data: Json
          template_name: string
        }
        Update: {
          created_at?: string
          estimated_recipients?: number
          id?: string
          manual_emails?: string[] | null
          processed_at?: string | null
          recipient_filter?: Json | null
          reply_to?: string
          result?: Json | null
          scheduled_for?: string
          sender_email?: string
          sender_name?: string
          status?: string
          template_data?: Json
          template_name?: string
        }
        Relationships: []
      }
      scheduling_conflicts: {
        Row: {
          appointment_id: string | null
          conflict_details: Json
          conflict_type: string
          created_at: string
          id: string
          resolved: boolean
          resolved_at: string | null
        }
        Insert: {
          appointment_id?: string | null
          conflict_details: Json
          conflict_type: string
          created_at?: string
          id?: string
          resolved?: boolean
          resolved_at?: string | null
        }
        Update: {
          appointment_id?: string | null
          conflict_details?: Json
          conflict_type?: string
          created_at?: string
          id?: string
          resolved?: boolean
          resolved_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduling_conflicts_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      service_add_ons: {
        Row: {
          additional_duration_minutes: number
          additional_price: number
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          is_required: boolean
          name: string
          parent_service_id: string
          updated_at: string
        }
        Insert: {
          additional_duration_minutes?: number
          additional_price?: number
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          is_required?: boolean
          name: string
          parent_service_id: string
          updated_at?: string
        }
        Update: {
          additional_duration_minutes?: number
          additional_price?: number
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          is_required?: boolean
          name?: string
          parent_service_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      service_areas: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
          zip_codes: string[]
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          zip_codes?: string[]
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          zip_codes?: string[]
        }
        Relationships: []
      }
      service_audit_log: {
        Row: {
          action: string
          changes: Json | null
          id: string
          performed_at: string
          performed_by: string | null
          service_id: string | null
        }
        Insert: {
          action: string
          changes?: Json | null
          id?: string
          performed_at?: string
          performed_by?: string | null
          service_id?: string | null
        }
        Update: {
          action?: string
          changes?: Json | null
          id?: string
          performed_at?: string
          performed_by?: string | null
          service_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_audit_log_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_availability: {
        Row: {
          created_at: string | null
          day_of_week: number
          effective_date: string | null
          end_time: string
          expiry_date: string | null
          id: string
          is_vip_only: boolean | null
          service_id: string | null
          start_time: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          day_of_week: number
          effective_date?: string | null
          end_time: string
          expiry_date?: string | null
          id?: string
          is_vip_only?: boolean | null
          service_id?: string | null
          start_time: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          day_of_week?: number
          effective_date?: string | null
          end_time?: string
          expiry_date?: string | null
          id?: string
          is_vip_only?: boolean | null
          service_id?: string | null
          start_time?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_availability_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_categories: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      service_logs: {
        Row: {
          appointment_id: string | null
          credit_pack_id: string | null
          credit_source: string
          external_booking_id: string | null
          id: string
          membership_id: string | null
          phlebotomist_fee: number | null
          refunded: boolean | null
          service_date: string | null
          supply_cost: number | null
          tenant_id: string | null
          total_variable_cost: number | null
          user_id: string
        }
        Insert: {
          appointment_id?: string | null
          credit_pack_id?: string | null
          credit_source: string
          external_booking_id?: string | null
          id?: string
          membership_id?: string | null
          phlebotomist_fee?: number | null
          refunded?: boolean | null
          service_date?: string | null
          supply_cost?: number | null
          tenant_id?: string | null
          total_variable_cost?: number | null
          user_id: string
        }
        Update: {
          appointment_id?: string | null
          credit_pack_id?: string | null
          credit_source?: string
          external_booking_id?: string | null
          id?: string
          membership_id?: string | null
          phlebotomist_fee?: number | null
          refunded?: boolean | null
          service_date?: string | null
          supply_cost?: number | null
          tenant_id?: string | null
          total_variable_cost?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_logs_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_logs_credit_pack_id_fkey"
            columns: ["credit_pack_id"]
            isOneToOne: false
            referencedRelation: "credit_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_logs_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "membership_lookup"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_logs_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "user_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      service_revenue: {
        Row: {
          appointment_id: string | null
          created_at: string | null
          id: string
          profit_amount: number | null
          recorded_date: string | null
          revenue_amount: number
          service_id: string | null
          supply_cost: number
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string | null
          id?: string
          profit_amount?: number | null
          recorded_date?: string | null
          revenue_amount: number
          service_id?: string | null
          supply_cost: number
        }
        Update: {
          appointment_id?: string | null
          created_at?: string | null
          id?: string
          profit_amount?: number | null
          recorded_date?: string | null
          revenue_amount?: number
          service_id?: string | null
          supply_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_revenue_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_revenue_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_staff_assignments: {
        Row: {
          created_at: string
          id: string
          service_id: string
          staff_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          service_id: string
          staff_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          service_id?: string
          staff_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_staff_assignments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_staff_assignments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          addon_price: number | null
          available_days: number[] | null
          available_end_time: string | null
          available_start_time: string | null
          booking_buffer_minutes: number | null
          category_id: string
          created_at: string
          description: string | null
          display_order: number
          duration: number | null
          icon_name: string | null
          id: string
          is_active: boolean | null
          is_addon: boolean
          is_included_in_membership: boolean
          is_vip_only: boolean | null
          name: string
          price: number | null
          special_requirements: string | null
          supply_cost: number | null
          supported_labs: string[] | null
          updated_at: string
        }
        Insert: {
          addon_price?: number | null
          available_days?: number[] | null
          available_end_time?: string | null
          available_start_time?: string | null
          booking_buffer_minutes?: number | null
          category_id: string
          created_at?: string
          description?: string | null
          display_order?: number
          duration?: number | null
          icon_name?: string | null
          id?: string
          is_active?: boolean | null
          is_addon?: boolean
          is_included_in_membership?: boolean
          is_vip_only?: boolean | null
          name: string
          price?: number | null
          special_requirements?: string | null
          supply_cost?: number | null
          supported_labs?: string[] | null
          updated_at?: string
        }
        Update: {
          addon_price?: number | null
          available_days?: number[] | null
          available_end_time?: string | null
          available_start_time?: string | null
          booking_buffer_minutes?: number | null
          category_id?: string
          created_at?: string
          description?: string | null
          display_order?: number
          duration?: number | null
          icon_name?: string | null
          id?: string
          is_active?: boolean | null
          is_addon?: boolean
          is_included_in_membership?: boolean
          is_vip_only?: boolean | null
          name?: string
          price?: number | null
          special_requirements?: string | null
          supply_cost?: number | null
          supported_labs?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      services_enhanced: {
        Row: {
          base_price: number
          category: string
          created_at: string | null
          description: string | null
          duration_minutes: number
          id: string
          is_active: boolean | null
          name: string
          parent_service_id: string | null
          requires_lab_order: boolean | null
          service_type: string
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          base_price?: number
          category?: string
          created_at?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean | null
          name: string
          parent_service_id?: string | null
          requires_lab_order?: boolean | null
          service_type?: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          base_price?: number
          category?: string
          created_at?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean | null
          name?: string
          parent_service_id?: string | null
          requires_lab_order?: boolean | null
          service_type?: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "services_enhanced_parent_service_id_fkey"
            columns: ["parent_service_id"]
            isOneToOne: false
            referencedRelation: "services_enhanced"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_enhanced_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_cart: {
        Row: {
          added_at: string | null
          expires_at: string | null
          id: string
          lab_test_id: string
          quantity: number | null
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          added_at?: string | null
          expires_at?: string | null
          id?: string
          lab_test_id: string
          quantity?: number | null
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          added_at?: string | null
          expires_at?: string | null
          id?: string
          lab_test_id?: string
          quantity?: number | null
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_shopping_cart_lab_test"
            columns: ["lab_test_id"]
            isOneToOne: false
            referencedRelation: "lab_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_notifications: {
        Row: {
          appointment_id: string | null
          created_by: string | null
          delivery_status: string | null
          eta_minutes: number | null
          id: string
          lab_name: string | null
          message_content: string
          metadata: Json | null
          notification_type: string
          phone_number: string
          sent_at: string | null
          tracking_id: string | null
          twilio_message_sid: string | null
        }
        Insert: {
          appointment_id?: string | null
          created_by?: string | null
          delivery_status?: string | null
          eta_minutes?: number | null
          id?: string
          lab_name?: string | null
          message_content: string
          metadata?: Json | null
          notification_type: string
          phone_number: string
          sent_at?: string | null
          tracking_id?: string | null
          twilio_message_sid?: string | null
        }
        Update: {
          appointment_id?: string | null
          created_by?: string | null
          delivery_status?: string | null
          eta_minutes?: number | null
          id?: string
          lab_name?: string | null
          message_content?: string
          metadata?: Json | null
          notification_type?: string
          phone_number?: string
          sent_at?: string | null
          tracking_id?: string | null
          twilio_message_sid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_notifications_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_acknowledgments: {
        Row: {
          acknowledged_at: string | null
          completion_score: number | null
          created_at: string | null
          expires_at: string | null
          id: string
          ip_address: string | null
          is_current: boolean | null
          sop_document_id: string | null
          tenant_id: string | null
          time_spent_minutes: number | null
          user_id: string
          version_acknowledged: string
        }
        Insert: {
          acknowledged_at?: string | null
          completion_score?: number | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          ip_address?: string | null
          is_current?: boolean | null
          sop_document_id?: string | null
          tenant_id?: string | null
          time_spent_minutes?: number | null
          user_id: string
          version_acknowledged: string
        }
        Update: {
          acknowledged_at?: string | null
          completion_score?: number | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          ip_address?: string | null
          is_current?: boolean | null
          sop_document_id?: string | null
          tenant_id?: string | null
          time_spent_minutes?: number | null
          user_id?: string
          version_acknowledged?: string
        }
        Relationships: [
          {
            foreignKeyName: "sop_acknowledgments_sop_document_id_fkey"
            columns: ["sop_document_id"]
            isOneToOne: false
            referencedRelation: "sop_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sop_acknowledgments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_categories: {
        Row: {
          color: string | null
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          order_index: number | null
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          order_index?: number | null
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          order_index?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      sop_documents: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          category_id: string | null
          content: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          document_type: string
          expiry_months: number | null
          file_path: string | null
          id: string
          interactive_config: Json | null
          is_interactive: boolean | null
          is_mandatory: boolean | null
          status: string | null
          target_roles: string[] | null
          title: string
          updated_at: string | null
          version: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          category_id?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          document_type?: string
          expiry_months?: number | null
          file_path?: string | null
          id?: string
          interactive_config?: Json | null
          is_interactive?: boolean | null
          is_mandatory?: boolean | null
          status?: string | null
          target_roles?: string[] | null
          title: string
          updated_at?: string | null
          version?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          category_id?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          document_type?: string
          expiry_months?: number | null
          file_path?: string | null
          id?: string
          interactive_config?: Json | null
          is_interactive?: boolean | null
          is_mandatory?: boolean | null
          status?: string | null
          target_roles?: string[] | null
          title?: string
          updated_at?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "sop_documents_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "sop_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_audit_logs: {
        Row: {
          approval_required: boolean
          approved_at: string | null
          approved_by: string | null
          change_type: string
          changed_by: string
          created_at: string
          id: string
          new_values: Json | null
          old_values: Json | null
          reason: string | null
          staff_id: string
        }
        Insert: {
          approval_required?: boolean
          approved_at?: string | null
          approved_by?: string | null
          change_type: string
          changed_by: string
          created_at?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          reason?: string | null
          staff_id: string
        }
        Update: {
          approval_required?: boolean
          approved_at?: string | null
          approved_by?: string | null
          change_type?: string
          changed_by?: string
          created_at?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          reason?: string | null
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_audit_logs_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_certifications: {
        Row: {
          certification_name: string
          certification_number: string | null
          created_at: string | null
          document_path: string | null
          expiration_date: string | null
          id: string
          issue_date: string
          issuing_organization: string
          staff_profile_id: string | null
          status: Database["public"]["Enums"]["compliance_status"] | null
          updated_at: string | null
        }
        Insert: {
          certification_name: string
          certification_number?: string | null
          created_at?: string | null
          document_path?: string | null
          expiration_date?: string | null
          id?: string
          issue_date: string
          issuing_organization: string
          staff_profile_id?: string | null
          status?: Database["public"]["Enums"]["compliance_status"] | null
          updated_at?: string | null
        }
        Update: {
          certification_name?: string
          certification_number?: string | null
          created_at?: string | null
          document_path?: string | null
          expiration_date?: string | null
          id?: string
          issue_date?: string
          issuing_organization?: string
          staff_profile_id?: string | null
          status?: Database["public"]["Enums"]["compliance_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_certifications_staff_profile_id_fkey"
            columns: ["staff_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_channel_members: {
        Row: {
          channel_id: string
          id: string
          joined_at: string
          role: string
          staff_id: string
        }
        Insert: {
          channel_id: string
          id?: string
          joined_at?: string
          role?: string
          staff_id: string
        }
        Update: {
          channel_id?: string
          id?: string
          joined_at?: string
          role?: string
          staff_id?: string
        }
        Relationships: []
      }
      staff_channel_messages: {
        Row: {
          channel_id: string
          content: string
          created_at: string
          edited_at: string | null
          id: string
          is_edited: boolean
          message_type: string
          metadata: Json | null
          sender_id: string
        }
        Insert: {
          channel_id: string
          content: string
          created_at?: string
          edited_at?: string | null
          id?: string
          is_edited?: boolean
          message_type?: string
          metadata?: Json | null
          sender_id: string
        }
        Update: {
          channel_id?: string
          content?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          is_edited?: boolean
          message_type?: string
          metadata?: Json | null
          sender_id?: string
        }
        Relationships: []
      }
      staff_communication_channels: {
        Row: {
          channel_name: string
          channel_type: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          channel_name: string
          channel_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          channel_name?: string
          channel_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      staff_date_blocks: {
        Row: {
          blocked_by: string
          blocked_date: string
          created_at: string | null
          id: string
          reason: string
          staff_id: string | null
        }
        Insert: {
          blocked_by: string
          blocked_date: string
          created_at?: string | null
          id?: string
          reason: string
          staff_id?: string | null
        }
        Update: {
          blocked_by?: string
          blocked_date?: string
          created_at?: string | null
          id?: string
          reason?: string
          staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_date_blocks_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          first_name: string | null
          id: string
          invitation_token: string
          last_name: string | null
          onboarding_completed_at: string | null
          sent_at: string
          staff_profile_id: string
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          first_name?: string | null
          id?: string
          invitation_token: string
          last_name?: string | null
          onboarding_completed_at?: string | null
          sent_at?: string
          staff_profile_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          first_name?: string | null
          id?: string
          invitation_token?: string
          last_name?: string | null
          onboarding_completed_at?: string | null
          sent_at?: string
          staff_profile_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff_notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          metadata: Json | null
          notification_type: string
          recipient_id: string
          sender_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          metadata?: Json | null
          notification_type: string
          recipient_id: string
          sender_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          metadata?: Json | null
          notification_type?: string
          recipient_id?: string
          sender_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff_onboarding: {
        Row: {
          account_setup_completed_at: string | null
          background_check_completed_at: string | null
          completed_at: string | null
          created_at: string | null
          current_step: number | null
          digital_signature_completed_at: string | null
          final_approval_completed_at: string | null
          id: string
          invitation_email: string
          invitation_expires_at: string | null
          invitation_sent_at: string | null
          invitation_token: string | null
          notes: string | null
          onboarding_status: string
          role_assignment_completed_at: string | null
          sop_training_completed_at: string | null
          staff_id: string
          total_steps: number | null
          updated_at: string | null
        }
        Insert: {
          account_setup_completed_at?: string | null
          background_check_completed_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          current_step?: number | null
          digital_signature_completed_at?: string | null
          final_approval_completed_at?: string | null
          id?: string
          invitation_email: string
          invitation_expires_at?: string | null
          invitation_sent_at?: string | null
          invitation_token?: string | null
          notes?: string | null
          onboarding_status?: string
          role_assignment_completed_at?: string | null
          sop_training_completed_at?: string | null
          staff_id: string
          total_steps?: number | null
          updated_at?: string | null
        }
        Update: {
          account_setup_completed_at?: string | null
          background_check_completed_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          current_step?: number | null
          digital_signature_completed_at?: string | null
          final_approval_completed_at?: string | null
          id?: string
          invitation_email?: string
          invitation_expires_at?: string | null
          invitation_sent_at?: string | null
          invitation_token?: string | null
          notes?: string | null
          onboarding_status?: string
          role_assignment_completed_at?: string | null
          sop_training_completed_at?: string | null
          staff_id?: string
          total_steps?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      staff_profiles: {
        Row: {
          availability_settings: Json | null
          certification_details: Json | null
          created_at: string
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          hired_date: string | null
          id: string
          last_review_date: string | null
          pay_rate: number
          premium_pay_rate: number | null
          specialty: string | null
          tenant_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          availability_settings?: Json | null
          certification_details?: Json | null
          created_at?: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          hired_date?: string | null
          id?: string
          last_review_date?: string | null
          pay_rate?: number
          premium_pay_rate?: number | null
          specialty?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          availability_settings?: Json | null
          certification_details?: Json | null
          created_at?: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          hired_date?: string | null
          id?: string
          last_review_date?: string | null
          pay_rate?: number
          premium_pay_rate?: number | null
          specialty?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_role_definitions: {
        Row: {
          base_hourly_rate: number | null
          can_manage_roles: string[] | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          reporting_to_role: string | null
          required_permissions: string[] | null
          responsibilities: string[] | null
          role_category: Database["public"]["Enums"]["role_category"]
          role_level: Database["public"]["Enums"]["role_level"]
          role_name: string
          updated_at: string
        }
        Insert: {
          base_hourly_rate?: number | null
          can_manage_roles?: string[] | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          reporting_to_role?: string | null
          required_permissions?: string[] | null
          responsibilities?: string[] | null
          role_category: Database["public"]["Enums"]["role_category"]
          role_level: Database["public"]["Enums"]["role_level"]
          role_name: string
          updated_at?: string
        }
        Update: {
          base_hourly_rate?: number | null
          can_manage_roles?: string[] | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          reporting_to_role?: string | null
          required_permissions?: string[] | null
          responsibilities?: string[] | null
          role_category?: Database["public"]["Enums"]["role_category"]
          role_level?: Database["public"]["Enums"]["role_level"]
          role_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff_schedules: {
        Row: {
          break_end: string | null
          break_start: string | null
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          schedule_date: string
          shift_end: string
          shift_start: string
          staff_id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          break_end?: string | null
          break_start?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          schedule_date: string
          shift_end: string
          shift_start: string
          staff_id: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          break_end?: string | null
          break_start?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          schedule_date?: string
          shift_end?: string
          shift_start?: string
          staff_id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      staff_time_off_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          end_date: string
          id: string
          reason: string | null
          rejection_reason: string | null
          request_type: string
          staff_id: string
          start_date: string
          status: string
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          end_date: string
          id?: string
          reason?: string | null
          rejection_reason?: string | null
          request_type?: string
          staff_id: string
          start_date: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          end_date?: string
          id?: string
          reason?: string | null
          rejection_reason?: string | null
          request_type?: string
          staff_id?: string
          start_date?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      staff_training: {
        Row: {
          certificate_path: string | null
          completion_date: string | null
          created_at: string | null
          expiration_date: string | null
          id: string
          staff_profile_id: string | null
          status: Database["public"]["Enums"]["compliance_status"] | null
          trainer_name: string | null
          training_date: string
          training_hours: number | null
          training_name: string
          training_type: string
          updated_at: string | null
        }
        Insert: {
          certificate_path?: string | null
          completion_date?: string | null
          created_at?: string | null
          expiration_date?: string | null
          id?: string
          staff_profile_id?: string | null
          status?: Database["public"]["Enums"]["compliance_status"] | null
          trainer_name?: string | null
          training_date: string
          training_hours?: number | null
          training_name: string
          training_type: string
          updated_at?: string | null
        }
        Update: {
          certificate_path?: string | null
          completion_date?: string | null
          created_at?: string | null
          expiration_date?: string | null
          id?: string
          staff_profile_id?: string | null
          status?: Database["public"]["Enums"]["compliance_status"] | null
          trainer_name?: string | null
          training_date?: string
          training_hours?: number | null
          training_name?: string
          training_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_training_staff_profile_id_fkey"
            columns: ["staff_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_balance_transactions: {
        Row: {
          amount: number
          created_at: string
          currency: string
          description: string | null
          fee: number
          id: string
          net: number
          stripe_transaction_id: string
          type: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at: string
          currency?: string
          description?: string | null
          fee?: number
          id?: string
          net: number
          stripe_transaction_id: string
          type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          description?: string | null
          fee?: number
          id?: string
          net?: number
          stripe_transaction_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      stripe_customers: {
        Row: {
          billing_address_city: string | null
          billing_address_country: string | null
          billing_address_line1: string | null
          billing_address_line2: string | null
          billing_address_postal_code: string | null
          billing_address_state: string | null
          billing_email: string | null
          created_at: string
          customer_metadata: Json | null
          customer_name: string | null
          default_payment_method_id: string | null
          id: string
          invoice_settings: Json | null
          last_synced_at: string
          phone: string | null
          primary_email: string
          stripe_created_at: string | null
          stripe_customer_id: string
          updated_at: string
        }
        Insert: {
          billing_address_city?: string | null
          billing_address_country?: string | null
          billing_address_line1?: string | null
          billing_address_line2?: string | null
          billing_address_postal_code?: string | null
          billing_address_state?: string | null
          billing_email?: string | null
          created_at?: string
          customer_metadata?: Json | null
          customer_name?: string | null
          default_payment_method_id?: string | null
          id?: string
          invoice_settings?: Json | null
          last_synced_at?: string
          phone?: string | null
          primary_email: string
          stripe_created_at?: string | null
          stripe_customer_id: string
          updated_at?: string
        }
        Update: {
          billing_address_city?: string | null
          billing_address_country?: string | null
          billing_address_line1?: string | null
          billing_address_line2?: string | null
          billing_address_postal_code?: string | null
          billing_address_state?: string | null
          billing_email?: string | null
          created_at?: string
          customer_metadata?: Json | null
          customer_name?: string | null
          default_payment_method_id?: string | null
          id?: string
          invoice_settings?: Json | null
          last_synced_at?: string
          phone?: string | null
          primary_email?: string
          stripe_created_at?: string | null
          stripe_customer_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      stripe_payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          status: string
          stripe_customer_id: string | null
          stripe_payment_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at: string
          currency?: string
          id?: string
          status: string
          stripe_customer_id?: string | null
          stripe_payment_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_payment_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      stripe_payouts: {
        Row: {
          amount: number
          arrival_date: string
          created_at: string
          currency: string
          id: string
          status: string
          stripe_payout_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          arrival_date: string
          created_at: string
          currency?: string
          id?: string
          status: string
          stripe_payout_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          arrival_date?: string
          created_at?: string
          currency?: string
          id?: string
          status?: string
          stripe_payout_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      stripe_transactions: {
        Row: {
          amount: number
          created_at: string
          currency: string
          customer_email: string | null
          customer_name: string | null
          id: string
          metadata: Json | null
          payment_status: string
          plan_type: string | null
          stripe_created_at: string
          stripe_customer_id: string | null
          stripe_payment_id: string
          transaction_type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          id?: string
          metadata?: Json | null
          payment_status?: string
          plan_type?: string | null
          stripe_created_at: string
          stripe_customer_id?: string | null
          stripe_payment_id: string
          transaction_type: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          id?: string
          metadata?: Json | null
          payment_status?: string
          plan_type?: string | null
          stripe_created_at?: string
          stripe_customer_id?: string | null
          stripe_payment_id?: string
          transaction_type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      "Sub Checkout": {
        Row: {
          attrs: Json | null
          customer: string | null
          id: string | null
          payment_intent: string | null
          subscription: string | null
        }
        Insert: {
          attrs?: Json | null
          customer?: string | null
          id?: string | null
          payment_intent?: string | null
          subscription?: string | null
        }
        Update: {
          attrs?: Json | null
          customer?: string | null
          id?: string | null
          payment_intent?: string | null
          subscription?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          customer_id: string | null
          id: number
          plan_id: string | null
          status: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          customer_id?: string | null
          id?: never
          plan_id?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          customer_id?: string | null
          id?: never
          plan_id?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      supply_inventory_alerts: {
        Row: {
          created_at: string | null
          current_stock: number
          id: string
          item_name: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          threshold_stock: number
        }
        Insert: {
          created_at?: string | null
          current_stock: number
          id?: string
          item_name: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          threshold_stock: number
        }
        Update: {
          created_at?: string | null
          current_stock?: number
          id?: string
          item_name?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          threshold_stock?: number
        }
        Relationships: []
      }
      supply_orders: {
        Row: {
          created_at: string | null
          created_by: string | null
          expected_delivery: string | null
          id: string
          notes: string | null
          order_items: Json
          priority: string | null
          received_at: string | null
          received_by: string | null
          status: string
          supplier_contact: string | null
          supplier_name: string
          total_amount: number | null
          tracking_number: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          expected_delivery?: string | null
          id?: string
          notes?: string | null
          order_items?: Json
          priority?: string | null
          received_at?: string | null
          received_by?: string | null
          status?: string
          supplier_contact?: string | null
          supplier_name: string
          total_amount?: number | null
          tracking_number?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          expected_delivery?: string | null
          id?: string
          notes?: string | null
          order_items?: Json
          priority?: string | null
          received_at?: string | null
          received_by?: string | null
          status?: string
          supplier_contact?: string | null
          supplier_name?: string
          total_amount?: number | null
          tracking_number?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      sync_metadata: {
        Row: {
          created_at: string | null
          id: string
          last_sync_at: string
          metadata: Json | null
          sync_status: string | null
          sync_type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_sync_at?: string
          metadata?: Json | null
          sync_status?: string | null
          sync_type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          last_sync_at?: string
          metadata?: Json | null
          sync_status?: string | null
          sync_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      tenant_membership_plans: {
        Row: {
          annual_price: number | null
          created_at: string
          credits_per_interval: number
          description: string | null
          id: string
          is_active: boolean
          max_users: number
          monthly_price: number
          name: string
          quarterly_price: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          annual_price?: number | null
          created_at?: string
          credits_per_interval?: number
          description?: string | null
          id?: string
          is_active?: boolean
          max_users?: number
          monthly_price: number
          name: string
          quarterly_price?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          annual_price?: number | null
          created_at?: string
          credits_per_interval?: number
          description?: string | null
          id?: string
          is_active?: boolean
          max_users?: number
          monthly_price?: number
          name?: string
          quarterly_price?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_membership_plans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_patients: {
        Row: {
          created_at: string
          date_of_birth: string | null
          email: string
          first_name: string
          id: string
          is_active: boolean
          last_name: string
          membership_end_date: string | null
          membership_plan_id: string | null
          membership_start_date: string | null
          membership_status: string | null
          phone: string | null
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          date_of_birth?: string | null
          email: string
          first_name: string
          id?: string
          is_active?: boolean
          last_name: string
          membership_end_date?: string | null
          membership_plan_id?: string | null
          membership_start_date?: string | null
          membership_status?: string | null
          phone?: string | null
          tenant_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          date_of_birth?: string | null
          email?: string
          first_name?: string
          id?: string
          is_active?: boolean
          last_name?: string
          membership_end_date?: string | null
          membership_plan_id?: string | null
          membership_start_date?: string | null
          membership_status?: string | null
          phone?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_patients_membership_plan_id_fkey"
            columns: ["membership_plan_id"]
            isOneToOne: false
            referencedRelation: "tenant_membership_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_patients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_service_areas: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          tenant_id: string
          updated_at: string
          zipcode_list: string[]
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          tenant_id: string
          updated_at?: string
          zipcode_list: string[]
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
          zipcode_list?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "tenant_service_areas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_service_combinations: {
        Row: {
          created_at: string
          description: string | null
          discount_percentage: number | null
          duration: number
          id: string
          is_active: boolean
          name: string
          price: number | null
          services_included: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          discount_percentage?: number | null
          duration?: number
          id?: string
          is_active?: boolean
          name: string
          price?: number | null
          services_included: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          discount_percentage?: number | null
          duration?: number
          id?: string
          is_active?: boolean
          name?: string
          price?: number | null
          services_included?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_service_combinations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_services: {
        Row: {
          available_for_nonmembers: boolean
          category: string | null
          created_at: string
          description: string | null
          duration: number
          id: string
          is_enabled: boolean
          price: number | null
          scheduling_interval: number
          service_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          available_for_nonmembers?: boolean
          category?: string | null
          created_at?: string
          description?: string | null
          duration?: number
          id?: string
          is_enabled?: boolean
          price?: number | null
          scheduling_interval?: number
          service_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          available_for_nonmembers?: boolean
          category?: string | null
          created_at?: string
          description?: string | null
          duration?: number
          id?: string
          is_enabled?: boolean
          price?: number | null
          scheduling_interval?: number
          service_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_services_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_subscription_tiers: {
        Row: {
          created_at: string
          description: string | null
          features: Json
          id: string
          monthly_price: number
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          monthly_price: number
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          monthly_price?: number
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      tenants: {
        Row: {
          auto_assign_members: boolean | null
          billing_interval: string
          branding: Json | null
          branding_config: Json | null
          business_settings: Json | null
          compliance_status: string | null
          contact_email: string
          contact_info: Json | null
          contact_phone: string | null
          corporate_overage_price: number
          created_at: string
          domain: string | null
          executive_upgrades_purchased: number
          franchise_code: string | null
          franchise_owner_id: string | null
          franchise_status: string | null
          id: string
          is_corporate: boolean
          name: string
          onboarding_completed: boolean | null
          operating_hours: Json | null
          owner_id: string | null
          seats_purchased: number
          seats_used: number
          service_area_radius: number | null
          slug: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subdomain: string | null
          subscription_start_date: string | null
          subscription_status: string | null
          subscription_tier: string | null
          subscription_tier_id: string | null
          territory_id: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          auto_assign_members?: boolean | null
          billing_interval?: string
          branding?: Json | null
          branding_config?: Json | null
          business_settings?: Json | null
          compliance_status?: string | null
          contact_email: string
          contact_info?: Json | null
          contact_phone?: string | null
          corporate_overage_price?: number
          created_at?: string
          domain?: string | null
          executive_upgrades_purchased?: number
          franchise_code?: string | null
          franchise_owner_id?: string | null
          franchise_status?: string | null
          id?: string
          is_corporate?: boolean
          name: string
          onboarding_completed?: boolean | null
          operating_hours?: Json | null
          owner_id?: string | null
          seats_purchased?: number
          seats_used?: number
          service_area_radius?: number | null
          slug: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subdomain?: string | null
          subscription_start_date?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
          subscription_tier_id?: string | null
          territory_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          auto_assign_members?: boolean | null
          billing_interval?: string
          branding?: Json | null
          branding_config?: Json | null
          business_settings?: Json | null
          compliance_status?: string | null
          contact_email?: string
          contact_info?: Json | null
          contact_phone?: string | null
          corporate_overage_price?: number
          created_at?: string
          domain?: string | null
          executive_upgrades_purchased?: number
          franchise_code?: string | null
          franchise_owner_id?: string | null
          franchise_status?: string | null
          id?: string
          is_corporate?: boolean
          name?: string
          onboarding_completed?: boolean | null
          operating_hours?: Json | null
          owner_id?: string | null
          seats_purchased?: number
          seats_used?: number
          service_area_radius?: number | null
          slug?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subdomain?: string | null
          subscription_start_date?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
          subscription_tier_id?: string | null
          territory_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_subscription_tier_id_fkey"
            columns: ["subscription_tier_id"]
            isOneToOne: false
            referencedRelation: "tenant_subscription_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "franchise_territories"
            referencedColumns: ["id"]
          },
        ]
      }
      territories: {
        Row: {
          assigned_at: string | null
          city: string | null
          created_at: string
          description: string | null
          franchise_owner_id: string | null
          id: string
          name: string
          postal_codes: string[] | null
          state: string
          status: string
          updated_at: string | null
        }
        Insert: {
          assigned_at?: string | null
          city?: string | null
          created_at?: string
          description?: string | null
          franchise_owner_id?: string | null
          id?: string
          name: string
          postal_codes?: string[] | null
          state: string
          status: string
          updated_at?: string | null
        }
        Update: {
          assigned_at?: string | null
          city?: string | null
          created_at?: string
          description?: string | null
          franchise_owner_id?: string | null
          id?: string
          name?: string
          postal_codes?: string[] | null
          state?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      test_ai_descriptions: {
        Row: {
          ai_description: string | null
          ai_preparation_instructions: string | null
          ai_test_meaning: string | null
          created_at: string
          generated_at: string | null
          id: string
          is_approved: boolean | null
          lab_test_id: string
          reviewed_by: string | null
          updated_at: string
        }
        Insert: {
          ai_description?: string | null
          ai_preparation_instructions?: string | null
          ai_test_meaning?: string | null
          created_at?: string
          generated_at?: string | null
          id?: string
          is_approved?: boolean | null
          lab_test_id: string
          reviewed_by?: string | null
          updated_at?: string
        }
        Update: {
          ai_description?: string | null
          ai_preparation_instructions?: string | null
          ai_test_meaning?: string | null
          created_at?: string
          generated_at?: string | null
          id?: string
          is_approved?: boolean | null
          lab_test_id?: string
          reviewed_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      test_categories: {
        Row: {
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      test_panels: {
        Row: {
          base_price: number
          category_id: string | null
          created_at: string | null
          description: string | null
          discount_percentage: number | null
          id: string
          is_active: boolean | null
          is_featured: boolean | null
          member_price: number | null
          panel_name: string
          updated_at: string | null
        }
        Insert: {
          base_price: number
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          discount_percentage?: number | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          member_price?: number | null
          panel_name: string
          updated_at?: string | null
        }
        Update: {
          base_price?: number
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          discount_percentage?: number | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          member_price?: number | null
          panel_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "test_panels_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "test_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_time_cache: {
        Row: {
          calculated_at: string
          distance_meters: number
          duration_seconds: number
          expires_at: string
          from_address: string
          from_lat: number | null
          from_lng: number | null
          id: string
          to_address: string
          to_lat: number | null
          to_lng: number | null
          traffic_duration_seconds: number | null
        }
        Insert: {
          calculated_at?: string
          distance_meters: number
          duration_seconds: number
          expires_at?: string
          from_address: string
          from_lat?: number | null
          from_lng?: number | null
          id?: string
          to_address: string
          to_lat?: number | null
          to_lng?: number | null
          traffic_duration_seconds?: number | null
        }
        Update: {
          calculated_at?: string
          distance_meters?: number
          duration_seconds?: number
          expires_at?: string
          from_address?: string
          from_lat?: number | null
          from_lng?: number | null
          id?: string
          to_address?: string
          to_lat?: number | null
          to_lng?: number | null
          traffic_duration_seconds?: number | null
        }
        Relationships: []
      }
      user_add_ons: {
        Row: {
          add_on_id: string
          created_at: string | null
          id: string
          is_active: boolean
          is_supernova_benefit: boolean
          updated_at: string | null
          user_id: string
        }
        Insert: {
          add_on_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          is_supernova_benefit?: boolean
          updated_at?: string | null
          user_id: string
        }
        Update: {
          add_on_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          is_supernova_benefit?: boolean
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_add_ons_add_on_id_fkey"
            columns: ["add_on_id"]
            isOneToOne: false
            referencedRelation: "add_on_prices"
            referencedColumns: ["id"]
          },
        ]
      }
      user_agreements: {
        Row: {
          accepted_at: string
          agreement_id: string
          id: string
          ip_address: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string
          agreement_id: string
          id?: string
          ip_address?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string
          agreement_id?: string
          id?: string
          ip_address?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_agreements_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "agreements"
            referencedColumns: ["id"]
          },
        ]
      }
      user_demographics: {
        Row: {
          age_range: string | null
          created_at: string
          gender: string | null
          id: string
          income_range: string | null
          interests: string[] | null
          occupation: string | null
          survey_completed_at: string
          user_id: string
        }
        Insert: {
          age_range?: string | null
          created_at?: string
          gender?: string | null
          id?: string
          income_range?: string | null
          interests?: string[] | null
          occupation?: string | null
          survey_completed_at?: string
          user_id: string
        }
        Update: {
          age_range?: string | null
          created_at?: string
          gender?: string | null
          id?: string
          income_range?: string | null
          interests?: string[] | null
          occupation?: string | null
          survey_completed_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_memberships: {
        Row: {
          billing_frequency: string
          bonus_credits: number | null
          created_at: string | null
          credits_allocated_annual: number | null
          credits_remaining: number
          external_sync_date: string | null
          external_sync_error: string | null
          external_sync_status: string | null
          family_member_ids: Json | null
          founding_member: boolean | null
          founding_member_signup_date: string | null
          id: string
          is_primary_member: boolean | null
          is_supernova_member: boolean | null
          member_number: string | null
          membership_number: string | null
          next_billing_override: string | null
          next_renewal: string
          plan_id: string
          plus_one_member_id: string | null
          promotion_locked_price: number | null
          rollover_credits: number | null
          rollover_expiration_date: string | null
          shared_pool_id: string | null
          status: string
          stripe_customer_data_id: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          supernova_enrollment_date: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          billing_frequency: string
          bonus_credits?: number | null
          created_at?: string | null
          credits_allocated_annual?: number | null
          credits_remaining: number
          external_sync_date?: string | null
          external_sync_error?: string | null
          external_sync_status?: string | null
          family_member_ids?: Json | null
          founding_member?: boolean | null
          founding_member_signup_date?: string | null
          id?: string
          is_primary_member?: boolean | null
          is_supernova_member?: boolean | null
          member_number?: string | null
          membership_number?: string | null
          next_billing_override?: string | null
          next_renewal: string
          plan_id: string
          plus_one_member_id?: string | null
          promotion_locked_price?: number | null
          rollover_credits?: number | null
          rollover_expiration_date?: string | null
          shared_pool_id?: string | null
          status?: string
          stripe_customer_data_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          supernova_enrollment_date?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          billing_frequency?: string
          bonus_credits?: number | null
          created_at?: string | null
          credits_allocated_annual?: number | null
          credits_remaining?: number
          external_sync_date?: string | null
          external_sync_error?: string | null
          external_sync_status?: string | null
          family_member_ids?: Json | null
          founding_member?: boolean | null
          founding_member_signup_date?: string | null
          id?: string
          is_primary_member?: boolean | null
          is_supernova_member?: boolean | null
          member_number?: string | null
          membership_number?: string | null
          next_billing_override?: string | null
          next_renewal?: string
          plan_id?: string
          plus_one_member_id?: string | null
          promotion_locked_price?: number | null
          rollover_credits?: number | null
          rollover_expiration_date?: string | null
          shared_pool_id?: string | null
          status?: string
          stripe_customer_data_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          supernova_enrollment_date?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_user_memberships_user_profiles"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_memberships_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "membership_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_memberships_stripe_customer_data_id_fkey"
            columns: ["stripe_customer_data_id"]
            isOneToOne: false
            referencedRelation: "stripe_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          address_city: string | null
          address_state: string | null
          address_street: string | null
          address_zip: string | null
          address_zipcode: string | null
          allergies: string | null
          created_at: string | null
          date_of_birth: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          full_name: string | null
          id: string
          insurance_group_number: string | null
          insurance_id: string | null
          insurance_policy_number: string | null
          insurance_provider: string | null
          lab_orders_uploaded: boolean | null
          medical_conditions: string | null
          medications: string | null
          phone: string | null
          preferred_phlebotomist: string | null
          special_instructions: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          address_city?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          address_zipcode?: string | null
          allergies?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          full_name?: string | null
          id: string
          insurance_group_number?: string | null
          insurance_id?: string | null
          insurance_policy_number?: string | null
          insurance_provider?: string | null
          lab_orders_uploaded?: boolean | null
          medical_conditions?: string | null
          medications?: string | null
          phone?: string | null
          preferred_phlebotomist?: string | null
          special_instructions?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          address_city?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          address_zipcode?: string | null
          allergies?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          full_name?: string | null
          id?: string
          insurance_group_number?: string | null
          insurance_id?: string | null
          insurance_policy_number?: string | null
          insurance_provider?: string | null
          lab_orders_uploaded?: boolean | null
          medical_conditions?: string | null
          medications?: string | null
          phone?: string | null
          preferred_phlebotomist?: string | null
          special_instructions?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          communication_preferences: Json
          created_at: string
          display_preferences: Json
          id: string
          notification_preferences: Json
          updated_at: string
          user_id: string
          work_preferences: Json
        }
        Insert: {
          communication_preferences?: Json
          created_at?: string
          display_preferences?: Json
          id?: string
          notification_preferences?: Json
          updated_at?: string
          user_id: string
          work_preferences?: Json
        }
        Update: {
          communication_preferences?: Json
          created_at?: string
          display_preferences?: Json
          id?: string
          notification_preferences?: Json
          updated_at?: string
          user_id?: string
          work_preferences?: Json
        }
        Relationships: []
      }
      user_tenants: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          role: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          role?: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          role?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_tenants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      visitor_analyses: {
        Row: {
          analysis_result: Json
          created_at: string
          id: string
          session_id: string
          user_id: string | null
          visitor_data: Json
        }
        Insert: {
          analysis_result: Json
          created_at?: string
          id?: string
          session_id: string
          user_id?: string | null
          visitor_data: Json
        }
        Update: {
          analysis_result?: Json
          created_at?: string
          id?: string
          session_id?: string
          user_id?: string | null
          visitor_data?: Json
        }
        Relationships: []
      }
      visitor_interactions: {
        Row: {
          created_at: string
          element: string
          id: string
          interaction_type: string
          page_path: string
          session_id: string
          user_id: string | null
          value: string | null
        }
        Insert: {
          created_at?: string
          element: string
          id?: string
          interaction_type: string
          page_path: string
          session_id: string
          user_id?: string | null
          value?: string | null
        }
        Update: {
          created_at?: string
          element?: string
          id?: string
          interaction_type?: string
          page_path?: string
          session_id?: string
          user_id?: string | null
          value?: string | null
        }
        Relationships: []
      }
      visitor_sessions: {
        Row: {
          browser: string | null
          city: string | null
          conversion_value: number | null
          converted: boolean | null
          coordinates: unknown
          created_at: string | null
          device_type: string | null
          ended_at: string | null
          id: string
          ip_address: unknown
          is_high_value: boolean | null
          last_activity: string | null
          operating_system: string | null
          referrer: string | null
          session_id: string
          started_at: string | null
          state: string | null
          total_duration_seconds: number | null
          updated_at: string | null
          user_agent: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          visitor_id: string
          visitor_score: number | null
          zip_code: string | null
        }
        Insert: {
          browser?: string | null
          city?: string | null
          conversion_value?: number | null
          converted?: boolean | null
          coordinates?: unknown
          created_at?: string | null
          device_type?: string | null
          ended_at?: string | null
          id?: string
          ip_address?: unknown
          is_high_value?: boolean | null
          last_activity?: string | null
          operating_system?: string | null
          referrer?: string | null
          session_id: string
          started_at?: string | null
          state?: string | null
          total_duration_seconds?: number | null
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id: string
          visitor_score?: number | null
          zip_code?: string | null
        }
        Update: {
          browser?: string | null
          city?: string | null
          conversion_value?: number | null
          converted?: boolean | null
          coordinates?: unknown
          created_at?: string | null
          device_type?: string | null
          ended_at?: string | null
          id?: string
          ip_address?: unknown
          is_high_value?: boolean | null
          last_activity?: string | null
          operating_system?: string | null
          referrer?: string | null
          session_id?: string
          started_at?: string | null
          state?: string | null
          total_duration_seconds?: number | null
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string
          visitor_score?: number | null
          zip_code?: string | null
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          created_at: string
          error_message: string | null
          event_data: Json | null
          event_type: string
          id: string
          processed_at: string
          retry_count: number | null
          status: string
          stripe_event_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          processed_at?: string
          retry_count?: number | null
          status?: string
          stripe_event_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          processed_at?: string
          retry_count?: number | null
          status?: string
          stripe_event_id?: string
        }
        Relationships: []
      }
      wellness_tracking: {
        Row: {
          created_at: string
          energy_level: number | null
          exercise_minutes: number | null
          id: string
          notes: string | null
          sleep_hours: number | null
          stress_level: number | null
          tracking_date: string
          updated_at: string
          user_id: string
          water_intake_oz: number | null
        }
        Insert: {
          created_at?: string
          energy_level?: number | null
          exercise_minutes?: number | null
          id?: string
          notes?: string | null
          sleep_hours?: number | null
          stress_level?: number | null
          tracking_date: string
          updated_at?: string
          user_id: string
          water_intake_oz?: number | null
        }
        Update: {
          created_at?: string
          energy_level?: number | null
          exercise_minutes?: number | null
          id?: string
          notes?: string | null
          sleep_hours?: number | null
          stress_level?: number | null
          tracking_date?: string
          updated_at?: string
          user_id?: string
          water_intake_oz?: number | null
        }
        Relationships: []
      }
      work_hours: {
        Row: {
          clock_in: string
          clock_out: string | null
          created_at: string
          hours_worked: number | null
          id: string
          notes: string | null
          staff_profile_id: string
          updated_at: string
        }
        Insert: {
          clock_in: string
          clock_out?: string | null
          created_at?: string
          hours_worked?: number | null
          id?: string
          notes?: string | null
          staff_profile_id: string
          updated_at?: string
        }
        Update: {
          clock_in?: string
          clock_out?: string | null
          created_at?: string
          hours_worked?: number | null
          id?: string
          notes?: string | null
          staff_profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_hours_staff_profile_id_fkey"
            columns: ["staff_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      zipcode_wealth_index: {
        Row: {
          avg_home_value: number | null
          city: string
          created_at: string
          luxury_community: boolean | null
          state: string | null
          vip_priority: boolean | null
          wealth_index: number
          zipcode: string
        }
        Insert: {
          avg_home_value?: number | null
          city: string
          created_at?: string
          luxury_community?: boolean | null
          state?: string | null
          vip_priority?: boolean | null
          wealth_index?: number
          zipcode: string
        }
        Update: {
          avg_home_value?: number | null
          city?: string
          created_at?: string
          luxury_community?: boolean | null
          state?: string | null
          vip_priority?: boolean | null
          wealth_index?: number
          zipcode?: string
        }
        Relationships: []
      }
    }
    Views: {
      membership_lookup: {
        Row: {
          address_city: string | null
          address_state: string | null
          billing_frequency: string | null
          created_at: string | null
          credits_remaining: number | null
          full_name: string | null
          id: string | null
          membership_number: string | null
          next_renewal: string | null
          phone: string | null
          plan_name: string | null
          rollover_credits: number | null
          status: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_user_memberships_user_profiles"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      assign_member_ids: { Args: { membership_id: string }; Returns: undefined }
      calculate_concierge_pricing: {
        Args: { patient_count: number }
        Returns: {
          annual_price: number
          credits_per_year: number
          monthly_price: number
          quarterly_price: number
        }[]
      }
      calculate_lead_score: {
        Args: { p_lead_profile_id: string }
        Returns: undefined
      }
      calculate_profitability: {
        Args: { from_date?: string; to_date?: string }
        Returns: {
          credits_used: number
          gross_profit: number
          membership_plan_id: string
          membership_plan_name: string
          profit_margin_percentage: number
          status_flag: string
          total_cost_incurred: number
          total_paid: number
          user_id: string
          user_name: string
        }[]
      }
      calculate_travel_buffer: {
        Args: {
          from_address: string
          service_duration_minutes?: number
          to_address: string
        }
        Returns: number
      }
      check_available_credits: { Args: { user_id: string }; Returns: boolean }
      deduct_appointment_credit: {
        Args: { appointment_id: string }
        Returns: boolean
      }
      generate_corporate_employee_id: { Args: never; Returns: string }
      generate_corporate_id: { Args: never; Returns: string }
      generate_corporate_member_id: {
        Args: { corporate_id: string }
        Returns: string
      }
      generate_member_id: { Args: never; Returns: string }
      generate_membership_number: { Args: never; Returns: string }
      generate_staff_invitation_token: { Args: never; Returns: string }
      get_available_phlebotomists_for_slot:
        | {
            Args: {
              p_date: string
              p_duration_minutes?: number
              p_start_time: string
              p_zipcode: string
            }
            Returns: {
              available_end_time: string
              available_start_time: string
              phlebotomist_id: string
              phlebotomist_name: string
              travel_distance_estimate: number
            }[]
          }
        | {
            Args: {
              p_date: string
              p_duration_minutes?: number
              p_is_member?: boolean
              p_start_time: string
              p_zipcode: string
            }
            Returns: {
              available_end_time: string
              available_start_time: string
              phlebotomist_id: string
              phlebotomist_name: string
              travel_distance_estimate: number
            }[]
          }
        | {
            Args: {
              p_date: string
              p_duration_minutes?: number
              p_is_member?: boolean
              p_is_vip_member?: boolean
              p_start_time: string
              p_zipcode: string
            }
            Returns: {
              available_end_time: string
              available_start_time: string
              phlebotomist_id: string
              phlebotomist_name: string
              travel_distance_estimate: number
            }[]
          }
      get_available_phlebotomists_with_travel: {
        Args: {
          p_address: string
          p_date: string
          p_duration_minutes?: number
          p_is_member?: boolean
          p_is_vip_member?: boolean
          p_service_id: string
          p_start_time: string
          p_zipcode: string
        }
        Returns: {
          available_end_time: string
          available_start_time: string
          estimated_arrival_time: string
          phlebotomist_id: string
          phlebotomist_name: string
          travel_buffer_minutes: number
        }[]
      }
      get_current_user_role: { Args: never; Returns: string }
      get_tenant_subscription_features: {
        Args: { tenant_id: string }
        Returns: Json
      }
      get_user_franchise_tenant: { Args: never; Returns: string }
      get_user_membership_metrics: {
        Args: { end_date: string; start_date: string }
        Returns: Json
      }
      get_user_tenant_id: { Args: never; Returns: string }
      insert_partnership_onboarding: {
        Args: {
          p_additional_notes: string
          p_contact_email: string
          p_contact_phone: string
          p_logo_path: string
          p_number_of_staff_accounts: number
          p_practice_description: string
          p_practice_name: string
          p_preferred_domain: string
          p_primary_color: string
          p_secondary_color: string
          p_services: string
          p_session_id: string
        }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_admin_role: { Args: never; Returns: boolean }
      is_admin_user: { Args: never; Returns: boolean }
      is_staff_member: { Args: never; Returns: boolean }
      is_user_admin: { Args: never; Returns: boolean }
      process_annual_credit_rollover: { Args: never; Returns: undefined }
      setup_initial_admin: { Args: never; Returns: undefined }
      store_push_subscription: {
        Args: { p_subscription: Json; p_user_id: string }
        Returns: undefined
      }
      sync_existing_users_to_stripe: { Args: never; Returns: undefined }
      user_belongs_to_tenant: { Args: { _tenant_id: string }; Returns: boolean }
      user_has_any_role: {
        Args: { required_roles: string[] }
        Returns: boolean
      }
      user_has_role: { Args: { required_role: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "admin"
        | "office_manager"
        | "phlebotomist"
        | "patient"
        | "concierge_doctor"
        | "owner"
      appointment_status:
        | "scheduled"
        | "confirmed"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "rescheduled"
        | "no_show"
      audit_status: "scheduled" | "in_progress" | "completed" | "cancelled"
      compliance_status: "compliant" | "non_compliant" | "pending" | "expired"
      document_status: "draft" | "active" | "archived" | "expired"
      incident_severity: "low" | "medium" | "high" | "critical"
      organizational_level:
        | "district"
        | "city"
        | "state"
        | "region"
        | "corporate"
      role_category:
        | "phlebotomy"
        | "administration"
        | "sales"
        | "finance"
        | "marketing"
        | "social_media"
        | "customer_service"
        | "provider_support"
        | "technical_support"
      role_level: "staff" | "supervisor" | "manager" | "director" | "executive"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "super_admin",
        "admin",
        "office_manager",
        "phlebotomist",
        "patient",
        "concierge_doctor",
        "owner",
      ],
      appointment_status: [
        "scheduled",
        "confirmed",
        "in_progress",
        "completed",
        "cancelled",
        "rescheduled",
        "no_show",
      ],
      audit_status: ["scheduled", "in_progress", "completed", "cancelled"],
      compliance_status: ["compliant", "non_compliant", "pending", "expired"],
      document_status: ["draft", "active", "archived", "expired"],
      incident_severity: ["low", "medium", "high", "critical"],
      organizational_level: [
        "district",
        "city",
        "state",
        "region",
        "corporate",
      ],
      role_category: [
        "phlebotomy",
        "administration",
        "sales",
        "finance",
        "marketing",
        "social_media",
        "customer_service",
        "provider_support",
        "technical_support",
      ],
      role_level: ["staff", "supervisor", "manager", "director", "executive"],
    },
  },
} as const
