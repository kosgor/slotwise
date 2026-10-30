export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      ai_usage: {
        Row: {
          cost_micros: number;
          created_at: string;
          feature: string;
          id: string;
          model: string;
          provider_id: string | null;
          status: string;
          tokens_in: number;
          tokens_out: number;
          user_id: string | null;
        };
        Insert: {
          cost_micros?: number;
          created_at?: string;
          feature: string;
          id?: string;
          model?: string;
          provider_id?: string | null;
          status?: string;
          tokens_in?: number;
          tokens_out?: number;
          user_id?: string | null;
        };
        Update: {
          cost_micros?: number;
          created_at?: string;
          feature?: string;
          id?: string;
          model?: string;
          provider_id?: string | null;
          status?: string;
          tokens_in?: number;
          tokens_out?: number;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ai_usage_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "catalog_providers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_usage_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "providers";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          data: Json;
          entity: string;
          entity_id: string;
          id: number;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          data?: Json;
          entity: string;
          entity_id: string;
          id?: never;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          data?: Json;
          entity?: string;
          entity_id?: string;
          id?: never;
        };
        Relationships: [];
      };
      availability_exceptions: {
        Row: {
          created_at: string;
          date: string;
          end_time: string | null;
          id: string;
          provider_id: string;
          reason: string;
          start_time: string | null;
        };
        Insert: {
          created_at?: string;
          date: string;
          end_time?: string | null;
          id?: string;
          provider_id: string;
          reason?: string;
          start_time?: string | null;
        };
        Update: {
          created_at?: string;
          date?: string;
          end_time?: string | null;
          id?: string;
          provider_id?: string;
          reason?: string;
          start_time?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "availability_exceptions_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "catalog_providers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "availability_exceptions_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "providers";
            referencedColumns: ["id"];
          },
        ];
      };
      availability_rules: {
        Row: {
          created_at: string;
          end_time: string;
          id: string;
          provider_id: string;
          start_time: string;
          weekday: number;
        };
        Insert: {
          created_at?: string;
          end_time: string;
          id?: string;
          provider_id: string;
          start_time: string;
          weekday: number;
        };
        Update: {
          created_at?: string;
          end_time?: string;
          id?: string;
          provider_id?: string;
          start_time?: string;
          weekday?: number;
        };
        Relationships: [
          {
            foreignKeyName: "availability_rules_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "catalog_providers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "availability_rules_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "providers";
            referencedColumns: ["id"];
          },
        ];
      };
      bookings: {
        Row: {
          cancelled_at: string | null;
          cancelled_by: string | null;
          client_email: string;
          client_id: string;
          client_name: string;
          created_at: string;
          currency: string;
          duration_min: number;
          ends_at: string;
          expires_at: string | null;
          id: string;
          paid_cents: number;
          price_cents: number;
          provider_id: string;
          provider_name: string;
          provider_timezone: string;
          refunded_cents: number;
          service_id: string;
          service_title: string;
          starts_at: string;
          status: Database["public"]["Enums"]["booking_status"];
          stripe_checkout_session_id: string | null;
        };
        Insert: {
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          client_email: string;
          client_id: string;
          client_name: string;
          created_at?: string;
          currency: string;
          duration_min: number;
          ends_at: string;
          expires_at?: string | null;
          id?: string;
          paid_cents?: number;
          price_cents: number;
          provider_id: string;
          provider_name: string;
          provider_timezone: string;
          refunded_cents?: number;
          service_id: string;
          service_title: string;
          starts_at: string;
          status?: Database["public"]["Enums"]["booking_status"];
          stripe_checkout_session_id?: string | null;
        };
        Update: {
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          client_email?: string;
          client_id?: string;
          client_name?: string;
          created_at?: string;
          currency?: string;
          duration_min?: number;
          ends_at?: string;
          expires_at?: string | null;
          id?: string;
          paid_cents?: number;
          price_cents?: number;
          provider_id?: string;
          provider_name?: string;
          provider_timezone?: string;
          refunded_cents?: number;
          service_id?: string;
          service_title?: string;
          starts_at?: string;
          status?: Database["public"]["Enums"]["booking_status"];
          stripe_checkout_session_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "bookings_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "catalog_providers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "providers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
        ];
      };
      conversations: {
        Row: {
          created_at: string;
          id: string;
          provider_id: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          provider_id?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          provider_id?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "catalog_providers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "providers";
            referencedColumns: ["id"];
          },
        ];
      };
      document_chunks: {
        Row: {
          chunk_index: number;
          content: string;
          created_at: string;
          document_id: string;
          embedding: string;
          id: string;
          metadata: Json;
          provider_id: string;
        };
        Insert: {
          chunk_index: number;
          content: string;
          created_at?: string;
          document_id: string;
          embedding: string;
          id?: string;
          metadata?: Json;
          provider_id: string;
        };
        Update: {
          chunk_index?: number;
          content?: string;
          created_at?: string;
          document_id?: string;
          embedding?: string;
          id?: string;
          metadata?: Json;
          provider_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_chunks_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "provider_documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_chunks_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "catalog_providers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_chunks_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "providers";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          conversation_id: string;
          created_at: string;
          id: string;
          parts: Json;
          role: string;
        };
        Insert: {
          conversation_id: string;
          created_at?: string;
          id: string;
          parts: Json;
          role: string;
        };
        Update: {
          conversation_id?: string;
          created_at?: string;
          id?: string;
          parts?: Json;
          role?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          amount_cents: number;
          booking_id: string;
          created_at: string;
          currency: string;
          id: string;
          refunded_cents: number;
          status: Database["public"]["Enums"]["payment_status"];
          stripe_checkout_session_id: string;
          stripe_payment_intent_id: string;
          updated_at: string;
        };
        Insert: {
          amount_cents: number;
          booking_id: string;
          created_at?: string;
          currency: string;
          id?: string;
          refunded_cents?: number;
          status?: Database["public"]["Enums"]["payment_status"];
          stripe_checkout_session_id: string;
          stripe_payment_intent_id: string;
          updated_at?: string;
        };
        Update: {
          amount_cents?: number;
          booking_id?: string;
          created_at?: string;
          currency?: string;
          id?: string;
          refunded_cents?: number;
          status?: Database["public"]["Enums"]["payment_status"];
          stripe_checkout_session_id?: string;
          stripe_payment_intent_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          full_name: string;
          id: string;
          role: Database["public"]["Enums"]["user_role"];
        };
        Insert: {
          created_at?: string;
          full_name?: string;
          id: string;
          role?: Database["public"]["Enums"]["user_role"];
        };
        Update: {
          created_at?: string;
          full_name?: string;
          id?: string;
          role?: Database["public"]["Enums"]["user_role"];
        };
        Relationships: [];
      };
      provider_documents: {
        Row: {
          chunk_count: number;
          created_at: string;
          error: string | null;
          id: string;
          provider_id: string;
          size_bytes: number;
          status: Database["public"]["Enums"]["document_status"];
          storage_path: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          chunk_count?: number;
          created_at?: string;
          error?: string | null;
          id?: string;
          provider_id: string;
          size_bytes: number;
          status?: Database["public"]["Enums"]["document_status"];
          storage_path: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          chunk_count?: number;
          created_at?: string;
          error?: string | null;
          id?: string;
          provider_id?: string;
          size_bytes?: number;
          status?: Database["public"]["Enums"]["document_status"];
          storage_path?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "provider_documents_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "catalog_providers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_documents_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "providers";
            referencedColumns: ["id"];
          },
        ];
      };
      provider_subscriptions: {
        Row: {
          cancel_at_period_end: boolean;
          current_period_end: string | null;
          plan: Database["public"]["Enums"]["subscription_plan"];
          price_lookup_key: string | null;
          provider_id: string;
          status: string;
          stripe_customer_id: string;
          stripe_subscription_id: string | null;
          updated_at: string;
        };
        Insert: {
          cancel_at_period_end?: boolean;
          current_period_end?: string | null;
          plan?: Database["public"]["Enums"]["subscription_plan"];
          price_lookup_key?: string | null;
          provider_id: string;
          status?: string;
          stripe_customer_id: string;
          stripe_subscription_id?: string | null;
          updated_at?: string;
        };
        Update: {
          cancel_at_period_end?: boolean;
          current_period_end?: string | null;
          plan?: Database["public"]["Enums"]["subscription_plan"];
          price_lookup_key?: string | null;
          provider_id?: string;
          status?: string;
          stripe_customer_id?: string;
          stripe_subscription_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "provider_subscriptions_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: true;
            referencedRelation: "catalog_providers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_subscriptions_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: true;
            referencedRelation: "providers";
            referencedColumns: ["id"];
          },
        ];
      };
      providers: {
        Row: {
          bio: string;
          category: Database["public"]["Enums"]["provider_category"];
          city: string;
          created_at: string;
          display_name: string;
          headline: string;
          id: string;
          languages: string[];
          offers_in_person: boolean;
          offers_online: boolean;
          photo_url: string | null;
          review_note: string | null;
          reviewed_at: string | null;
          slug: string;
          status: Database["public"]["Enums"]["provider_status"];
          timezone: string;
          updated_at: string;
          user_id: string | null;
          years_experience: number;
        };
        Insert: {
          bio?: string;
          category: Database["public"]["Enums"]["provider_category"];
          city: string;
          created_at?: string;
          display_name: string;
          headline: string;
          id?: string;
          languages?: string[];
          offers_in_person?: boolean;
          offers_online?: boolean;
          photo_url?: string | null;
          review_note?: string | null;
          reviewed_at?: string | null;
          slug: string;
          status?: Database["public"]["Enums"]["provider_status"];
          timezone: string;
          updated_at?: string;
          user_id?: string | null;
          years_experience?: number;
        };
        Update: {
          bio?: string;
          category?: Database["public"]["Enums"]["provider_category"];
          city?: string;
          created_at?: string;
          display_name?: string;
          headline?: string;
          id?: string;
          languages?: string[];
          offers_in_person?: boolean;
          offers_online?: boolean;
          photo_url?: string | null;
          review_note?: string | null;
          reviewed_at?: string | null;
          slug?: string;
          status?: Database["public"]["Enums"]["provider_status"];
          timezone?: string;
          updated_at?: string;
          user_id?: string | null;
          years_experience?: number;
        };
        Relationships: [];
      };
      reviews: {
        Row: {
          author_name: string;
          body: string;
          created_at: string;
          hidden: boolean;
          hidden_reason: string | null;
          id: string;
          moderated_at: string | null;
          provider_id: string;
          rating: number;
        };
        Insert: {
          author_name: string;
          body: string;
          created_at?: string;
          hidden?: boolean;
          hidden_reason?: string | null;
          id?: string;
          moderated_at?: string | null;
          provider_id: string;
          rating: number;
        };
        Update: {
          author_name?: string;
          body?: string;
          created_at?: string;
          hidden?: boolean;
          hidden_reason?: string | null;
          id?: string;
          moderated_at?: string | null;
          provider_id?: string;
          rating?: number;
        };
        Relationships: [
          {
            foreignKeyName: "reviews_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "catalog_providers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "providers";
            referencedColumns: ["id"];
          },
        ];
      };
      services: {
        Row: {
          active: boolean;
          created_at: string;
          currency: string;
          description: string;
          duration_min: number;
          id: string;
          price_cents: number;
          provider_id: string;
          title: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          currency?: string;
          description?: string;
          duration_min: number;
          id?: string;
          price_cents: number;
          provider_id: string;
          title: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          currency?: string;
          description?: string;
          duration_min?: number;
          id?: string;
          price_cents?: number;
          provider_id?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "services_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "catalog_providers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "services_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "providers";
            referencedColumns: ["id"];
          },
        ];
      };
      stripe_events: {
        Row: {
          id: string;
          processed_at: string | null;
          received_at: string;
          result: string | null;
          type: string;
        };
        Insert: {
          id: string;
          processed_at?: string | null;
          received_at?: string;
          result?: string | null;
          type: string;
        };
        Update: {
          id?: string;
          processed_at?: string | null;
          received_at?: string;
          result?: string | null;
          type?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      catalog_providers: {
        Row: {
          bio: string | null;
          category: Database["public"]["Enums"]["provider_category"] | null;
          city: string | null;
          currency: string | null;
          display_name: string | null;
          headline: string | null;
          id: string | null;
          languages: string[] | null;
          min_price_cents: number | null;
          offers_in_person: boolean | null;
          offers_online: boolean | null;
          photo_url: string | null;
          rating_avg: number | null;
          review_count: number | null;
          slug: string | null;
          timezone: string | null;
          updated_at: string | null;
          years_experience: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      ai_requests_left: { Args: never; Returns: number };
      apply_as_provider: {
        Args: {
          p_bio: string;
          p_category: Database["public"]["Enums"]["provider_category"];
          p_city: string;
          p_display_name: string;
          p_headline: string;
          p_offers_in_person: boolean;
          p_offers_online: boolean;
          p_timezone: string;
        };
        Returns: {
          bio: string;
          category: Database["public"]["Enums"]["provider_category"];
          city: string;
          created_at: string;
          display_name: string;
          headline: string;
          id: string;
          languages: string[];
          offers_in_person: boolean;
          offers_online: boolean;
          photo_url: string | null;
          review_note: string | null;
          reviewed_at: string | null;
          slug: string;
          status: Database["public"]["Enums"]["provider_status"];
          timezone: string;
          updated_at: string;
          user_id: string | null;
          years_experience: number;
        };
        SetofOptions: {
          from: "*";
          to: "providers";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      book_slot: {
        Args: { p_service_id: string; p_starts_at: string };
        Returns: {
          cancelled_at: string | null;
          cancelled_by: string | null;
          client_email: string;
          client_id: string;
          client_name: string;
          created_at: string;
          currency: string;
          duration_min: number;
          ends_at: string;
          expires_at: string | null;
          id: string;
          paid_cents: number;
          price_cents: number;
          provider_id: string;
          provider_name: string;
          provider_timezone: string;
          refunded_cents: number;
          service_id: string;
          service_title: string;
          starts_at: string;
          status: Database["public"]["Enums"]["booking_status"];
          stripe_checkout_session_id: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "bookings";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      cancel_booking: {
        Args: { p_booking_id: string };
        Returns: {
          cancelled_at: string | null;
          cancelled_by: string | null;
          client_email: string;
          client_id: string;
          client_name: string;
          created_at: string;
          currency: string;
          duration_min: number;
          ends_at: string;
          expires_at: string | null;
          id: string;
          paid_cents: number;
          price_cents: number;
          provider_id: string;
          provider_name: string;
          provider_timezone: string;
          refunded_cents: number;
          service_id: string;
          service_title: string;
          starts_at: string;
          status: Database["public"]["Enums"]["booking_status"];
          stripe_checkout_session_id: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "bookings";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      claim_ai_request: {
        Args: { p_feature: string; p_provider_id?: string };
        Returns: string;
      };
      custom_access_token_hook: { Args: { event: Json }; Returns: Json };
      expire_stale_bookings: {
        Args: never;
        Returns: {
          booking_id: string;
          stripe_checkout_session_id: string;
        }[];
      };
      extend_payment_hold: {
        Args: { p_booking_id: string };
        Returns: {
          cancelled_at: string | null;
          cancelled_by: string | null;
          client_email: string;
          client_id: string;
          client_name: string;
          created_at: string;
          currency: string;
          duration_min: number;
          ends_at: string;
          expires_at: string | null;
          id: string;
          paid_cents: number;
          price_cents: number;
          provider_id: string;
          provider_name: string;
          provider_timezone: string;
          refunded_cents: number;
          service_id: string;
          service_title: string;
          starts_at: string;
          status: Database["public"]["Enums"]["booking_status"];
          stripe_checkout_session_id: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "bookings";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      match_document_chunks: {
        Args: {
          p_embedding: string;
          p_limit?: number;
          p_provider_id: string;
          p_threshold?: number;
        };
        Returns: {
          content: string;
          document_id: string;
          document_title: string;
          id: string;
          similarity: number;
        }[];
      };
      moderate_review: {
        Args: { p_hidden: boolean; p_reason?: string; p_review_id: string };
        Returns: {
          author_name: string;
          body: string;
          created_at: string;
          hidden: boolean;
          hidden_reason: string | null;
          id: string;
          moderated_at: string | null;
          provider_id: string;
          rating: number;
        };
        SetofOptions: {
          from: "*";
          to: "reviews";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      provider_busy_intervals: {
        Args: { p_from: string; p_provider_id: string; p_to: string };
        Returns: {
          ends_at: string;
          starts_at: string;
        }[];
      };
      remove_provider: {
        Args: { p_provider_id: string; p_reason?: string };
        Returns: Json;
      };
      replace_availability_rules: {
        Args: { p_provider_id: string; p_rules: Json };
        Returns: {
          created_at: string;
          end_time: string;
          id: string;
          provider_id: string;
          start_time: string;
          weekday: number;
        }[];
        SetofOptions: {
          from: "*";
          to: "availability_rules";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      replace_document_chunks: {
        Args: { p_chunks: Json; p_document_id: string };
        Returns: number;
      };
      review_provider: {
        Args: { p_decision: string; p_note?: string; p_provider_id: string };
        Returns: {
          bio: string;
          category: Database["public"]["Enums"]["provider_category"];
          city: string;
          created_at: string;
          display_name: string;
          headline: string;
          id: string;
          languages: string[];
          offers_in_person: boolean;
          offers_online: boolean;
          photo_url: string | null;
          review_note: string | null;
          reviewed_at: string | null;
          slug: string;
          status: Database["public"]["Enums"]["provider_status"];
          timezone: string;
          updated_at: string;
          user_id: string | null;
          years_experience: number;
        };
        SetofOptions: {
          from: "*";
          to: "providers";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      stripe_charge_refunded: {
        Args: {
          p_event_id: string;
          p_event_type: string;
          p_payment_intent_id: string;
          p_refunded_cents: number;
        };
        Returns: string;
      };
      stripe_checkout_completed: {
        Args: {
          p_amount_cents: number;
          p_booking_id: string;
          p_currency: string;
          p_event_id: string;
          p_event_type: string;
          p_payment_intent_id: string;
          p_session_id: string;
        };
        Returns: string;
      };
      stripe_checkout_expired: {
        Args: { p_booking_id: string; p_event_id: string; p_event_type: string };
        Returns: string;
      };
      stripe_sync_subscription: {
        Args: {
          p_cancel_at_period_end: boolean;
          p_current_period_end: string;
          p_customer_id: string;
          p_event_id: string;
          p_event_type: string;
          p_plan: Database["public"]["Enums"]["subscription_plan"];
          p_price_lookup_key: string;
          p_provider_id: string;
          p_status: string;
          p_subscription_id: string;
        };
        Returns: string;
      };
    };
    Enums: {
      booking_status: "pending_payment" | "confirmed" | "cancelled" | "completed" | "expired";
      document_status: "uploaded" | "processing" | "ready" | "failed";
      payment_status: "succeeded" | "partially_refunded" | "refunded";
      provider_category: "tutoring" | "fitness" | "yoga" | "coaching" | "massage" | "music";
      provider_status: "pending" | "approved" | "rejected" | "suspended" | "removed";
      subscription_plan: "free" | "pro";
      user_role: "client" | "provider" | "admin";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      booking_status: ["pending_payment", "confirmed", "cancelled", "completed", "expired"],
      document_status: ["uploaded", "processing", "ready", "failed"],
      payment_status: ["succeeded", "partially_refunded", "refunded"],
      provider_category: ["tutoring", "fitness", "yoga", "coaching", "massage", "music"],
      provider_status: ["pending", "approved", "rejected", "suspended", "removed"],
      subscription_plan: ["free", "pro"],
      user_role: ["client", "provider", "admin"],
    },
  },
} as const;
