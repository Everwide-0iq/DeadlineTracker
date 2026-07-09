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
          deadline_at: string
          status: CardStatus
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
          deadline_at: string
          board_scope?: BoardScope
          project_id?: string | null
          status?: CardStatus
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
          deadline_at?: string
          board_scope?: BoardScope
          project_id?: string | null
          status?: CardStatus
          x?: number
          y?: number
          w?: number
          h?: number
          created_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      card_links: {
        Row: {
          id: string
          from_card_id: string
          from_side: CardLinkSide
          to_card_id: string
          to_side: CardLinkSide
          board_scope: BoardScope
          project_id: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          from_card_id: string
          from_side: CardLinkSide
          to_card_id: string
          to_side: CardLinkSide
          board_scope?: BoardScope
          project_id?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          from_card_id?: string
          from_side?: CardLinkSide
          to_card_id?: string
          to_side?: CardLinkSide
          board_scope?: BoardScope
          project_id?: string | null
          created_by?: string | null
          updated_at?: string
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
      projects: {
        Row: {
          id: string
          name: string
          color: string
          sort_order: number
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          color?: string
          sort_order?: number
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          color?: string
          sort_order?: number
          created_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
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
