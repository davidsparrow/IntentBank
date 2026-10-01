export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      audit_events: {
        Row: {
          action: string
          actor: Database["public"]["Enums"]["audit_actor"]
          created_at: string
          details: Json
          id: number
          subject_id: string | null
          subject_type: string | null
          user_id: string
        }
        Insert: {
          action: string
          actor: Database["public"]["Enums"]["audit_actor"]
          created_at?: string
          details?: Json
          id?: never
          subject_id?: string | null
          subject_type?: string | null
          user_id: string
        }
        Update: {
          action?: string
          actor?: Database["public"]["Enums"]["audit_actor"]
          created_at?: string
          details?: Json
          id?: never
          subject_id?: string | null
          subject_type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          description: string
          is_sensitive: boolean
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          description: string
          is_sensitive?: boolean
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          description?: string
          is_sensitive?: boolean
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      category_permissions: {
        Row: {
          category_slug: string
          collect: boolean
          min_price_cents: number | null
          offer_mode: Database["public"]["Enums"]["offer_mode"]
          updated_at: string
          user_id: string
        }
        Insert: {
          category_slug: string
          collect?: boolean
          min_price_cents?: number | null
          offer_mode?: Database["public"]["Enums"]["offer_mode"]
          updated_at?: string
          user_id: string
        }
        Update: {
          category_slug?: string
          collect?: boolean
          min_price_cents?: number | null
          offer_mode?: Database["public"]["Enums"]["offer_mode"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_permissions_category_slug_fkey"
            columns: ["category_slug"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["slug"]
          },
        ]
      }
      excluded_domains: {
        Row: {
          created_at: string
          domain: string
          user_id: string
        }
        Insert: {
          created_at?: string
          domain: string
          user_id: string
        }
        Update: {
          created_at?: string
          domain?: string
          user_id?: string
        }
        Relationships: []
      }
      intent_signals: {
        Row: {
          intent_id: string
          signal_id: string
          user_id: string
          weight: number
        }
        Insert: {
          intent_id: string
          signal_id: string
          user_id: string
          weight?: number
        }
        Update: {
          intent_id?: string
          signal_id?: string
          user_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "intent_signals_intent_id_user_id_fkey"
            columns: ["intent_id", "user_id"]
            isOneToOne: false
            referencedRelation: "intents"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "intent_signals_signal_id_user_id_fkey"
            columns: ["signal_id", "user_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      intents: {
        Row: {
          category_slug: string
          commercial_value: string | null
          confidence: number
          created_at: string
          derived_by: Database["public"]["Enums"]["provenance"]
          explanation: string | null
          feedback: Database["public"]["Enums"]["intent_feedback"] | null
          first_signal_at: string | null
          id: string
          key: string
          label: string
          last_signal_at: string | null
          purchase_horizon: string | null
          signal_count: number
          source_count: number
          state: Database["public"]["Enums"]["intent_state"]
          updated_at: string
          user_confirmed: boolean
          user_id: string
        }
        Insert: {
          category_slug: string
          commercial_value?: string | null
          confidence: number
          created_at?: string
          derived_by: Database["public"]["Enums"]["provenance"]
          explanation?: string | null
          feedback?: Database["public"]["Enums"]["intent_feedback"] | null
          first_signal_at?: string | null
          id?: string
          key: string
          label: string
          last_signal_at?: string | null
          purchase_horizon?: string | null
          signal_count?: number
          source_count?: number
          state?: Database["public"]["Enums"]["intent_state"]
          updated_at?: string
          user_confirmed?: boolean
          user_id: string
        }
        Update: {
          category_slug?: string
          commercial_value?: string | null
          confidence?: number
          created_at?: string
          derived_by?: Database["public"]["Enums"]["provenance"]
          explanation?: string | null
          feedback?: Database["public"]["Enums"]["intent_feedback"] | null
          first_signal_at?: string | null
          id?: string
          key?: string
          label?: string
          last_signal_at?: string | null
          purchase_horizon?: string | null
          signal_count?: number
          source_count?: number
          state?: Database["public"]["Enums"]["intent_state"]
          updated_at?: string
          user_confirmed?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intents_category_slug_fkey"
            columns: ["category_slug"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["slug"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          onboarded_at: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          onboarded_at?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          onboarded_at?: string | null
        }
        Relationships: []
      }
      signals: {
        Row: {
          amount_cents: number | null
          category_slug: string | null
          classified_by: Database["public"]["Enums"]["provenance"] | null
          created_at: string
          dedupe_key: string
          domain: string | null
          id: string
          kind: Database["public"]["Enums"]["signal_kind"]
          occurred_at: string
          query: string | null
          source_id: string
          title: string | null
          url: string | null
          user_id: string
        }
        Insert: {
          amount_cents?: number | null
          category_slug?: string | null
          classified_by?: Database["public"]["Enums"]["provenance"] | null
          created_at?: string
          dedupe_key: string
          domain?: string | null
          id?: string
          kind: Database["public"]["Enums"]["signal_kind"]
          occurred_at: string
          query?: string | null
          source_id: string
          title?: string | null
          url?: string | null
          user_id: string
        }
        Update: {
          amount_cents?: number | null
          category_slug?: string | null
          classified_by?: Database["public"]["Enums"]["provenance"] | null
          created_at?: string
          dedupe_key?: string
          domain?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["signal_kind"]
          occurred_at?: string
          query?: string | null
          source_id?: string
          title?: string | null
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signals_category_slug_fkey"
            columns: ["category_slug"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "signals_source_id_user_id_fkey"
            columns: ["source_id", "user_id"]
            isOneToOne: false
            referencedRelation: "vault_sources"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      vault_sources: {
        Row: {
          created_at: string
          dropped_excluded_count: number
          dropped_sensitive_count: number
          error: string | null
          id: string
          kind: Database["public"]["Enums"]["source_kind"]
          label: string
          signal_count: number
          status: Database["public"]["Enums"]["source_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dropped_excluded_count?: number
          dropped_sensitive_count?: number
          error?: string | null
          id?: string
          kind: Database["public"]["Enums"]["source_kind"]
          label: string
          signal_count?: number
          status?: Database["public"]["Enums"]["source_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dropped_excluded_count?: number
          dropped_sensitive_count?: number
          error?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["source_kind"]
          label?: string
          signal_count?: number
          status?: Database["public"]["Enums"]["source_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      audit_actor: "user" | "system" | "agent"
      intent_feedback:
        | "still_shopping"
        | "already_bought"
        | "just_researching"
        | "not_interested"
      intent_state:
        | "emerging"
        | "active"
        | "strong"
        | "cooling"
        | "dormant"
        | "purchased"
        | "dismissed"
      offer_mode: "private" | "ask" | "auto"
      provenance: "rule" | "ai" | "user"
      signal_kind:
        | "visit"
        | "search"
        | "purchase"
        | "video"
        | "saved"
        | "subscription"
        | "stated"
      source_kind:
        | "google_takeout"
        | "chrome_history"
        | "amazon_orders"
        | "csv"
        | "manual"
      source_status:
        | "importing"
        | "imported"
        | "classifying"
        | "ready"
        | "error"
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
      audit_actor: ["user", "system", "agent"],
      intent_feedback: [
        "still_shopping",
        "already_bought",
        "just_researching",
        "not_interested",
      ],
      intent_state: [
        "emerging",
        "active",
        "strong",
        "cooling",
        "dormant",
        "purchased",
        "dismissed",
      ],
      offer_mode: ["private", "ask", "auto"],
      provenance: ["rule", "ai", "user"],
      signal_kind: [
        "visit",
        "search",
        "purchase",
        "video",
        "saved",
        "subscription",
        "stated",
      ],
      source_kind: [
        "google_takeout",
        "chrome_history",
        "amazon_orders",
        "csv",
        "manual",
      ],
      source_status: ["importing", "imported", "classifying", "ready", "error"],
    },
  },
} as const

