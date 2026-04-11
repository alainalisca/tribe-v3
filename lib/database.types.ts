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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      blocked_users: {
        Row: {
          blocked_user_id: string | null
          created_at: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          blocked_user_id?: string | null
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          blocked_user_id?: string | null
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blocked_users_blocked_user_id_fkey"
            columns: ["blocked_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      bug_reports: {
        Row: {
          admin_response: string | null
          created_at: string | null
          description: string | null
          id: string
          severity: string | null
          status: string | null
          steps_to_reproduce: string | null
          title: string | null
          user_id: string | null
        }
        Insert: {
          admin_response?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          severity?: string | null
          status?: string | null
          steps_to_reproduce?: string | null
          title?: string | null
          user_id?: string | null
        }
        Update: {
          admin_response?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          severity?: string | null
          status?: string | null
          steps_to_reproduce?: string | null
          title?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bug_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          created_at: string | null
          deleted: boolean | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          message: string
          session_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          deleted?: boolean | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          message: string
          session_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          deleted?: boolean | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          message?: string
          session_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_tokens: {
        Row: {
          created_at: string | null
          created_by: string
          expires_at: string | null
          id: string
          session_id: string
          token: string
        }
        Insert: {
          created_at?: string | null
          created_by: string
          expires_at?: string | null
          id?: string
          session_id: string
          token: string
        }
        Update: {
          created_at?: string | null
          created_by?: string
          expires_at?: string | null
          id?: string
          session_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invite_tokens_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invite_tokens_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_status: {
        Row: {
          expires_at: string | null
          id: string
          last_ping: string | null
          session_id: string
          started_at: string | null
          user_id: string
        }
        Insert: {
          expires_at?: string | null
          id?: string
          last_ping?: string | null
          session_id: string
          started_at?: string | null
          user_id: string
        }
        Update: {
          expires_at?: string | null
          id?: string
          last_ping?: string | null
          session_id?: string
          started_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_status_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_status_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      match_requests: {
        Row: {
          created_at: string | null
          id: string
          recipient_id: string
          requester_id: string
          session_id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          recipient_id: string
          requester_id: string
          session_id: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          recipient_id?: string
          requester_id?: string
          session_id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_requests_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_requests_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          created_at: string | null
          id: string
          message: string
          session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message: string
          session_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          id: string
          recipient_id: string
          actor_id: string | null
          type: string
          entity_type: string | null
          entity_id: string | null
          message: string
          is_read: boolean
          created_at: string
        }
        Insert: {
          id?: string
          recipient_id: string
          actor_id?: string | null
          type: string
          entity_type?: string | null
          entity_id?: string | null
          message: string
          is_read?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          recipient_id?: string
          actor_id?: string | null
          type?: string
          entity_type?: string | null
          entity_id?: string | null
          message?: string
          is_read?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      push_notifications: {
        Row: {
          body: string
          created_at: string | null
          data: Json | null
          id: string
          sent: boolean | null
          sent_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string | null
          data?: Json | null
          id?: string
          sent?: boolean | null
          sent_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string | null
          data?: Json | null
          id?: string
          sent?: boolean | null
          sent_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          created_at: string | null
          id: string
          subscription: Json
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          subscription: Json
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          subscription?: Json
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      reported_messages: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          message_id: string | null
          reason: string | null
          reporter_id: string | null
          session_id: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          message_id?: string | null
          reason?: string | null
          reporter_id?: string | null
          session_id?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          message_id?: string | null
          reason?: string | null
          reporter_id?: string | null
          session_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reported_messages_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reported_messages_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reported_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          created_at: string | null
          currency: string
          gateway: string
          gateway_payment_id: string | null
          gateway_reference: string | null
          id: string
          instructor_payout_cents: number | null
          paid_out_at: string | null
          participant_user_id: string
          payout_gateway: string | null
          payout_reference: string | null
          payout_status: string
          platform_fee_cents: number | null
          session_id: string
          status: string
          stripe_customer_id: string | null
          stripe_payment_intent_id: string | null
          updated_at: string | null
          wompi_payment_method: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string | null
          currency: string
          gateway: string
          gateway_payment_id?: string | null
          gateway_reference?: string | null
          id?: string
          instructor_payout_cents?: number | null
          paid_out_at?: string | null
          participant_user_id: string
          payout_gateway?: string | null
          payout_reference?: string | null
          payout_status?: string
          platform_fee_cents?: number | null
          session_id: string
          status?: string
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string | null
          wompi_payment_method?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string | null
          currency?: string
          gateway?: string
          gateway_payment_id?: string | null
          gateway_reference?: string | null
          id?: string
          instructor_payout_cents?: number | null
          paid_out_at?: string | null
          participant_user_id?: string
          payout_gateway?: string | null
          payout_reference?: string | null
          payout_status?: string
          platform_fee_cents?: number | null
          session_id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string | null
          wompi_payment_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_participant_user_id_fkey"
            columns: ["participant_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      popular_routes: {
        Row: {
          id: string
          name: string
          sport_type: string
          distance_km: number
          elevation_gain_m: number
          difficulty: string
          start_lat: number
          start_lng: number
          description_en: string | null
          description_es: string | null
          image_url: string | null
          is_active: boolean
          submitted_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          sport_type: string
          distance_km: number
          elevation_gain_m?: number
          difficulty: string
          start_lat: number
          start_lng: number
          description_en?: string | null
          description_es?: string | null
          image_url?: string | null
          is_active?: boolean
          submitted_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          sport_type?: string
          distance_km?: number
          elevation_gain_m?: number
          difficulty?: string
          start_lat?: number
          start_lng?: number
          description_en?: string | null
          description_es?: string | null
          image_url?: string | null
          is_active?: boolean
          submitted_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "popular_routes_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reported_users: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          reason: string | null
          reported_user_id: string | null
          reporter_id: string | null
          session_id: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          reason?: string | null
          reported_user_id?: string | null
          reporter_id?: string | null
          session_id?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          reason?: string | null
          reported_user_id?: string | null
          reporter_id?: string | null
          session_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reported_users_reported_user_id_fkey"
            columns: ["reported_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reported_users_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reported_users_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string | null
          host_id: string
          id: string
          rating: number
          reviewer_id: string
          session_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          host_id: string
          id?: string
          rating: number
          reviewer_id: string
          session_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          host_id?: string
          id?: string
          rating?: number
          reviewer_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_attendance: {
        Row: {
          attended: boolean | null
          created_at: string | null
          id: string
          marked_at: string | null
          marked_by: string | null
          notes: string | null
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          attended?: boolean | null
          created_at?: string | null
          id?: string
          marked_at?: string | null
          marked_by?: string | null
          notes?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          attended?: boolean | null
          created_at?: string | null
          id?: string
          marked_at?: string | null
          marked_by?: string | null
          notes?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_attendance_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      session_participants: {
        Row: {
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          is_guest: boolean | null
          joined_at: string | null
          paid_at: string | null
          payment_confirmed_by: string | null
          payment_gateway: string | null
          payment_id: string | null
          payment_status: string | null
          session_id: string
          status: string | null
          user_id: string | null
        }
        Insert: {
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          is_guest?: boolean | null
          joined_at?: string | null
          paid_at?: string | null
          payment_confirmed_by?: string | null
          payment_gateway?: string | null
          payment_id?: string | null
          payment_status?: string | null
          session_id: string
          status?: string | null
          user_id?: string | null
        }
        Update: {
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          is_guest?: boolean | null
          joined_at?: string | null
          paid_at?: string | null
          payment_confirmed_by?: string | null
          payment_gateway?: string | null
          payment_id?: string | null
          payment_status?: string | null
          session_id?: string
          status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      session_recap_photos: {
        Row: {
          created_at: string | null
          id: string
          photo_url: string
          reported: boolean | null
          reported_by: string | null
          reported_reason: string | null
          session_id: string | null
          uploaded_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          photo_url: string
          reported?: boolean | null
          reported_by?: string | null
          reported_reason?: string | null
          session_id?: string | null
          uploaded_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          photo_url?: string
          reported?: boolean | null
          reported_by?: string | null
          reported_reason?: string | null
          session_id?: string | null
          uploaded_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_recap_photos_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_recap_photos_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_recap_photos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      session_comments: {
        Row: {
          id: string
          session_id: string
          author_id: string
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          author_id: string
          content: string
          created_at?: string
        }
        Update: {
          content?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_comments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      session_stories: {
        Row: {
          caption: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          media_type: string
          media_url: string
          session_id: string
          thumbnail_url: string | null
          user_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          media_type: string
          media_url: string
          session_id: string
          thumbnail_url?: string | null
          user_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          media_type?: string
          media_url?: string
          session_id?: string
          thumbnail_url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_stories_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_stories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      session_templates: {
        Row: {
          created_at: string | null
          description: string | null
          duration: number
          id: string
          location: string
          max_participants: number
          name: string
          sport: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          duration: number
          id?: string
          location: string
          max_participants: number
          name: string
          sport: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          duration?: number
          id?: string
          location?: string
          max_participants?: number
          name?: string
          sport?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_templates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          created_at: string | null
          creator_id: string
          currency: string | null
          current_participants: number | null
          date: string
          description: string | null
          duration: number
          end_time: string | null
          equipment: string | null
          followup_sent: boolean | null
          gender_preference: string | null
          id: string
          is_immediate: boolean | null
          is_paid: boolean | null
          is_recurring: boolean | null
          is_training_now: boolean | null
          join_policy: string | null
          latitude: number | null
          location: string
          location_lat: number | null
          location_lng: number | null
          longitude: number | null
          max_paid_spots: number | null
          max_participants: number
          payment_gateway: string | null
          payment_instructions: string | null
          photo_verified: boolean | null
          photos: string[] | null
          platform_fee_percent: number | null
          price_cents: number | null
          recap_photos: string[] | null
          recurrence_days: string[] | null
          recurrence_end_date: string | null
          recurrence_pattern: string | null
          recurring_parent_id: string | null
          reminder_15min_sent: boolean | null
          reminder_1hr_sent: boolean | null
          reminder_sent: boolean | null
          skill_level: string | null
          sport: string
          start_time: string
          status: string | null
          title: string | null
          updated_at: string | null
          verified_at: string | null
          verified_by: string | null
          visibility: string | null
        }
        Insert: {
          created_at?: string | null
          creator_id: string
          currency?: string | null
          current_participants?: number | null
          date: string
          description?: string | null
          duration: number
          end_time?: string | null
          equipment?: string | null
          followup_sent?: boolean | null
          gender_preference?: string | null
          id?: string
          is_immediate?: boolean | null
          is_paid?: boolean | null
          is_recurring?: boolean | null
          is_training_now?: boolean | null
          join_policy?: string | null
          latitude?: number | null
          location: string
          location_lat?: number | null
          location_lng?: number | null
          longitude?: number | null
          max_paid_spots?: number | null
          max_participants: number
          payment_gateway?: string | null
          payment_instructions?: string | null
          photo_verified?: boolean | null
          photos?: string[] | null
          platform_fee_percent?: number | null
          price_cents?: number | null
          recap_photos?: string[] | null
          recurrence_days?: string[] | null
          recurrence_end_date?: string | null
          recurrence_pattern?: string | null
          recurring_parent_id?: string | null
          reminder_15min_sent?: boolean | null
          reminder_1hr_sent?: boolean | null
          reminder_sent?: boolean | null
          skill_level?: string | null
          sport: string
          start_time: string
          status?: string | null
          title?: string | null
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
          visibility?: string | null
        }
        Update: {
          created_at?: string | null
          creator_id?: string
          currency?: string | null
          current_participants?: number | null
          date?: string
          description?: string | null
          duration?: number
          end_time?: string | null
          equipment?: string | null
          followup_sent?: boolean | null
          gender_preference?: string | null
          id?: string
          is_immediate?: boolean | null
          is_paid?: boolean | null
          is_recurring?: boolean | null
          is_training_now?: boolean | null
          join_policy?: string | null
          latitude?: number | null
          location?: string
          location_lat?: number | null
          location_lng?: number | null
          longitude?: number | null
          max_paid_spots?: number | null
          max_participants?: number
          payment_gateway?: string | null
          payment_instructions?: string | null
          photo_verified?: boolean | null
          photos?: string[] | null
          platform_fee_percent?: number | null
          price_cents?: number | null
          recap_photos?: string[] | null
          recurrence_days?: string[] | null
          recurrence_end_date?: string | null
          recurrence_pattern?: string | null
          recurring_parent_id?: string | null
          reminder_15min_sent?: boolean | null
          reminder_1hr_sent?: boolean | null
          reminder_sent?: boolean | null
          skill_level?: string | null
          sport?: string
          start_time?: string
          status?: string | null
          title?: string | null
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_feedback: {
        Row: {
          admin_response: string | null
          created_at: string | null
          description: string | null
          id: string
          status: string | null
          title: string | null
          type: string | null
          user_id: string | null
        }
        Insert: {
          admin_response?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          status?: string | null
          title?: string | null
          type?: string | null
          user_id?: string | null
        }
        Update: {
          admin_response?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          status?: string | null
          title?: string | null
          type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          average_rating: number | null
          banned: boolean | null
          banner_url: string | null
          bio: string | null
          certifications: string[] | null
          created_at: string | null
          date_of_birth: string | null
          earnings_currency: string | null
          email: string
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          facebook_url: string | null
          fcm_platform: string | null
          fcm_token: string | null
          fcm_updated_at: string | null
          follower_count: number
          following_count: number
          id: string
          instagram_username: string | null
          instructor_bio: string | null
          is_admin: boolean | null
          is_instructor: boolean | null
          is_verified_instructor: boolean | null
          last_login_at: string | null
          last_motivation_message_id: string | null
          last_motivation_sent: string | null
          last_reengagement_sent: string | null
          last_weekly_recap_sent: string | null
          location: string | null
          location_lat: number | null
          location_lng: number | null
          name: string | null
          photos: string[] | null
          payout_account_number: string | null
          payout_account_type: string | null
          payout_bank_name: string | null
          payout_document_number: string | null
          payout_document_type: string | null
          payout_method: string | null
          preferred_language: string | null
          preferred_sports: string[] | null
          push_subscription: Json | null
          rating: number | null
          safety_waiver_accepted: boolean | null
          safety_waiver_accepted_at: string | null
          session_reminders_enabled: boolean | null
          sessions_completed: number | null
          show_rate: number | null
          specialties: string[] | null
          sports: string[] | null
          storefront_banner_url: string | null
          storefront_pro_expires: string | null
          storefront_pro_since: string | null
          storefront_tagline: string | null
          storefront_tier: string | null
          storefront_video_url: string | null
          stripe_account_id: string | null
          terms_accepted: boolean | null
          terms_accepted_at: string | null
          total_earnings_cents: number | null
          total_participants_served: number | null
          total_reviews: number | null
          total_sessions_hosted: number | null
          updated_at: string | null
          username: string | null
          verified_credentials: Json | null
          website_url: string | null
          wompi_merchant_id: string | null
          years_experience: number | null
        }
        Insert: {
          avatar_url?: string | null
          average_rating?: number | null
          banned?: boolean | null
          banner_url?: string | null
          bio?: string | null
          certifications?: string[] | null
          created_at?: string | null
          date_of_birth?: string | null
          earnings_currency?: string | null
          email: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          facebook_url?: string | null
          fcm_platform?: string | null
          fcm_token?: string | null
          fcm_updated_at?: string | null
          follower_count?: number
          following_count?: number
          id: string
          instagram_username?: string | null
          instructor_bio?: string | null
          is_admin?: boolean | null
          is_instructor?: boolean | null
          is_verified_instructor?: boolean | null
          last_login_at?: string | null
          last_motivation_message_id?: string | null
          last_motivation_sent?: string | null
          last_reengagement_sent?: string | null
          last_weekly_recap_sent?: string | null
          location?: string | null
          location_lat?: number | null
          location_lng?: number | null
          name?: string | null
          photos?: string[] | null
          payout_account_number?: string | null
          payout_account_type?: string | null
          payout_bank_name?: string | null
          payout_document_number?: string | null
          payout_document_type?: string | null
          payout_method?: string | null
          preferred_language?: string | null
          preferred_sports?: string[] | null
          push_subscription?: Json | null
          rating?: number | null
          safety_waiver_accepted?: boolean | null
          safety_waiver_accepted_at?: string | null
          session_reminders_enabled?: boolean | null
          sessions_completed?: number | null
          show_rate?: number | null
          specialties?: string[] | null
          sports?: string[] | null
          storefront_banner_url?: string | null
          storefront_pro_expires?: string | null
          storefront_pro_since?: string | null
          storefront_tagline?: string | null
          storefront_tier?: string | null
          storefront_video_url?: string | null
          stripe_account_id?: string | null
          terms_accepted?: boolean | null
          terms_accepted_at?: string | null
          total_earnings_cents?: number | null
          total_participants_served?: number | null
          total_reviews?: number | null
          total_sessions_hosted?: number | null
          updated_at?: string | null
          username?: string | null
          verified_credentials?: Json | null
          website_url?: string | null
          wompi_merchant_id?: string | null
          years_experience?: number | null
        }
        Update: {
          avatar_url?: string | null
          average_rating?: number | null
          banned?: boolean | null
          banner_url?: string | null
          bio?: string | null
          certifications?: string[] | null
          created_at?: string | null
          date_of_birth?: string | null
          earnings_currency?: string | null
          email?: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          facebook_url?: string | null
          fcm_platform?: string | null
          fcm_token?: string | null
          fcm_updated_at?: string | null
          follower_count?: number
          following_count?: number
          id?: string
          instagram_username?: string | null
          instructor_bio?: string | null
          is_admin?: boolean | null
          is_instructor?: boolean | null
          is_verified_instructor?: boolean | null
          last_login_at?: string | null
          last_motivation_message_id?: string | null
          last_motivation_sent?: string | null
          last_reengagement_sent?: string | null
          last_weekly_recap_sent?: string | null
          location?: string | null
          location_lat?: number | null
          location_lng?: number | null
          name?: string | null
          photos?: string[] | null
          payout_account_number?: string | null
          payout_account_type?: string | null
          payout_bank_name?: string | null
          payout_document_number?: string | null
          payout_document_type?: string | null
          payout_method?: string | null
          preferred_language?: string | null
          preferred_sports?: string[] | null
          push_subscription?: Json | null
          rating?: number | null
          safety_waiver_accepted?: boolean | null
          safety_waiver_accepted_at?: string | null
          session_reminders_enabled?: boolean | null
          sessions_completed?: number | null
          show_rate?: number | null
          specialties?: string[] | null
          sports?: string[] | null
          storefront_banner_url?: string | null
          storefront_pro_expires?: string | null
          storefront_pro_since?: string | null
          storefront_tagline?: string | null
          storefront_tier?: string | null
          storefront_video_url?: string | null
          stripe_account_id?: string | null
          terms_accepted?: boolean | null
          terms_accepted_at?: string | null
          total_earnings_cents?: number | null
          total_participants_served?: number | null
          total_reviews?: number | null
          total_sessions_hosted?: number | null
          updated_at?: string | null
          username?: string | null
          verified_credentials?: Json | null
          website_url?: string | null
          wompi_merchant_id?: string | null
          years_experience?: number | null
        }
        Relationships: []
      }
      user_follows: {
        Row: {
          id: string
          follower_id: string
          following_id: string
          created_at: string
        }
        Insert: {
          id?: string
          follower_id: string
          following_id: string
          created_at?: string
        }
        Update: {
          id?: string
          follower_id?: string
          following_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      storefront_media: {
        Row: {
          id: string
          user_id: string
          media_url: string
          media_type: string
          thumbnail_url: string | null
          caption: string | null
          display_order: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          media_url: string
          media_type: string
          thumbnail_url?: string | null
          caption?: string | null
          display_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          media_url?: string
          media_type?: string
          thumbnail_url?: string | null
          caption?: string | null
          display_order?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "storefront_media_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      service_packages: {
        Row: {
          id: string
          instructor_id: string
          name: string
          description: string | null
          price_cents: number
          currency: string
          package_type: string
          session_count: number | null
          duration_days: number | null
          is_active: boolean
          tag: string | null
          display_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          instructor_id: string
          name: string
          description?: string | null
          price_cents: number
          currency?: string
          package_type?: string
          session_count?: number | null
          duration_days?: number | null
          is_active?: boolean
          tag?: string | null
          display_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          instructor_id?: string
          name?: string
          description?: string | null
          price_cents?: number
          currency?: string
          package_type?: string
          session_count?: number | null
          duration_days?: number | null
          is_active?: boolean
          tag?: string | null
          display_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_packages_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      instructor_posts: {
        Row: {
          id: string
          author_id: string
          content: string
          media_url: string | null
          media_type: string | null
          linked_session_id: string | null
          like_count: number
          view_count: number
          is_pinned: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          author_id: string
          content: string
          media_url?: string | null
          media_type?: string | null
          linked_session_id?: string | null
          like_count?: number
          view_count?: number
          is_pinned?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          author_id?: string
          content?: string
          media_url?: string | null
          media_type?: string | null
          linked_session_id?: string | null
          like_count?: number
          view_count?: number
          is_pinned?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instructor_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instructor_posts_linked_session_id_fkey"
            columns: ["linked_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          id: string
          post_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          post_id: string
          user_id: string
          created_at?: string
        }
        Update: {
          id?: string
          post_id?: string
          user_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "instructor_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_codes: {
        Row: {
          id: string
          instructor_id: string
          code: string
          discount_type: string
          discount_value: number
          currency: string | null
          max_uses: number | null
          current_uses: number
          applies_to: string
          applies_to_id: string | null
          min_amount_cents: number | null
          starts_at: string
          expires_at: string | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          instructor_id: string
          code: string
          discount_type: string
          discount_value?: number
          currency?: string | null
          max_uses?: number | null
          current_uses?: number
          applies_to?: string
          applies_to_id?: string | null
          min_amount_cents?: number | null
          starts_at?: string
          expires_at?: string | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          instructor_id?: string
          code?: string
          discount_type?: string
          discount_value?: number
          currency?: string | null
          max_uses?: number | null
          current_uses?: number
          applies_to?: string
          applies_to_id?: string | null
          min_amount_cents?: number | null
          starts_at?: string
          expires_at?: string | null
          is_active?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_codes_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_redemptions: {
        Row: {
          id: string
          promo_code_id: string
          user_id: string
          payment_id: string | null
          discount_amount_cents: number
          created_at: string
        }
        Insert: {
          id?: string
          promo_code_id: string
          user_id: string
          payment_id?: string | null
          discount_amount_cents: number
          created_at?: string
        }
        Update: {
          id?: string
          promo_code_id?: string
          user_id?: string
          payment_id?: string | null
          discount_amount_cents?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_redemptions_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      boost_campaigns: {
        Row: {
          id: string
          instructor_id: string
          boost_type: string
          boosted_session_id: string | null
          boosted_post_id: string | null
          tier: string
          daily_budget_cents: number
          currency: string
          total_budget_cents: number
          spent_cents: number
          starts_at: string
          ends_at: string
          impressions: number
          clicks: number
          conversions: number
          status: string
          boost_payment_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          instructor_id: string
          boost_type: string
          boosted_session_id?: string | null
          boosted_post_id?: string | null
          tier: string
          daily_budget_cents: number
          currency?: string
          total_budget_cents: number
          spent_cents?: number
          starts_at?: string
          ends_at: string
          impressions?: number
          clicks?: number
          conversions?: number
          status?: string
          boost_payment_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          instructor_id?: string
          boost_type?: string
          boosted_session_id?: string | null
          boosted_post_id?: string | null
          tier?: string
          daily_budget_cents?: number
          currency?: string
          total_budget_cents?: number
          spent_cents?: number
          starts_at?: string
          ends_at?: string
          impressions?: number
          clicks?: number
          conversions?: number
          status?: string
          boost_payment_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "boost_campaigns_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boost_campaigns_boosted_session_id_fkey"
            columns: ["boosted_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boost_campaigns_boosted_post_id_fkey"
            columns: ["boosted_post_id"]
            isOneToOne: false
            referencedRelation: "instructor_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_training_preferences: {
        Row: {
          id: string
          user_id: string
          preferred_sports: string[]
          availability: Json
          gender_preference: string
          max_distance_km: number
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          preferred_sports?: string[]
          availability?: Json
          gender_preference?: string
          max_distance_km?: number
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          preferred_sports?: string[]
          availability?: Json
          gender_preference?: string
          max_distance_km?: number
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_training_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      smart_matches: {
        Row: {
          id: string
          user_id: string
          matched_user_id: string
          score: number
          shared_sports: string[]
          distance_km: number | null
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          matched_user_id: string
          score?: number
          shared_sports?: string[]
          distance_km?: number | null
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          matched_user_id?: string
          score?: number
          shared_sports?: string[]
          distance_km?: number | null
          status?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "smart_matches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smart_matches_matched_user_id_fkey"
            columns: ["matched_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      community_news: {
        Row: {
          id: string
          title: string
          title_es: string | null
          summary: string
          summary_es: string | null
          body_url: string
          image_url: string | null
          source: string
          category: string
          published_at: string
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          title_es?: string | null
          summary: string
          summary_es?: string | null
          body_url: string
          image_url?: string | null
          source: string
          category?: string
          published_at?: string
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          title_es?: string | null
          summary?: string
          summary_es?: string | null
          body_url?: string
          image_url?: string | null
          source?: string
          category?: string
          published_at?: string
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_attendance_stats: {
        Args: { user_uuid: string }
        Returns: {
          attendance_rate: number
          attended_sessions: number
          total_sessions: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

// Convenience type aliases for common tables
export type Session = Database['public']['Tables']['sessions']['Row'];
export type SessionInsert = Database['public']['Tables']['sessions']['Insert'];
export type SessionUpdate = Database['public']['Tables']['sessions']['Update'];

export type User = Database['public']['Tables']['users']['Row'];
export type UserInsert = Database['public']['Tables']['users']['Insert'];
export type UserUpdate = Database['public']['Tables']['users']['Update'];

export type SessionParticipant = Database['public']['Tables']['session_participants']['Row'];
export type SessionParticipantInsert = Database['public']['Tables']['session_participants']['Insert'];

export type ChatMessage = Database['public']['Tables']['chat_messages']['Row'];
export type Review = Database['public']['Tables']['reviews']['Row'];
export type LiveStatus = Database['public']['Tables']['live_status']['Row'];
export type SessionStory = Database['public']['Tables']['session_stories']['Row'];
export type SessionComment = Database['public']['Tables']['session_comments']['Row'];
export type SessionCommentInsert = Database['public']['Tables']['session_comments']['Insert'];

export type UserTrainingPreferences = Database['public']['Tables']['user_training_preferences']['Row'];
export type UserTrainingPreferencesInsert = Database['public']['Tables']['user_training_preferences']['Insert'];
export type UserTrainingPreferencesUpdate = Database['public']['Tables']['user_training_preferences']['Update'];

export type SmartMatchRow = Database['public']['Tables']['smart_matches']['Row'];
export type SmartMatchInsert = Database['public']['Tables']['smart_matches']['Insert'];

// Featured Partners types (table created in migration 018)
export interface FeaturedPartnerRow {
  id: string;
  user_id: string;
  business_name: string;
  business_type: string;
  description: string | null;
  description_es: string | null;
  logo_url: string | null;
  banner_url: string | null;
  website_url: string | null;
  phone: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  specialties: string[];
  tier: string;
  status: string;
  starts_at: string | null;
  expires_at: string | null;
  monthly_fee_cents: number;
  currency: string;
  total_impressions: number;
  total_clicks: number;
  total_bookings: number;
  min_sessions_per_month: number;
  min_rating: number;
  created_at: string;
  updated_at: string;
}

export interface FeaturedPartnerInsert {
  user_id: string;
  business_name: string;
  business_type?: string;
  description?: string | null;
  description_es?: string | null;
  logo_url?: string | null;
  banner_url?: string | null;
  website_url?: string | null;
  phone?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  specialties?: string[];
  tier?: string;
  status?: string;
  starts_at?: string | null;
  expires_at?: string | null;
  monthly_fee_cents?: number;
  currency?: string;
}

export interface PartnerInstructorRow {
  id: string;
  partner_id: string;
  instructor_id: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export interface PartnerInstructorInsert {
  partner_id: string;
  instructor_id: string;
  role?: string;
  is_active?: boolean;
}
