'use client';

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Eye, EyeOff, Lock, Unlock } from 'lucide-react';
import { Switch } from './ui/switch';
import { useConfig } from '@/contexts/ConfigContext';

interface SummaryModelSettingsProps {
  refetchTrigger?: number;
}

export function SummaryModelSettings({ refetchTrigger }: SummaryModelSettingsProps) {
  const { isAutoSummary, toggleIsAutoSummary, setModelConfig } = useConfig();

  const [endpoint, setEndpoint] = useState('');
  const [model, setModel] = useState('gpt-4o');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isApiKeyLocked, setIsApiKeyLocked] = useState(true);
  const [isLockButtonVibrating, setIsLockButtonVibrating] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionTestMessage, setConnectionTestMessage] = useState('');
  const [connectionTestOk, setConnectionTestOk] = useState<boolean | null>(null);

  const loadSettings = async () => {
    try {
      const customConfig = (await invoke('api_get_custom_openai_config')) as {
        endpoint?: string;
        model?: string;
        apiKey?: string;
      } | null;

      if (customConfig) {
        setEndpoint(customConfig.endpoint || '');
        setModel(customConfig.model || 'gpt-4o');
        const key = customConfig.apiKey || '';
        setApiKey(key);
        setIsApiKeyLocked(!!key.trim());
        return;
      }

      const modelConfig = (await invoke('api_get_model_config')) as {
        model?: string;
      } | null;
      if (modelConfig?.model) {
        setModel(modelConfig.model);
      }
      setIsApiKeyLocked(false);
    } catch (error) {
      console.error('Failed to load model settings:', error);
      toast.error('Failed to load model settings');
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (refetchTrigger !== undefined && refetchTrigger > 0) {
      loadSettings();
    }
  }, [refetchTrigger]);

  const handleInputClick = () => {
    if (isApiKeyLocked) {
      setIsLockButtonVibrating(true);
      setTimeout(() => setIsLockButtonVibrating(false), 500);
    }
  };

  const saveSettings = async () => {
    try {
      const normalizedEndpoint = endpoint.trim();
      const normalizedModel = model.trim();
      const normalizedApiKey = apiKey.trim();

      if (!normalizedEndpoint || !normalizedModel || !normalizedApiKey) {
        toast.error('Endpoint, model, and API key are required');
        return;
      }

      await invoke('api_save_custom_openai_config', {
        endpoint: normalizedEndpoint,
        model: normalizedModel,
        apiKey: normalizedApiKey,
        maxTokens: null,
        temperature: null,
        topP: null,
      });

      await invoke('api_save_model_config', {
        provider: 'custom-openai',
        model: normalizedModel,
        whisperModel: 'large-v3',
        apiKey: null,
        ollamaEndpoint: null,
      });

      setModelConfig((prev) => ({
        ...prev,
        provider: 'custom-openai',
        model: normalizedModel,
        customOpenAIEndpoint: normalizedEndpoint,
        customOpenAIModel: normalizedModel,
        customOpenAIApiKey: normalizedApiKey,
      }));

      toast.success('Model settings saved successfully');
    } catch (error) {
      console.error('Error saving model settings:', error);
      toast.error('Failed to save model settings');
    }
  };

  const testConnection = async () => {
    try {
      setIsTestingConnection(true);
      setConnectionTestMessage('');
      setConnectionTestOk(null);

      const normalizedEndpoint = endpoint.trim();
      const normalizedModel = model.trim();
      const normalizedApiKey = apiKey.trim();
      if (!normalizedEndpoint || !normalizedModel || !normalizedApiKey) {
        setConnectionTestOk(false);
        setConnectionTestMessage('Endpoint, model, and API key are required');
        return;
      }

      const result = await invoke<{ status: string; message: string }>(
        'api_test_custom_openai_connection',
        {
          endpoint: normalizedEndpoint,
          apiKey: normalizedApiKey,
          model: normalizedModel,
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

  const isFormValid = endpoint.trim() && model.trim() && apiKey.trim();

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Auto Summary</h3>
            <p className="text-sm text-gray-600">Auto Generating summary after meeting completion(Stopping)</p>
          </div>
          <Switch checked={isAutoSummary} onCheckedChange={toggleIsAutoSummary} />
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Summary Model Configuration</h3>
        <p className="text-sm text-gray-600 mb-6">Configure OpenAI-compatible provider for meeting summaries.</p>

        <div className="space-y-4 pb-2">
          <div>
            <Label className="block text-sm font-medium text-gray-700 mb-1">OpenAI-Compatible Endpoint</Label>
            <Input
              type="text"
              className="focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="http://your-server:8000/v1"
            />
          </div>

          <div>
            <Label className="block text-sm font-medium text-gray-700 mb-1">Summary Model</Label>
            <Input
              type="text"
              className="focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g. gpt-4o or your-custom-summary-model"
            />
          </div>

          <div>
            <Label className="block text-sm font-medium text-gray-700 mb-1">API Key</Label>
            <div className="relative">
              <Input
                type={showApiKey ? 'text' : 'password'}
                className={`pr-24 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${isApiKeyLocked ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
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
                <Button type="button" variant="ghost" size="icon" onClick={() => setShowApiKey(!showApiKey)}>
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
            disabled={isTestingConnection || !isFormValid}
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
      </div>
    </div>
  );
}
