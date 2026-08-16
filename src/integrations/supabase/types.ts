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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      conversation_participants: {
        Row: {
          conversation_id: string
          joined_at: string
          last_read_at: string
          role: Database["public"]["Enums"]["conversation_role"]
          workspace_user_id: string
        }
        Insert: {
          conversation_id: string
          joined_at?: string
          last_read_at?: string
          role?: Database["public"]["Enums"]["conversation_role"]
          workspace_user_id: string
        }
        Update: {
          conversation_id?: string
          joined_at?: string
          last_read_at?: string
          role?: Database["public"]["Enums"]["conversation_role"]
          workspace_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_workspace_user_id_fkey"
            columns: ["workspace_user_id"]
            isOneToOne: false
            referencedRelation: "workspace_users"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_topic_evidences: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          message_id: string
          similarity: number
          topic_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          message_id: string
          similarity: number
          topic_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          message_id?: string
          similarity?: number
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_topic_evidences_message_conv_fkey"
            columns: ["message_id", "conversation_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id", "conversation_id"]
          },
          {
            foreignKeyName: "conversation_topic_evidences_topic_conv_fkey"
            columns: ["topic_id", "conversation_id"]
            isOneToOne: false
            referencedRelation: "conversation_topics"
            referencedColumns: ["id", "conversation_id"]
          },
        ]
      }
      conversation_topic_jobs: {
        Row: {
          attempt_count: number
          completed_at: string | null
          conversation_id: string
          created_at: string
          id: string
          last_error: string | null
          message_id: string
          next_retry_at: string | null
          processing_started_at: string | null
          status: Database["public"]["Enums"]["cti_job_status"]
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          completed_at?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          last_error?: string | null
          message_id: string
          next_retry_at?: string | null
          processing_started_at?: string | null
          status?: Database["public"]["Enums"]["cti_job_status"]
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          completed_at?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          last_error?: string | null
          message_id?: string
          next_retry_at?: string | null
          processing_started_at?: string | null
          status?: Database["public"]["Enums"]["cti_job_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_topic_jobs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_topic_jobs_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_topics: {
        Row: {
          conversation_id: string
          created_at: string
          description: string | null
          embedding: string | null
          evidence_count: number
          first_seen_at: string
          historical_weight: number
          id: string
          is_candidate: boolean
          last_seen_at: string
          name: string | null
          updated_at: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          description?: string | null
          embedding?: string | null
          evidence_count?: number
          first_seen_at?: string
          historical_weight?: number
          id?: string
          is_candidate?: boolean
          last_seen_at?: string
          name?: string | null
          updated_at?: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          description?: string | null
          embedding?: string | null
          evidence_count?: number
          first_seen_at?: string
          historical_weight?: number
          id?: string
          is_candidate?: boolean
          last_seen_at?: string
          name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_topics_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by_workspace_user_id: string | null
          current_topic_id: string | null
          id: string
          image_url: string | null
          last_modified_at: string
          title: string | null
          type: Database["public"]["Enums"]["conversation_type"]
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by_workspace_user_id?: string | null
          current_topic_id?: string | null
          id?: string
          image_url?: string | null
          last_modified_at?: string
          title?: string | null
          type?: Database["public"]["Enums"]["conversation_type"]
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by_workspace_user_id?: string | null
          current_topic_id?: string | null
          id?: string
          image_url?: string | null
          last_modified_at?: string
          title?: string | null
          type?: Database["public"]["Enums"]["conversation_type"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_workspace_user_id_fkey"
            columns: ["created_by_workspace_user_id"]
            isOneToOne: false
            referencedRelation: "workspace_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_current_topic_conv_fkey"
            columns: ["current_topic_id", "id"]
            isOneToOne: false
            referencedRelation: "conversation_topics"
            referencedColumns: ["id", "conversation_id"]
          },
          {
            foreignKeyName: "conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      entities: {
        Row: {
          created_at: string
          created_by_workspace_user_id: string | null
          embedding: string | null
          entity_type_id: string
          id: string
          last_modified_at: string
          metadata: Json
          source_id: string
          title: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by_workspace_user_id?: string | null
          embedding?: string | null
          entity_type_id: string
          id?: string
          last_modified_at?: string
          metadata?: Json
          source_id: string
          title?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by_workspace_user_id?: string | null
          embedding?: string | null
          entity_type_id?: string
          id?: string
          last_modified_at?: string
          metadata?: Json
          source_id?: string
          title?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entities_created_by_workspace_user_id_fkey"
            columns: ["created_by_workspace_user_id"]
            isOneToOne: false
            referencedRelation: "workspace_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entities_entity_type_id_fkey"
            columns: ["entity_type_id"]
            isOneToOne: false
            referencedRelation: "entity_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entities_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_annotations: {
        Row: {
          annotation_type: Database["public"]["Enums"]["annotation_type"]
          confidence: number
          created_at: string
          created_by_workspace_user_id: string | null
          end_offset: number | null
          id: string
          last_modified_at: string
          metadata: Json
          raw_text: string
          source_entity_id: string
          start_offset: number | null
          target_entity_id: string | null
          workspace_id: string
        }
        Insert: {
          annotation_type: Database["public"]["Enums"]["annotation_type"]
          confidence?: number
          created_at?: string
          created_by_workspace_user_id?: string | null
          end_offset?: number | null
          id?: string
          last_modified_at?: string
          metadata?: Json
          raw_text: string
          source_entity_id: string
          start_offset?: number | null
          target_entity_id?: string | null
          workspace_id: string
        }
        Update: {
          annotation_type?: Database["public"]["Enums"]["annotation_type"]
          confidence?: number
          created_at?: string
          created_by_workspace_user_id?: string | null
          end_offset?: number | null
          id?: string
          last_modified_at?: string
          metadata?: Json
          raw_text?: string
          source_entity_id?: string
          start_offset?: number | null
          target_entity_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_annotations_created_by_workspace_user_id_fkey"
            columns: ["created_by_workspace_user_id"]
            isOneToOne: false
            referencedRelation: "workspace_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_annotations_source_entity_id_fkey"
            columns: ["source_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_annotations_target_entity_id_fkey"
            columns: ["target_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_annotations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_relations: {
        Row: {
          created_at: string
          created_by_workspace_user_id: string | null
          id: string
          last_modified_at: string
          metadata: Json
          relation_type: Database["public"]["Enums"]["relation_type"]
          source_entity_id: string
          target_entity_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by_workspace_user_id?: string | null
          id?: string
          last_modified_at?: string
          metadata?: Json
          relation_type: Database["public"]["Enums"]["relation_type"]
          source_entity_id: string
          target_entity_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by_workspace_user_id?: string | null
          id?: string
          last_modified_at?: string
          metadata?: Json
          relation_type?: Database["public"]["Enums"]["relation_type"]
          source_entity_id?: string
          target_entity_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_relations_created_by_workspace_user_id_fkey"
            columns: ["created_by_workspace_user_id"]
            isOneToOne: false
            referencedRelation: "workspace_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_relations_source_entity_id_fkey"
            columns: ["source_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_relations_target_entity_id_fkey"
            columns: ["target_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_relations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_types: {
        Row: {
          display_name: string
          id: string
          key: string
        }
        Insert: {
          display_name: string
          id?: string
          key: string
        }
        Update: {
          display_name?: string
          id?: string
          key?: string
        }
        Relationships: []
      }
      message_embeddings: {
        Row: {
          created_at: string
          dimensions: number
          embedding_vector: string
          id: string
          is_active: boolean
          message_semantics_id: string
          model: string
        }
        Insert: {
          created_at?: string
          dimensions: number
          embedding_vector: string
          id?: string
          is_active?: boolean
          message_semantics_id: string
          model: string
        }
        Update: {
          created_at?: string
          dimensions?: number
          embedding_vector?: string
          id?: string
          is_active?: boolean
          message_semantics_id?: string
          model?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_embeddings_message_semantics_id_fkey"
            columns: ["message_semantics_id"]
            isOneToOne: false
            referencedRelation: "message_semantics"
            referencedColumns: ["id"]
          },
        ]
      }
      message_semantics: {
        Row: {
          checksum: string
          created_at: string
          embedding_status: Database["public"]["Enums"]["embedding_status"]
          id: string
          language: string
          last_error: string | null
          last_processed_at: string | null
          message_id: string
          next_retry_at: string | null
          normalized_text: string
          processable: boolean
          quality_score: number
          retry_count: number
          updated_at: string
        }
        Insert: {
          checksum: string
          created_at?: string
          embedding_status?: Database["public"]["Enums"]["embedding_status"]
          id?: string
          language?: string
          last_error?: string | null
          last_processed_at?: string | null
          message_id: string
          next_retry_at?: string | null
          normalized_text: string
          processable?: boolean
          quality_score?: number
          retry_count?: number
          updated_at?: string
        }
        Update: {
          checksum?: string
          created_at?: string
          embedding_status?: Database["public"]["Enums"]["embedding_status"]
          id?: string
          language?: string
          last_error?: string | null
          last_processed_at?: string | null
          message_id?: string
          next_retry_at?: string | null
          normalized_text?: string
          processable?: boolean
          quality_score?: number
          retry_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_semantics_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          author_workspace_user_id: string | null
          conversation_id: string
          created_at: string
          entity_id: string | null
          id: string
          last_modified_at: string
          raw_text: string
          workspace_id: string
        }
        Insert: {
          author_workspace_user_id?: string | null
          conversation_id: string
          created_at?: string
          entity_id?: string | null
          id?: string
          last_modified_at?: string
          raw_text?: string
          workspace_id: string
        }
        Update: {
          author_workspace_user_id?: string | null
          conversation_id?: string
          created_at?: string
          entity_id?: string | null
          id?: string
          last_modified_at?: string
          raw_text?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_author_workspace_user_id_fkey"
            columns: ["author_workspace_user_id"]
            isOneToOne: false
            referencedRelation: "workspace_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      page_collaborators: {
        Row: {
          first_edited_at: string
          last_edited_at: string
          page_id: string
          workspace_user_id: string
        }
        Insert: {
          first_edited_at?: string
          last_edited_at?: string
          page_id: string
          workspace_user_id: string
        }
        Update: {
          first_edited_at?: string
          last_edited_at?: string
          page_id?: string
          workspace_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_collaborators_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_collaborators_workspace_user_id_fkey"
            columns: ["workspace_user_id"]
            isOneToOne: false
            referencedRelation: "workspace_users"
            referencedColumns: ["id"]
          },
        ]
      }
      pages: {
        Row: {
          content: Json
          conversation_id: string | null
          created_at: string
          created_by_workspace_user_id: string | null
          entity_id: string | null
          id: string
          last_modified_at: string
          origin_source_id: string | null
          origin_type: Database["public"]["Enums"]["page_origin"]
          owner_workspace_user_id: string | null
          page_type: Database["public"]["Enums"]["page_type"]
          parent_page_id: string | null
          plain_text: string | null
          title: string
          visibility: Database["public"]["Enums"]["page_visibility"]
          workspace_id: string
        }
        Insert: {
          content?: Json
          conversation_id?: string | null
          created_at?: string
          created_by_workspace_user_id?: string | null
          entity_id?: string | null
          id?: string
          last_modified_at?: string
          origin_source_id?: string | null
          origin_type?: Database["public"]["Enums"]["page_origin"]
          owner_workspace_user_id?: string | null
          page_type?: Database["public"]["Enums"]["page_type"]
          parent_page_id?: string | null
          plain_text?: string | null
          title?: string
          visibility?: Database["public"]["Enums"]["page_visibility"]
          workspace_id: string
        }
        Update: {
          content?: Json
          conversation_id?: string | null
          created_at?: string
          created_by_workspace_user_id?: string | null
          entity_id?: string | null
          id?: string
          last_modified_at?: string
          origin_source_id?: string | null
          origin_type?: Database["public"]["Enums"]["page_origin"]
          owner_workspace_user_id?: string | null
          page_type?: Database["public"]["Enums"]["page_type"]
          parent_page_id?: string | null
          plain_text?: string | null
          title?: string
          visibility?: Database["public"]["Enums"]["page_visibility"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pages_created_by_workspace_user_id_fkey"
            columns: ["created_by_workspace_user_id"]
            isOneToOne: false
            referencedRelation: "workspace_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pages_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pages_owner_workspace_user_id_fkey"
            columns: ["owner_workspace_user_id"]
            isOneToOne: false
            referencedRelation: "workspace_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pages_parent_page_id_fkey"
            columns: ["parent_page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pinned_assets: {
        Row: {
          asset_id: string
          asset_type: Database["public"]["Enums"]["pinned_asset_type"]
          created_at: string
          id: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          asset_id: string
          asset_type: Database["public"]["Enums"]["pinned_asset_type"]
          created_at?: string
          id?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          asset_id?: string
          asset_type?: Database["public"]["Enums"]["pinned_asset_type"]
          created_at?: string
          id?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pinned_assets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          description: string | null
          id: string
          key: Database["public"]["Enums"]["workspace_role"]
          permissions: Json
        }
        Insert: {
          description?: string | null
          id?: string
          key: Database["public"]["Enums"]["workspace_role"]
          permissions?: Json
        }
        Update: {
          description?: string | null
          id?: string
          key?: Database["public"]["Enums"]["workspace_role"]
          permissions?: Json
        }
        Relationships: []
      }
      workspace_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by_workspace_user_id: string | null
          last_modified_at: string
          role_id: string
          token: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by_workspace_user_id?: string | null
          last_modified_at?: string
          role_id: string
          token: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by_workspace_user_id?: string | null
          last_modified_at?: string
          role_id?: string
          token?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invites_invited_by_workspace_user_id_fkey"
            columns: ["invited_by_workspace_user_id"]
            isOneToOne: false
            referencedRelation: "workspace_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invites_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "user_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invites_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_plan_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          new_plan: Database["public"]["Enums"]["plan_tier"]
          previous_plan: Database["public"]["Enums"]["plan_tier"] | null
          reason: string | null
          workspace_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_plan: Database["public"]["Enums"]["plan_tier"]
          previous_plan?: Database["public"]["Enums"]["plan_tier"] | null
          reason?: string | null
          workspace_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_plan?: Database["public"]["Enums"]["plan_tier"]
          previous_plan?: Database["public"]["Enums"]["plan_tier"] | null
          reason?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_plan_history_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_users: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          last_modified_at: string
          role_id: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          last_modified_at?: string
          role_id: string
          user_id: string
          workspace_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          last_modified_at?: string
          role_id?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_users_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "user_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_users_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          last_modified_at: string
          name: string
          plan: Database["public"]["Enums"]["plan_tier"]
          plan_updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_modified_at?: string
          name: string
          plan?: Database["public"]["Enums"]["plan_tier"]
          plan_updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_modified_at?: string
          name?: string
          plan?: Database["public"]["Enums"]["plan_tier"]
          plan_updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_cti_plan_and_commit: {
        Args: { p_job_id: string; p_plan?: Json }
        Returns: string
      }
      claim_conversation_topic_job: {
        Args: { p_stale_after?: string }
        Returns: {
          attempt_count: number
          completed_at: string | null
          conversation_id: string
          created_at: string
          id: string
          last_error: string | null
          message_id: string
          next_retry_at: string | null
          processing_started_at: string | null
          status: Database["public"]["Enums"]["cti_job_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "conversation_topic_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_embedding_batch: {
        Args: { p_batch_size?: number; p_stale_after?: string }
        Returns: {
          checksum: string
          created_at: string
          embedding_status: Database["public"]["Enums"]["embedding_status"]
          id: string
          language: string
          last_error: string | null
          last_processed_at: string | null
          message_id: string
          next_retry_at: string | null
          normalized_text: string
          processable: boolean
          quality_score: number
          retry_count: number
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "message_semantics"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      commit_cti_job: { Args: { p_job_id: string }; Returns: string }
      cti_is_next_processable: {
        Args: { _conversation_id: string; _message_id: string }
        Returns: boolean
      }
      cti_lock_conversation: {
        Args: { _conversation_id: string }
        Returns: undefined
      }
      cti_try_lock_conversation: {
        Args: { _conversation_id: string }
        Returns: boolean
      }
      current_workspace_user_id: {
        Args: { _workspace_id: string }
        Returns: string
      }
      escape_ilike_pattern: { Args: { p: string }; Returns: string }
      finalize_embedded_message: {
        Args: { p_message_semantics_id: string }
        Returns: undefined
      }
      has_workspace_role: {
        Args: {
          _role: Database["public"]["Enums"]["workspace_role"]
          _workspace_id: string
        }
        Returns: boolean
      }
      is_conversation_participant: {
        Args: { _conversation_id: string }
        Returns: boolean
      }
      is_page_collaborator: { Args: { _page_id: string }; Returns: boolean }
      is_workspace_member: { Args: { _workspace_id: string }; Returns: boolean }
      match_conversation_topics: {
        Args: { p_conversation_id: string; p_message_id: string }
        Returns: {
          conversation_id: string
          created_at: string
          description: string
          embedding: string
          evidence_count: number
          first_seen_at: string
          historical_weight: number
          id: string
          is_candidate: boolean
          last_seen_at: string
          name: string
          similarity: number
          updated_at: string
        }[]
      }
      release_conversation_topic_job: {
        Args: { p_job_id: string }
        Returns: undefined
      }
      search_conversations_keyword: {
        Args: { p_limit: number; p_query: string; p_workspace_id: string }
        Returns: {
          asset_id: string
          match_text: string
          matched_field: Database["public"]["Enums"]["search_matched_field"]
          score: number
          title: string
        }[]
      }
      search_messages_keyword: {
        Args: { p_limit: number; p_query: string; p_workspace_id: string }
        Returns: {
          asset_id: string
          conversation_id: string
          match_text: string
          matched_field: Database["public"]["Enums"]["search_matched_field"]
          score: number
          title: string
        }[]
      }
      search_messages_semantic: {
        Args: {
          p_embedding: string
          p_limit: number
          p_recency_half_life_days?: number
          p_similarity_threshold?: number
          p_weight_quality?: number
          p_weight_recency?: number
          p_weight_similarity?: number
          p_workspace_id: string
        }
        Returns: {
          asset_id: string
          conversation_id: string
          match_text: string
          matched_field: Database["public"]["Enums"]["search_matched_field"]
          score: number
          title: string
        }[]
      }
      search_pages_keyword: {
        Args: { p_limit: number; p_query: string; p_workspace_id: string }
        Returns: {
          asset_id: string
          match_text: string
          matched_field: Database["public"]["Enums"]["search_matched_field"]
          score: number
          title: string
        }[]
      }
      search_people_keyword: {
        Args: { p_limit: number; p_query: string; p_workspace_id: string }
        Returns: {
          asset_id: string
          match_text: string
          matched_field: Database["public"]["Enums"]["search_matched_field"]
          score: number
          title: string
        }[]
      }
      tiptap_to_plaintext: { Args: { doc: Json }; Returns: string }
    }
    Enums: {
      annotation_type:
        | "mention_user"
        | "mention_entity"
        | "ticket_ref"
        | "inline_page_match"
        | "semantic_hint"
      conversation_role: "admin" | "member" | "viewer"
      conversation_type: "direct" | "group" | "channel"
      cti_job_status:
        | "QUEUED"
        | "PROCESSING"
        | "COMPLETED"
        | "RETRY_WAIT"
        | "QUARANTINED"
      embedding_status:
        | "NEW"
        | "QUEUED"
        | "PROCESSING"
        | "EMBEDDED"
        | "FAILED"
        | "SKIPPED"
      page_origin: "user" | "conversation" | "import" | "ai"
      page_type: "standard" | "template" | "generated" | "imported"
      page_visibility: "private" | "conversation" | "workspace" | "external"
      pinned_asset_type: "conversation" | "page"
      plan_tier: "free" | "pro" | "enterprise"
      relation_type:
        | "quoted_from"
        | "derived_from_message"
        | "cited_in"
        | "child_of"
        | "attached_to"
        | "linked_by_user"
      search_matched_field: "title" | "content" | "name"
      workspace_role: "admin" | "member" | "viewer"
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
      annotation_type: [
        "mention_user",
        "mention_entity",
        "ticket_ref",
        "inline_page_match",
        "semantic_hint",
      ],
      conversation_role: ["admin", "member", "viewer"],
      conversation_type: ["direct", "group", "channel"],
      cti_job_status: [
        "QUEUED",
        "PROCESSING",
        "COMPLETED",
        "RETRY_WAIT",
        "QUARANTINED",
      ],
      embedding_status: [
        "NEW",
        "QUEUED",
        "PROCESSING",
        "EMBEDDED",
        "FAILED",
        "SKIPPED",
      ],
      page_origin: ["user", "conversation", "import", "ai"],
      page_type: ["standard", "template", "generated", "imported"],
      page_visibility: ["private", "conversation", "workspace", "external"],
      pinned_asset_type: ["conversation", "page"],
      plan_tier: ["free", "pro", "enterprise"],
      relation_type: [
        "quoted_from",
        "derived_from_message",
        "cited_in",
        "child_of",
        "attached_to",
        "linked_by_user",
      ],
      search_matched_field: ["title", "content", "name"],
      workspace_role: ["admin", "member", "viewer"],
    },
  },
} as const
