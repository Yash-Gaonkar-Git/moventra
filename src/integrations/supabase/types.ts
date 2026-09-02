// This file matches the real TransitTrack Supabase backend (project bbgseizwyreueyyewihi).
// It replaces the previous "Nashik demo" schema — do not regenerate against the old project.
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
      drivers: {
        Row: {
          id: string
          full_name: string
          phone: string | null
          license_no: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name: string
          phone?: string | null
          license_no?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string
          phone?: string | null
          license_no?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      buses: {
        Row: {
          id: string
          bus_number: string
          capacity: number | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          bus_number: string
          capacity?: number | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          bus_number?: string
          capacity?: number | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      routes: {
        Row: {
          id: string
          route_code: string
          name: string
          origin: string
          destination: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          route_code: string
          name: string
          origin: string
          destination: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          route_code?: string
          name?: string
          origin?: string
          destination?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      bus_stops: {
        Row: {
          id: string
          route_id: string
          stop_name: string
          latitude: number
          longitude: number
          stop_order: number
          created_at: string
        }
        Insert: {
          id?: string
          route_id: string
          stop_name: string
          latitude: number
          longitude: number
          stop_order: number
          created_at?: string
        }
        Update: {
          id?: string
          route_id?: string
          stop_name?: string
          latitude?: number
          longitude?: number
          stop_order?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bus_stops_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          id: string
          bus_id: string
          route_id: string
          driver_id: string
          status: string
          started_at: string | null
          ended_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          bus_id: string
          route_id: string
          driver_id: string
          status?: string
          started_at?: string | null
          ended_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          bus_id?: string
          route_id?: string
          driver_id?: string
          status?: string
          started_at?: string | null
          ended_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_bus_id_fkey"
            columns: ["bus_id"]
            isOneToOne: false
            referencedRelation: "buses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      live_locations: {
        Row: {
          id: string
          trip_id: string
          bus_id: string
          latitude: number
          longitude: number
          recorded_at: string
          created_at: string
        }
        Insert: {
          id?: string
          trip_id: string
          bus_id: string
          latitude: number
          longitude: number
          recorded_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          trip_id?: string
          bus_id?: string
          latitude?: number
          longitude?: number
          recorded_at?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_locations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_locations_bus_id_fkey"
            columns: ["bus_id"]
            isOneToOne: false
            referencedRelation: "buses"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_stop_events: {
        Row: {
          id: string
          trip_id: string
          stop_id: string
          bus_id: string
          arrived_at: string
          distance_meters: number
          created_at: string
        }
        Insert: {
          id?: string
          trip_id: string
          stop_id: string
          bus_id: string
          arrived_at: string
          distance_meters: number
          created_at?: string
        }
        Update: {
          id?: string
          trip_id?: string
          stop_id?: string
          bus_id?: string
          arrived_at?: string
          distance_meters?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_stop_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_stop_events_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "bus_stops"
            referencedColumns: ["id"]
          },
        ]
      }
      passenger_alerts: {
        Row: {
          id: string
          trip_id: string | null
          bus_id: string | null
          alert_type: string
          message: string
          created_by: string | null
          created_at: string
          subscriber_id: string | null
          stop_id: string | null
          status: string
          triggered_at: string | null
        }
        Insert: {
          id?: string
          trip_id?: string | null
          bus_id?: string | null
          alert_type?: string
          message: string
          created_by?: string | null
          created_at?: string
          subscriber_id?: string | null
          stop_id?: string | null
          status?: string
          triggered_at?: string | null
        }
        Update: {
          id?: string
          trip_id?: string | null
          bus_id?: string | null
          alert_type?: string
          message?: string
          created_by?: string | null
          created_at?: string
          subscriber_id?: string | null
          stop_id?: string | null
          status?: string
          triggered_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "passenger_alerts_bus_id_fkey"
            columns: ["bus_id"]
            isOneToOne: false
            referencedRelation: "buses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passenger_alerts_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "bus_stops"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_trip_progress: {
        Args: { p_trip_id: string }
        Returns: Json
      }
      get_eta_to_next_stop: {
        Args: { p_trip_id: string }
        Returns: Json
      }
      get_bus_status: {
        Args: { p_bus_id: string }
        Returns: Json
      }
      haversine_distance_meters: {
        Args: { lat1: number; lng1: number; lat2: number; lng2: number }
        Returns: number
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

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
