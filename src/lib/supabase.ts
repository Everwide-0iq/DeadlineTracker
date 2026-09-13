import { createClient } from '@supabase/supabase-js'
import { env } from './env.ts'

export type CardStatus = 'todo' | 'done'
export type BoardScope = 'personal' | 'shared'
export type CardLinkSide = 'top' | 'right' | 'bottom' | 'left'
export type Json = boolean | null | number | string | Json[] | { [key: string]: Json | undefined }

export type Database = {
  public: {
    Tables: {
      cards: {
        Row: {
          id: string
          title: string
          description: string | null
          image_height: number | null
          image_path: string | null
          image_size: number | null
          image_width: number | null
          deadline_at: string | null
          status: CardStatus
          is_active: boolean
          active_by: string | null
          completed_at: string | null
          completed_by: string | null
          board_scope: BoardScope
          project_id: string | null
          x: number
          y: number
          w: number
          h: number
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          image_height?: number | null
          image_path?: string | null
          image_size?: number | null
          image_width?: number | null
          deadline_at?: string | null
          board_scope?: BoardScope
          project_id?: string | null
          status?: CardStatus
          is_active?: boolean
          active_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          x?: number
          y?: number
          w?: number
          h?: number
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          title?: string
          description?: string | null
          image_height?: number | null
          image_path?: string | null
          image_size?: number | null
          image_width?: number | null
          deadline_at?: string | null
          board_scope?: BoardScope
          project_id?: string | null
          status?: CardStatus
          is_active?: boolean
          active_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          x?: number
          y?: number
          w?: number
          h?: number
          created_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          nickname: string
          avatar_path: string | null
          active_color: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          nickname: string
          avatar_path?: string | null
          active_color?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          nickname?: string
          avatar_path?: string | null
          active_color?: string
          updated_at?: string
        }
        Relationships: []
      }
      card_links: {
        Row: {
          id: string
          from_card_id: string | null
          from_todo_block_id: string | null
          from_side: CardLinkSide
          to_card_id: string | null
          to_todo_block_id: string | null
          to_side: CardLinkSide
          board_scope: BoardScope
          project_id: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          from_card_id?: string | null
          from_todo_block_id?: string | null
          from_side: CardLinkSide
          to_card_id?: string | null
          to_todo_block_id?: string | null
          to_side: CardLinkSide
          board_scope?: BoardScope
          project_id?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          from_card_id?: string | null
          from_todo_block_id?: string | null
          from_side?: CardLinkSide
          to_card_id?: string | null
          to_todo_block_id?: string | null
          to_side?: CardLinkSide
          board_scope?: BoardScope
          project_id?: string | null
          created_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      todo_blocks: {
        Row: {
          id: string
          title: string
          deadline_at: string | null
          board_scope: BoardScope
          project_id: string | null
          x: number
          y: number
          w: number
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          deadline_at?: string | null
          board_scope?: BoardScope
          project_id?: string | null
          x?: number
          y?: number
          w?: number
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          title?: string
          deadline_at?: string | null
          board_scope?: BoardScope
          project_id?: string | null
          x?: number
          y?: number
          w?: number
          created_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      todo_items: {
        Row: {
          id: string
          block_id: string
          title: string
          description: string | null
          is_done: boolean
          is_active: boolean
          active_by: string | null
          completed_at: string | null
          completed_by: string | null
          sort_order: number
          image_path: string | null
          image_width: number | null
          image_height: number | null
          image_size: number | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          block_id: string
          title: string
          description?: string | null
          is_done?: boolean
          is_active?: boolean
          active_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          sort_order?: number
          image_path?: string | null
          image_width?: number | null
          image_height?: number | null
          image_size?: number | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          block_id?: string
          title?: string
          description?: string | null
          is_done?: boolean
          is_active?: boolean
          active_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          sort_order?: number
          image_path?: string | null
          image_width?: number | null
          image_height?: number | null
          image_size?: number | null
          created_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      todo_image_cleanup_queue: {
        Row: {
          image_path: string
          requested_by: string
          created_at: string
        }
        Insert: {
          image_path: string
          requested_by: string
          created_at?: string
        }
        Update: {
          image_path?: string
          requested_by?: string
          created_at?: string
        }
        Relationships: []
      }
      board_texts: {
        Row: {
          id: string
          content: string
          board_scope: BoardScope
          project_id: string | null
          x: number
          y: number
          w: number
          font_size: number
          font_family: 'display' | 'mono' | 'serif' | 'system'
          color: string
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          content?: string
          board_scope?: BoardScope
          project_id?: string | null
          x?: number
          y?: number
          w?: number
          font_size?: number
          font_family?: 'display' | 'mono' | 'serif' | 'system'
          color?: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          content?: string
          board_scope?: BoardScope
          project_id?: string | null
          x?: number
          y?: number
          w?: number
          font_size?: number
          font_family?: 'display' | 'mono' | 'serif' | 'system'
          color?: string
          created_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      card_image_cleanup_queue: {
        Row: {
          image_path: string
          requested_by: string
          created_at: string
        }
        Insert: {
          image_path: string
          requested_by: string
          created_at?: string
        }
        Update: {
          image_path?: string
          requested_by?: string
          created_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          id: string
          name: string
          color: string
          sort_order: number
          team_id: string
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          color?: string
          sort_order?: number
          team_id: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          color?: string
          sort_order?: number
          team_id?: string
          created_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      teams: {
        Row: {
          id: string
          name: string
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          created_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          team_id: string
          user_id: string
          role: 'owner' | 'admin' | 'editor' | 'member' | 'viewer'
          joined_at: string
          updated_at: string
        }
        Insert: {
          team_id: string
          user_id: string
          role?: 'owner' | 'admin' | 'editor' | 'member' | 'viewer'
          joined_at?: string
          updated_at?: string
        }
        Update: {
          role?: 'owner' | 'admin' | 'editor' | 'member' | 'viewer'
          updated_at?: string
        }
        Relationships: []
      }
      project_members: {
        Row: {
          project_id: string
          user_id: string
          access_level: 'viewer' | 'contributor' | 'editor'
          granted_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          project_id: string
          user_id: string
          access_level?: 'viewer' | 'contributor' | 'editor'
          granted_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          access_level?: 'viewer' | 'contributor' | 'editor'
          granted_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      team_invites: {
        Row: {
          id: string
          team_id: string
          invitee_email: string
          role: 'admin' | 'editor' | 'member' | 'viewer'
          token_hash: string
          expires_at: string
          accepted_at: string | null
          accepted_by: string | null
          revoked_at: string | null
          created_by: string | null
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      team_invite_projects: {
        Row: {
          invite_id: string
          project_id: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      begin_arcade_run: {
        Args: { target_team_id: string; game_mode: 'snake' | 'shooter' }
        Returns: string
      }
      submit_arcade_score: {
        Args: { target_team_id: string; game_mode: 'snake' | 'shooter'; run_token: string; final_score: number; duration_ms: number }
        Returns: number
      }
      get_arcade_leaderboard: {
        Args: { target_team_id: string; game_mode: 'snake' | 'shooter' }
        Returns: { user_id: string; nickname: string; avatar_path: string | null; active_color: string; score: number; achieved_at: string; rank: number }[]
      }
      reorder_projects: {
        Args: { payload: Json }
        Returns: Database['public']['Tables']['projects']['Row'][]
      }
      update_card_geometries: {
        Args: { payload: Json }
        Returns: Database['public']['Tables']['cards']['Row'][]
      }
      update_card_positions: {
        Args: { payload: Json }
        Returns: Database['public']['Tables']['cards']['Row'][]
      }
      update_todo_block_geometries: {
        Args: { payload: Json }
        Returns: Database['public']['Tables']['todo_blocks']['Row'][]
      }
      update_todo_block_positions: {
        Args: { payload: Json }
        Returns: Database['public']['Tables']['todo_blocks']['Row'][]
      }
      reorder_todo_items: {
        Args: { target_block_id: string; payload: Json }
        Returns: Database['public']['Tables']['todo_items']['Row'][]
      }
      create_team_invite: {
        Args: {
          target_team_id: string
          target_email: string
          target_role: 'admin' | 'editor' | 'member' | 'viewer'
          selected_project_ids?: string[]
        }
        Returns: { invite_id: string; invite_token: string; expires_at: string }[]
      }
      create_team_project: {
        Args: { target_team_id: string; project_name: string; project_color: string }
        Returns: Database['public']['Tables']['projects']['Row']
      }
      accept_team_invite: {
        Args: { raw_token: string }
        Returns: { team_id: string; member_role: 'admin' | 'editor' | 'member' | 'viewer' }[]
      }
      update_team_member_access: {
        Args: {
          target_team_id: string
          target_user_id: string
          target_role: 'admin' | 'editor' | 'member' | 'viewer'
          selected_project_ids?: string[]
        }
        Returns: undefined
      }
      remove_team_member: {
        Args: { target_team_id: string; target_user_id: string }
        Returns: undefined
      }
      revoke_team_invite: {
        Args: { target_invite_id: string }
        Returns: undefined
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export const supabase = env.isSupabaseConfigured
  ? createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
      realtime: {
        params: {
          eventsPerSecond: 8,
        },
      },
    })
  : null

export function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase не настроен. Добавь VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY.')
  }

  return supabase
}
