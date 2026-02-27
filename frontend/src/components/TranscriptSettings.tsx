import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Eye, EyeOff, Lock, Unlock } from 'lucide-react';
import { toast } from 'sonner';

export interface TranscriptModelProps {
  provider: 'openaiCompatible';
  model: string;
  openaiEndpoint?: string | null;
  apiKey?: string | null;
}

export interface TranscriptSettingsProps {
  transcriptModelConfig: TranscriptModelProps;
  setTranscriptModelConfig: (config: TranscriptModelProps) => void;
  onModelSelect?: () => void;
}

export function TranscriptSettings({ transcriptModelConfig, setTranscriptModelConfig }: TranscriptSettingsProps) {
  const [apiKey, setApiKey] = useState<string | null>(transcriptModelConfig.apiKey || null);
  const [openaiEndpoint, setOpenaiEndpoint] = useState<string>(transcriptModelConfig.openaiEndpoint || '');
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [isApiKeyLocked, setIsApiKeyLocked] = useState<boolean>(true);
  const [isLockButtonVibrating, setIsLockButtonVibrating] = useState<boolean>(false);
  const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false);
  const [connectionTestMessage, setConnectionTestMessage] = useState<string>('');
  const [connectionTestOk, setConnectionTestOk] = useState<boolean | null>(null);

  useEffect(() => {
    setApiKey(transcriptModelConfig.apiKey || null);
    setOpenaiEndpoint(transcriptModelConfig.openaiEndpoint || '');
    setIsApiKeyLocked(!!(transcriptModelConfig.apiKey || '').trim());
  }, [transcriptModelConfig.apiKey, transcriptModelConfig.openaiEndpoint]);

  const handleInputClick = () => {
    if (isApiKeyLocked) {
      setIsLockButtonVibrating(true);
      setTimeout(() => setIsLockButtonVibrating(false), 500);
    }
  };

  const saveSettings = async () => {
    try {
      const endpoint = openaiEndpoint.trim();
      const model = transcriptModelConfig.model?.trim() || 'whisper-1';
      const normalizedApiKey = apiKey?.trim() || '';
      if (!endpoint || !model || !normalizedApiKey) {
        toast.error('Endpoint, model, and API key are required');
        return;
      }

      await invoke('api_save_transcript_config', {
        provider: 'openaiCompatible',
        model,
        openaiEndpoint: endpoint,
        apiKey: normalizedApiKey,
      });

      setTranscriptModelConfig({
        provider: 'openaiCompatible',
        model,
        openaiEndpoint: endpoint,
        apiKey: normalizedApiKey,
      });
      toast.success('Model settings saved successfully');
    } catch (error) {
      console.error('Failed to save OpenAI-compatible transcript settings:', error);
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const testConnection = async () => {
    try {
      setIsTestingConnection(true);
      setConnectionTestMessage('');
      setConnectionTestOk(null);

      const endpoint = openaiEndpoint.trim();
      const model = (transcriptModelConfig.model || 'whisper-1').trim();
      const normalizedApiKey = apiKey?.trim() || '';
      if (!endpoint || !model || !normalizedApiKey) {
        setConnectionTestOk(false);
        setConnectionTestMessage('Endpoint, model, and API key are required');
        return;
      }

      const result = await invoke<{ status: string; message: string }>(
        'api_test_openai_compatible_transcription_connection',
        {
          endpoint,
          apiKey: normalizedApiKey,
          model,
        }
      );

      setConnectionTestOk(true);
      setConnectionTestMessage(result.message || 'Connection successful');
    } catch (error) {
      setConnectionTestOk(false);
      setConnectionTestMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsTestingConnection(false);
    }
  };

  const isFormValid =
    !!openaiEndpoint.trim() &&
    !!(transcriptModelConfig.model || '').trim() &&
    !!(apiKey || '').trim();

  return (
    <div className="space-y-4 pb-6">
      <div>
        <Label className="block text-sm font-medium text-gray-700 mb-1">Transcript Provider</Label>
        <div className="mx-1">
          <Select
            value="openaiCompatible"
            onValueChange={() => {
              setTranscriptModelConfig({
                ...transcriptModelConfig,
                provider: 'openaiCompatible',
                model: transcriptModelConfig.model || 'whisper-1',
                openaiEndpoint,
                apiKey,
              });
            }}
          >
            <SelectTrigger className="focus:ring-1 focus:ring-blue-500 focus:border-blue-500">
              <SelectValue placeholder="Select provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openaiCompatible">OpenAI Compatible (Custom Endpoint)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className="block text-sm font-medium text-gray-700 mb-1">Transcription Model</Label>
        <Input
          type="text"
          className="focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          value={transcriptModelConfig.model || ''}
          onChange={(e) =>
            setTranscriptModelConfig({
              ...transcriptModelConfig,
              provider: 'openaiCompatible',
              model: e.target.value,
              openaiEndpoint,
              apiKey,
            })
          }
          placeholder="e.g. whisper-1 or your-custom-stt-model"
        />
      </div>

      <div>
        <Label className="block text-sm font-medium text-gray-700 mb-1">OpenAI-Compatible Endpoint</Label>
        <Input
          type="text"
          className="focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          value={openaiEndpoint}
          onChange={(e) => {
            setOpenaiEndpoint(e.target.value);
            setTranscriptModelConfig({
              ...transcriptModelConfig,
              provider: 'openaiCompatible',
              openaiEndpoint: e.target.value,
              model: transcriptModelConfig.model || 'whisper-1',
              apiKey,
            });
          }}
          placeholder="http://your-server:8000/v1"
        />
        <p className="text-xs text-gray-500 mt-1">Requests will be sent to /audio/transcriptions</p>
      </div>

      <div>
        <Label className="block text-sm font-medium text-gray-700 mb-1">API Key</Label>
        <div className="relative">
          <Input
            type={showApiKey ? 'text' : 'password'}
            className={`pr-24 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${isApiKeyLocked ? 'bg-gray-100 cursor-not-allowed' : ''}`}
            value={apiKey || ''}
            onChange={(e) => {
              setApiKey(e.target.value);
              setTranscriptModelConfig({
                ...transcriptModelConfig,
                provider: 'openaiCompatible',
                apiKey: e.target.value,
                openaiEndpoint,
              });
            }}
            disabled={isApiKeyLocked}
            onClick={handleInputClick}
            placeholder="Enter your API key"
          />
          {isApiKeyLocked && (
            <div
              onClick={handleInputClick}
              className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-50 rounded-md cursor-not-allowed"
            />
          )}
          <div className="absolute inset-y-0 right-0 pr-1 flex items-center">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setIsApiKeyLocked(!isApiKeyLocked)}
              className={`transition-colors duration-200 ${isLockButtonVibrating ? 'animate-vibrate text-red-500' : ''}`}
              title={isApiKeyLocked ? 'Unlock to edit' : 'Lock to prevent editing'}
            >
              {isApiKeyLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setShowApiKey(!showApiKey)}
            >
              {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      <Button type="button" onClick={saveSettings} disabled={!isFormValid} className="w-full">
        Save Settings
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={testConnection}
        disabled={
          isTestingConnection ||
          !isFormValid
        }
        className="w-full"
      >
        {isTestingConnection ? 'Testing...' : 'Test Connection'}
      </Button>
      {connectionTestMessage && (
        <p className={`text-xs ${connectionTestOk ? 'text-green-600' : 'text-red-600'}`}>
          {connectionTestMessage}
        </p>
      )}
    </div>
  );
}
