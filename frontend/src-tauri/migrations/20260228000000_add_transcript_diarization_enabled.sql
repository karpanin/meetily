-- Add diarization toggle for transcription settings
ALTER TABLE transcript_settings ADD COLUMN diarizationEnabled INTEGER DEFAULT 0;
