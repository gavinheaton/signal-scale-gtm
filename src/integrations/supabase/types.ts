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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      campaign_assets: {
        Row: {
          asset_type: Database["public"]["Enums"]["asset_type"]
          campaign_id: string
          id: string
          persona_target_ids: string[] | null
          publish_date: string | null
          status: Database["public"]["Enums"]["asset_status"]
          title: string
        }
        Insert: {
          asset_type: Database["public"]["Enums"]["asset_type"]
          campaign_id: string
          id?: string
          persona_target_ids?: string[] | null
          publish_date?: string | null
          status?: Database["public"]["Enums"]["asset_status"]
          title: string
        }
        Update: {
          asset_type?: Database["public"]["Enums"]["asset_type"]
          campaign_id?: string
          id?: string
          persona_target_ids?: string[] | null
          publish_date?: string | null
          status?: Database["public"]["Enums"]["asset_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_assets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_metrics: {
        Row: {
          brand_search_volume: number | null
          campaign_id: string
          community_engagement: number | null
          conversion_rate_pct: number | null
          date: string
          id: string
          inbound_referrals: number | null
          pipeline_influenced: number | null
          share_of_voice_pct: number | null
        }
        Insert: {
          brand_search_volume?: number | null
          campaign_id: string
          community_engagement?: number | null
          conversion_rate_pct?: number | null
          date: string
          id?: string
          inbound_referrals?: number | null
          pipeline_influenced?: number | null
          share_of_voice_pct?: number | null
        }
        Update: {
          brand_search_volume?: number | null
          campaign_id?: string
          community_engagement?: number | null
          conversion_rate_pct?: number | null
          date?: string
          id?: string
          inbound_referrals?: number | null
          pipeline_influenced?: number | null
          share_of_voice_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_metrics_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          channel_mix: Json | null
          end_date: string | null
          id: string
          launch_date: string | null
          name: string
          objective: string | null
          project_id: string
          status: Database["public"]["Enums"]["campaign_status"]
          target_icp_ids: string[] | null
          track: Database["public"]["Enums"]["campaign_track"]
        }
        Insert: {
          channel_mix?: Json | null
          end_date?: string | null
          id?: string
          launch_date?: string | null
          name: string
          objective?: string | null
          project_id: string
          status?: Database["public"]["Enums"]["campaign_status"]
          target_icp_ids?: string[] | null
          track: Database["public"]["Enums"]["campaign_track"]
        }
        Update: {
          channel_mix?: Json | null
          end_date?: string | null
          id?: string
          launch_date?: string | null
          name?: string
          objective?: string | null
          project_id?: string
          status?: Database["public"]["Enums"]["campaign_status"]
          target_icp_ids?: string[] | null
          track?: Database["public"]["Enums"]["campaign_track"]
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      icps: {
        Row: {
          access_score: number | null
          anti_icp_signals: Json | null
          buyer_roles: Json | null
          firmographics: Json | null
          fit_score: number | null
          id: string
          matrix_category: Database["public"]["Enums"]["matrix_category"]
          project_id: string
          psychographics: Json | null
          segment_name: string
        }
        Insert: {
          access_score?: number | null
          anti_icp_signals?: Json | null
          buyer_roles?: Json | null
          firmographics?: Json | null
          fit_score?: number | null
          id?: string
          matrix_category: Database["public"]["Enums"]["matrix_category"]
          project_id: string
          psychographics?: Json | null
          segment_name: string
        }
        Update: {
          access_score?: number | null
          anti_icp_signals?: Json | null
          buyer_roles?: Json | null
          firmographics?: Json | null
          fit_score?: number | null
          id?: string
          matrix_category?: Database["public"]["Enums"]["matrix_category"]
          project_id?: string
          psychographics?: Json | null
          segment_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "icps_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      org_memberships: {
        Row: {
          id: string
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          id?: string
          org_id: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      organisations: {
        Row: {
          created_at: string | null
          id: string
          name: string
          type: Database["public"]["Enums"]["org_type"]
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          type?: Database["public"]["Enums"]["org_type"]
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          type?: Database["public"]["Enums"]["org_type"]
        }
        Relationships: []
      }
      personas: {
        Row: {
          ai_readiness_score: number | null
          channel_preferences: Json | null
          goals: Json | null
          how_we_help: string | null
          icp_id: string | null
          id: string
          is_current: boolean | null
          pain_points: Json | null
          persona_name: string
          project_id: string
          role_in_buying: Database["public"]["Enums"]["role_in_buying"]
        }
        Insert: {
          ai_readiness_score?: number | null
          channel_preferences?: Json | null
          goals?: Json | null
          how_we_help?: string | null
          icp_id?: string | null
          id?: string
          is_current?: boolean | null
          pain_points?: Json | null
          persona_name: string
          project_id: string
          role_in_buying: Database["public"]["Enums"]["role_in_buying"]
        }
        Update: {
          ai_readiness_score?: number | null
          channel_preferences?: Json | null
          goals?: Json | null
          how_we_help?: string | null
          icp_id?: string | null
          id?: string
          is_current?: boolean | null
          pain_points?: Json | null
          persona_name?: string
          project_id?: string
          role_in_buying?: Database["public"]["Enums"]["role_in_buying"]
        }
        Relationships: [
          {
            foreignKeyName: "personas_icp_id_fkey"
            columns: ["icp_id"]
            isOneToOne: false
            referencedRelation: "icps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personas_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string | null
          id: string
          methodology_progress: Json | null
          name: string
          org_id: string
          status: Database["public"]["Enums"]["project_status"]
        }
        Insert: {
          created_at?: string | null
          id?: string
          methodology_progress?: Json | null
          name: string
          org_id: string
          status?: Database["public"]["Enums"]["project_status"]
        }
        Update: {
          created_at?: string | null
          id?: string
          methodology_progress?: Json | null
          name?: string
          org_id?: string
          status?: Database["public"]["Enums"]["project_status"]
        }
        Relationships: [
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      wizard_sessions: {
        Row: {
          created_at: string
          draft_output: Json
          id: string
          messages: Json
          project_id: string
          session_type: Database["public"]["Enums"]["wizard_session_type"]
          status: Database["public"]["Enums"]["wizard_session_status"]
        }
        Insert: {
          created_at?: string
          draft_output?: Json
          id?: string
          messages?: Json
          project_id: string
          session_type: Database["public"]["Enums"]["wizard_session_type"]
          status?: Database["public"]["Enums"]["wizard_session_status"]
        }
        Update: {
          created_at?: string
          draft_output?: Json
          id?: string
          messages?: Json
          project_id?: string
          session_type?: Database["public"]["Enums"]["wizard_session_type"]
          status?: Database["public"]["Enums"]["wizard_session_status"]
        }
        Relationships: [
          {
            foreignKeyName: "wizard_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      user_has_org_access: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      user_org_id: { Args: { _user_id: string }; Returns: string }
    }
    Enums: {
      asset_status: "brief" | "draft" | "review" | "approved" | "published"
      asset_type:
        | "blog"
        | "video"
        | "podcast"
        | "linkedin_post"
        | "email"
        | "webinar"
        | "whitepaper"
      campaign_status: "brief" | "planning" | "active" | "complete"
      campaign_track: "demand_capture" | "demand_creation"
      matrix_category:
        | "now_account"
        | "strategic_nurture"
        | "trap_account"
        | "no_go"
      org_role:
        | "superadmin"
        | "owner"
        | "admin"
        | "manager"
        | "analyst"
        | "client"
      org_type: "disruptors_own" | "disruptors_client" | "independent"
      project_status: "setup" | "active" | "review" | "complete"
      role_in_buying:
        | "champion"
        | "economic_buyer"
        | "influencer"
        | "end_user"
        | "blocker"
      wizard_session_status: "in_progress" | "complete"
      wizard_session_type: "icp" | "persona" | "competitor"
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
      asset_status: ["brief", "draft", "review", "approved", "published"],
      asset_type: [
        "blog",
        "video",
        "podcast",
        "linkedin_post",
        "email",
        "webinar",
        "whitepaper",
      ],
      campaign_status: ["brief", "planning", "active", "complete"],
      campaign_track: ["demand_capture", "demand_creation"],
      matrix_category: [
        "now_account",
        "strategic_nurture",
        "trap_account",
        "no_go",
      ],
      org_role: [
        "superadmin",
        "owner",
        "admin",
        "manager",
        "analyst",
        "client",
      ],
      org_type: ["disruptors_own", "disruptors_client", "independent"],
      project_status: ["setup", "active", "review", "complete"],
      role_in_buying: [
        "champion",
        "economic_buyer",
        "influencer",
        "end_user",
        "blocker",
      ],
      wizard_session_status: ["in_progress", "complete"],
      wizard_session_type: ["icp", "persona", "competitor"],
    },
  },
} as const
