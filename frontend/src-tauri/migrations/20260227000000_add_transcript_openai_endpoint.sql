-- Migration: add endpoint storage for OpenAI-compatible transcription provider
ALTER TABLE transcript_settings ADD COLUMN openaiEndpoint TEXT;
