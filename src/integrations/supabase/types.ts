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
      conversation_suggestion_jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          conversation_id: string
          created_at: string
          id: string
          last_error: string | null
          last_modified_at: string
          next_retry_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["conversation_suggestion_job_status"]
          workspace_id: string
          workspace_user_id: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          last_error?: string | null
          last_modified_at?: string
          next_retry_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["conversation_suggestion_job_status"]
          workspace_id: string
          workspace_user_id: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          last_error?: string | null
          last_modified_at?: string
          next_retry_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["conversation_suggestion_job_status"]
          workspace_id?: string
          workspace_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_suggestion_jobs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_suggestion_jobs_participant_fkey"
            columns: ["conversation_id", "workspace_user_id"]
            isOneToOne: true
            referencedRelation: "conversation_participants"
            referencedColumns: ["conversation_id", "workspace_user_id"]
          },
          {
            foreignKeyName: "conversation_suggestion_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_suggestion_jobs_workspace_user_id_fkey"
            columns: ["workspace_user_id"]
            isOneToOne: false
            referencedRelation: "workspace_users"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_suggestions: {
        Row: {
          clicked_at: string | null
          conversation_id: string
          conversation_topic_id: string
          created_at: string
          dismissed_at: string | null
          entity_id: string
          entity_similarity_score: number
          expires_at: string
          feedback_at: string | null
          feedback_type:
            | Database["public"]["Enums"]["conversation_suggestion_feedback"]
            | null
          id: string
          last_modified_at: string
          llm_confidence: number
          notification_text: string
          reason: string
          shown_at: string | null
          status: Database["public"]["Enums"]["conversation_suggestion_status"]
          workspace_id: string
          workspace_user_id: string
        }
        Insert: {
          clicked_at?: string | null
          conversation_id: string
          conversation_topic_id: string
          created_at?: string
          dismissed_at?: string | null
          entity_id: string
          entity_similarity_score: number
          expires_at?: string
          feedback_at?: string | null
          feedback_type?:
            | Database["public"]["Enums"]["conversation_suggestion_feedback"]
            | null
          id?: string
          last_modified_at?: string
          llm_confidence: number
          notification_text: string
          reason: string
          shown_at?: string | null
          status?: Database["public"]["Enums"]["conversation_suggestion_status"]
          workspace_id: string
          workspace_user_id: string
        }
        Update: {
          clicked_at?: string | null
          conversation_id?: string
          conversation_topic_id?: string
          created_at?: string
          dismissed_at?: string | null
          entity_id?: string
          entity_similarity_score?: number
          expires_at?: string
          feedback_at?: string | null
          feedback_type?:
            | Database["public"]["Enums"]["conversation_suggestion_feedback"]
            | null
          id?: string
          last_modified_at?: string
          llm_confidence?: number
          notification_text?: string
          reason?: string
          shown_at?: string | null
          status?: Database["public"]["Enums"]["conversation_suggestion_status"]
          workspace_id?: string
          workspace_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_suggestions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_suggestions_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_suggestions_participant_fkey"
            columns: ["conversation_id", "workspace_user_id"]
            isOneToOne: false
            referencedRelation: "conversation_participants"
            referencedColumns: ["conversation_id", "workspace_user_id"]
          },
          {
            foreignKeyName: "conversation_suggestions_topic_fkey"
            columns: ["conversation_topic_id", "conversation_id"]
            isOneToOne: false
            referencedRelation: "conversation_topics"
            referencedColumns: ["id", "conversation_id"]
          },
          {
            foreignKeyName: "conversation_suggestions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_suggestions_workspace_user_id_fkey"
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
          entity_type_id: string
          id: string
          last_modified_at: string
          metadata: Json
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by_workspace_user_id?: string | null
          entity_type_id: string
          id: string
          last_modified_at?: string
          metadata?: Json
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by_workspace_user_id?: string | null
          entity_type_id?: string
          id?: string
          last_modified_at?: string
          metadata?: Json
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
          purged_at: string | null
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
          purged_at?: string | null
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
          purged_at?: string | null
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
      page_chunk_embeddings: {
        Row: {
          attempts: number
          checksum: string
          chunk_id: string
          created_at: string
          embedded_at: string | null
          embedding: string | null
          embedding_model: string
          embedding_status: Database["public"]["Enums"]["page_embedding_status"]
          id: string
          last_error: string | null
          next_retry_at: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          checksum: string
          chunk_id: string
          created_at?: string
          embedded_at?: string | null
          embedding?: string | null
          embedding_model: string
          embedding_status?: Database["public"]["Enums"]["page_embedding_status"]
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          checksum?: string
          chunk_id?: string
          created_at?: string
          embedded_at?: string | null
          embedding?: string | null
          embedding_model?: string
          embedding_status?: Database["public"]["Enums"]["page_embedding_status"]
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_chunk_embeddings_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "page_chunks"
            referencedColumns: ["id"]
          },
        ]
      }
      page_chunks: {
        Row: {
          checksum: string
          content: string
          created_at: string
          id: string
          page_id: string
          position: number
          token_count: number
          updated_at: string
        }
        Insert: {
          checksum: string
          content: string
          created_at?: string
          id?: string
          page_id: string
          position: number
          token_count: number
          updated_at?: string
        }
        Update: {
          checksum?: string
          content?: string
          created_at?: string
          id?: string
          page_id?: string
          position?: number
          token_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_chunks_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
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
      page_topic_embeddings: {
        Row: {
          attempts: number
          checksum: string
          created_at: string
          embedded_at: string | null
          embedding: string | null
          embedding_model: string
          embedding_status: Database["public"]["Enums"]["page_embedding_status"]
          id: string
          last_error: string | null
          next_retry_at: string | null
          page_id: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          checksum: string
          created_at?: string
          embedded_at?: string | null
          embedding?: string | null
          embedding_model?: string
          embedding_status?: Database["public"]["Enums"]["page_embedding_status"]
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          page_id: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          checksum?: string
          created_at?: string
          embedded_at?: string | null
          embedding?: string | null
          embedding_model?: string
          embedding_status?: Database["public"]["Enums"]["page_embedding_status"]
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          page_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_topic_embeddings_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: true
            referencedRelation: "page_topics"
            referencedColumns: ["page_id"]
          },
        ]
      }
      page_topic_jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          id: string
          last_error: string | null
          next_retry_at: string | null
          page_id: string
          page_snapshot_hash: string
          started_at: string | null
          status: Database["public"]["Enums"]["page_semantic_job_status"]
          updated_at: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          page_id: string
          page_snapshot_hash: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["page_semantic_job_status"]
          updated_at?: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          page_id?: string
          page_snapshot_hash?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["page_semantic_job_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_topic_jobs_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      page_topics: {
        Row: {
          created_at: string
          llm_model: string
          page_id: string
          page_snapshot: string
          page_snapshot_hash: string
          topic_description: string
          topic_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          llm_model: string
          page_id: string
          page_snapshot: string
          page_snapshot_hash: string
          topic_description: string
          topic_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          llm_model?: string
          page_id?: string
          page_snapshot?: string
          page_snapshot_hash?: string
          topic_description?: string
          topic_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_topics_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: true
            referencedRelation: "pages"
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
          purged_at: string | null
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
          purged_at?: string | null
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
          purged_at?: string | null
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
      pinned_entities: {
        Row: {
          created_at: string
          entity_id: string
          id: string
          workspace_id: string
          workspace_user_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          id?: string
          workspace_id: string
          workspace_user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          id?: string
          workspace_id?: string
          workspace_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pinned_entities_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pinned_entities_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pinned_entities_workspace_user_id_fkey"
            columns: ["workspace_user_id"]
            isOneToOne: false
            referencedRelation: "workspace_users"
            referencedColumns: ["id"]
          },
        ]
      }
      purgeable_entity_types: {
        Row: {
          entity_type_key: string
          purge_order: number
          table_name: string
        }
        Insert: {
          entity_type_key: string
          purge_order?: number
          table_name: string
        }
        Update: {
          entity_type_key?: string
          purge_order?: number
          table_name?: string
        }
        Relationships: []
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
      apply_conversation_suggestion_result: {
        Args: {
          p_conversation_topic_id?: string
          p_entity_id?: string
          p_entity_similarity_score?: number
          p_expires_at?: string
          p_job_id: string
          p_llm_confidence?: number
          p_notification_text?: string
          p_reason?: string
        }
        Returns: string
      }
      apply_cti_plan_and_commit: {
        Args: { p_job_id: string; p_plan?: Json }
        Returns: string
      }
      apply_page_topic_result: {
        Args: {
          p_job_id: string
          p_llm_model: string
          p_page_snapshot: string
          p_page_snapshot_hash: string
          p_topic_description: string
          p_topic_name: string
        }
        Returns: string
      }
      can_read_page: { Args: { _page_id: string }; Returns: boolean }
      can_read_page_as: {
        Args: { _page_id: string; _workspace_user_id: string }
        Returns: boolean
      }
      claim_conversation_suggestion_job: {
        Args: { p_stale_after: string }
        Returns: {
          attempts: number
          completed_at: string | null
          conversation_id: string
          created_at: string
          id: string
          last_error: string | null
          last_modified_at: string
          next_retry_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["conversation_suggestion_job_status"]
          workspace_id: string
          workspace_user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "conversation_suggestion_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
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
      claim_page_chunk_embedding_batch: {
        Args: { p_batch_size?: number; p_stale_after?: string }
        Returns: {
          attempts: number
          checksum: string
          chunk_id: string
          created_at: string
          embedded_at: string | null
          embedding: string | null
          embedding_model: string
          embedding_status: Database["public"]["Enums"]["page_embedding_status"]
          id: string
          last_error: string | null
          next_retry_at: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "page_chunk_embeddings"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_page_topic_embedding_batch: {
        Args: { p_batch_size?: number; p_stale_after?: string }
        Returns: {
          attempts: number
          checksum: string
          created_at: string
          embedded_at: string | null
          embedding: string | null
          embedding_model: string
          embedding_status: Database["public"]["Enums"]["page_embedding_status"]
          id: string
          last_error: string | null
          next_retry_at: string | null
          page_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "page_topic_embeddings"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_page_topic_job: {
        Args: { p_stale_after?: string }
        Returns: {
          attempts: number
          completed_at: string | null
          created_at: string
          id: string
          last_error: string | null
          next_retry_at: string | null
          page_id: string
          page_snapshot_hash: string
          started_at: string | null
          status: Database["public"]["Enums"]["page_semantic_job_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "page_topic_jobs"
          isOneToOne: true
          isSetofReturn: false
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
      enqueue_conversation_suggestion_job: {
        Args: { p_conversation_id: string; p_workspace_user_id: string }
        Returns: string
      }
      enqueue_page_topic_job: {
        Args: { p_hash: string; p_page_id: string }
        Returns: string
      }
      entity_type_id_for: { Args: { _key: string }; Returns: string }
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
      is_conversation_participant_as: {
        Args: { _conversation_id: string; _workspace_user_id: string }
        Returns: boolean
      }
      is_page_collaborator: { Args: { _page_id: string }; Returns: boolean }
      is_page_collaborator_as: {
        Args: { _page_id: string; _workspace_user_id: string }
        Returns: boolean
      }
      is_workspace_member: { Args: { _workspace_id: string }; Returns: boolean }
      is_workspace_member_as: {
        Args: { _workspace_id: string; _workspace_user_id: string }
        Returns: boolean
      }
      list_conversation_suggestion_jobs_due: {
        Args: { p_cooldown: string; p_idle: string; p_limit: number }
        Returns: {
          conversation_id: string
          workspace_id: string
          workspace_user_id: string
        }[]
      }
      list_pages_due_for_chunking: {
        Args: { p_idle?: string; p_limit?: number }
        Returns: {
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
          purged_at: string | null
          title: string
          visibility: Database["public"]["Enums"]["page_visibility"]
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "pages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_pages_due_for_topics: {
        Args: { p_idle?: string; p_limit?: number }
        Returns: {
          page_id: string
          page_snapshot: string
          page_snapshot_hash: string
          plain_text: string
          title: string
        }[]
      }
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
      purge_due_entities: {
        Args: { p_entity_ids?: string[] }
        Returns: {
          entity_type: string
          id: string
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
      search_messages_semantic_for_user: {
        Args: {
          p_embedding: string
          p_limit: number
          p_recency_half_life_days?: number
          p_similarity_threshold?: number
          p_weight_quality?: number
          p_weight_recency?: number
          p_weight_similarity?: number
          p_workspace_id: string
          p_workspace_user_id: string
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
      search_pages_semantic: {
        Args: {
          p_embedding: string
          p_embedding_model?: string
          p_limit: number
          p_recency_half_life_days?: number
          p_similarity_threshold?: number
          p_weight_recency?: number
          p_weight_similarity?: number
          p_workspace_id: string
        }
        Returns: {
          asset_id: string
          chunk_id: string
          match_text: string
          matched_field: Database["public"]["Enums"]["search_matched_field"]
          score: number
          title: string
        }[]
      }
      search_pages_semantic_for_user: {
        Args: {
          p_embedding: string
          p_embedding_model?: string
          p_limit: number
          p_recency_half_life_days?: number
          p_similarity_threshold?: number
          p_weight_recency?: number
          p_weight_similarity?: number
          p_workspace_id: string
          p_workspace_user_id: string
        }
        Returns: {
          asset_id: string
          chunk_id: string
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
      conversation_role: "admin" | "member" | "viewer"
      conversation_suggestion_feedback: "positive" | "negative"
      conversation_suggestion_job_status:
        | "QUEUED"
        | "PROCESSING"
        | "RETRY_WAIT"
        | "COMPLETED"
        | "FAILED"
      conversation_suggestion_status: "PENDING" | "SHOWN" | "EXPIRED"
      conversation_type: "direct" | "group" | "channel"
      cti_job_status:
        | "QUEUED"
        | "PROCESSING"
        | "COMPLETED"
        | "RETRY_WAIT"
        | "QUARANTINED"
      embedding_status:
        | "QUEUED"
        | "PROCESSING"
        | "EMBEDDED"
        | "FAILED"
        | "SKIPPED"
      page_embedding_status:
        | "QUEUED"
        | "PROCESSING"
        | "RETRY_WAIT"
        | "EMBEDDED"
        | "FAILED"
      page_origin: "user" | "conversation" | "import" | "ai"
      page_semantic_job_status:
        | "QUEUED"
        | "PROCESSING"
        | "RETRY_WAIT"
        | "COMPLETED"
        | "FAILED"
      page_type: "standard" | "template" | "generated" | "imported"
      page_visibility: "private" | "conversation" | "workspace" | "external"
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
      conversation_role: ["admin", "member", "viewer"],
      conversation_suggestion_feedback: ["positive", "negative"],
      conversation_suggestion_job_status: [
        "QUEUED",
        "PROCESSING",
        "RETRY_WAIT",
        "COMPLETED",
        "FAILED",
      ],
      conversation_suggestion_status: ["PENDING", "SHOWN", "EXPIRED"],
      conversation_type: ["direct", "group", "channel"],
      cti_job_status: [
        "QUEUED",
        "PROCESSING",
        "COMPLETED",
        "RETRY_WAIT",
        "QUARANTINED",
      ],
      embedding_status: [
        "QUEUED",
        "PROCESSING",
        "EMBEDDED",
        "FAILED",
        "SKIPPED",
      ],
      page_embedding_status: [
        "QUEUED",
        "PROCESSING",
        "RETRY_WAIT",
        "EMBEDDED",
        "FAILED",
      ],
      page_origin: ["user", "conversation", "import", "ai"],
      page_semantic_job_status: [
        "QUEUED",
        "PROCESSING",
        "RETRY_WAIT",
        "COMPLETED",
        "FAILED",
      ],
      page_type: ["standard", "template", "generated", "imported"],
      page_visibility: ["private", "conversation", "workspace", "external"],
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
