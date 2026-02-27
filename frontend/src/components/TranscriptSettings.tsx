import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Eye, EyeOff, Lock, Unlock } from 'lucide-react';
import { ModelManager } from './WhisperModelManager';
import { ParakeetModelManager } from './ParakeetModelManager';

export interface TranscriptModelProps {
    provider: 'localWhisper' | 'parakeet' | 'deepgram' | 'elevenLabs' | 'groq' | 'openai' | 'openaiCompatible';
    model: string;
    openaiEndpoint?: string | null;
    apiKey?: string | null;
}

export interface TranscriptSettingsProps {
    transcriptModelConfig: TranscriptModelProps;
    setTranscriptModelConfig: (config: TranscriptModelProps) => void;
    onModelSelect?: () => void;
}

export function TranscriptSettings({ transcriptModelConfig, setTranscriptModelConfig, onModelSelect }: TranscriptSettingsProps) {
    const [apiKey, setApiKey] = useState<string | null>(transcriptModelConfig.apiKey || null);
    const [openaiEndpoint, setOpenaiEndpoint] = useState<string>(transcriptModelConfig.openaiEndpoint || '');
    const [showApiKey, setShowApiKey] = useState<boolean>(false);
    const [isApiKeyLocked, setIsApiKeyLocked] = useState<boolean>(true);
    const [isLockButtonVibrating, setIsLockButtonVibrating] = useState<boolean>(false);
    const [uiProvider, setUiProvider] = useState<TranscriptModelProps['provider']>(transcriptModelConfig.provider);
    const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false);
    const [connectionTestMessage, setConnectionTestMessage] = useState<string>('');
    const [connectionTestOk, setConnectionTestOk] = useState<boolean | null>(null);

    useEffect(() => {
        setUiProvider(transcriptModelConfig.provider);
    }, [transcriptModelConfig.provider]);

    useEffect(() => {
        if (transcriptModelConfig.provider === 'localWhisper' || transcriptModelConfig.provider === 'parakeet') {
            setApiKey(null);
        }
    }, [transcriptModelConfig.provider]);

    useEffect(() => {
        setApiKey(transcriptModelConfig.apiKey || null);
        setOpenaiEndpoint(transcriptModelConfig.openaiEndpoint || '');
    }, [transcriptModelConfig.apiKey, transcriptModelConfig.openaiEndpoint]);

    const fetchApiKey = async (provider: string) => {
        try {
            const data = await invoke('api_get_transcript_api_key', { provider }) as string;
            setApiKey(data || '');
        } catch (err) {
            console.error('Error fetching API key:', err);
            setApiKey(null);
        }
    };

    const modelOptions: Record<TranscriptModelProps['provider'], string[]> = {
        localWhisper: [],
        parakeet: [],
        deepgram: ['nova-2-phonecall'],
        elevenLabs: ['eleven_multilingual_v2'],
        groq: ['llama-3.3-70b-versatile'],
        openai: ['gpt-4o'],
        openaiCompatible: ['whisper-1'],
    };

    const requiresApiKey = uiProvider === 'deepgram' || uiProvider === 'elevenLabs' || uiProvider === 'openai' || uiProvider === 'groq' || uiProvider === 'openaiCompatible';

    const handleInputClick = () => {
        if (isApiKeyLocked) {
            setIsLockButtonVibrating(true);
            setTimeout(() => setIsLockButtonVibrating(false), 500);
        }
    };

    const handleWhisperModelSelect = (modelName: string) => {
        setTranscriptModelConfig({
            ...transcriptModelConfig,
            provider: 'localWhisper',
            model: modelName
        });
        if (onModelSelect) {
            onModelSelect();
        }
    };

    const handleParakeetModelSelect = (modelName: string) => {
        setTranscriptModelConfig({
            ...transcriptModelConfig,
            provider: 'parakeet',
            model: modelName
        });
        if (onModelSelect) {
            onModelSelect();
        }
    };

    const saveOpenAICompatibleSettings = async () => {
        try {
            const endpoint = openaiEndpoint.trim();
            const model = transcriptModelConfig.model?.trim() || 'whisper-1';
            const normalizedApiKey = apiKey?.trim() ? apiKey.trim() : null;
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
        } catch (error) {
            console.error('Failed to save OpenAI-compatible transcript settings:', error);
        }
    };

    const testOpenAICompatibleConnection = async () => {
        try {
            setIsTestingConnection(true);
            setConnectionTestMessage('');
            setConnectionTestOk(null);

            const endpoint = openaiEndpoint.trim();
            const model = (transcriptModelConfig.model || 'whisper-1').trim();
            const normalizedApiKey = apiKey?.trim() ? apiKey.trim() : null;

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

    return (
        <div>
            <div>
                <div className="space-y-4 pb-6">
                    <div>
                        <Label className="block text-sm font-medium text-gray-700 mb-1">
                            Transcript Model
                        </Label>
                        <div className="flex space-x-2 mx-1">
                            <Select
                                value={uiProvider}
                                onValueChange={(value) => {
                                    const provider = value as TranscriptModelProps['provider'];
                                    setUiProvider(provider);

                                    if (provider === 'openaiCompatible') {
                                        setTranscriptModelConfig({
                                            ...transcriptModelConfig,
                                            provider,
                                            model: transcriptModelConfig.model || 'whisper-1',
                                            openaiEndpoint: transcriptModelConfig.openaiEndpoint || '',
                                            apiKey: transcriptModelConfig.apiKey || null,
                                        });
                                    }

                                    if (provider !== 'localWhisper' && provider !== 'parakeet') {
                                        fetchApiKey(provider);
                                    }
                                }}
                            >
                                <SelectTrigger className='focus:ring-1 focus:ring-blue-500 focus:border-blue-500'>
                                    <SelectValue placeholder="Select provider" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="parakeet">Parakeet (Recommended - Real-time / Accurate)</SelectItem>
                                    <SelectItem value="localWhisper">Local Whisper (High Accuracy)</SelectItem>
                                    <SelectItem value="openaiCompatible">OpenAI Compatible (Custom Endpoint)</SelectItem>
                                </SelectContent>
                            </Select>

                            {uiProvider !== 'localWhisper' && uiProvider !== 'parakeet' && (
                                <Select
                                    value={transcriptModelConfig.model}
                                    onValueChange={(value) => {
                                        const model = value as TranscriptModelProps['model'];
                                        setTranscriptModelConfig({
                                            ...transcriptModelConfig,
                                            provider: uiProvider,
                                            model,
                                            openaiEndpoint,
                                            apiKey,
                                        });
                                    }}
                                >
                                    <SelectTrigger className='focus:ring-1 focus:ring-blue-500 focus:border-blue-500'>
                                        <SelectValue placeholder="Select model" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {modelOptions[uiProvider].map((model) => (
                                            <SelectItem key={model} value={model}>{model}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}

                        </div>
                    </div>

                    {uiProvider === 'localWhisper' && (
                        <div className="mt-6">
                            <ModelManager
                                selectedModel={transcriptModelConfig.provider === 'localWhisper' ? transcriptModelConfig.model : undefined}
                                onModelSelect={handleWhisperModelSelect}
                                autoSave={true}
                            />
                        </div>
                    )}

                    {uiProvider === 'parakeet' && (
                        <div className="mt-6">
                            <ParakeetModelManager
                                selectedModel={transcriptModelConfig.provider === 'parakeet' ? transcriptModelConfig.model : undefined}
                                onModelSelect={handleParakeetModelSelect}
                                autoSave={true}
                            />
                        </div>
                    )}

                    {uiProvider === 'openaiCompatible' && (
                        <div className="space-y-4">
                            <div>
                                <Label className="block text-sm font-medium text-gray-700 mb-1">
                                    OpenAI-Compatible Endpoint
                                </Label>
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
                                <p className="text-xs text-gray-500 mt-1">
                                    Requests will be sent to /audio/transcriptions
                                </p>
                            </div>
                            <Button
                                type="button"
                                onClick={saveOpenAICompatibleSettings}
                                className="w-full"
                            >
                                Save OpenAI-Compatible Settings
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={testOpenAICompatibleConnection}
                                disabled={isTestingConnection || !openaiEndpoint.trim() || !(transcriptModelConfig.model || 'whisper-1').trim()}
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
                    )}

                    {requiresApiKey && (
                        <div>
                            <Label className="block text-sm font-medium text-gray-700 mb-1">
                                API Key
                            </Label>
                            <div className="relative mx-1">
                                <Input
                                    type={showApiKey ? 'text' : 'password'}
                                    className={`pr-24 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${isApiKeyLocked ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                    value={apiKey || ''}
                                    onChange={(e) => {
                                        setApiKey(e.target.value);
                                        setTranscriptModelConfig({
                                            ...transcriptModelConfig,
                                            provider: uiProvider,
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
                    )}
                </div>
            </div>
        </div>
    );
}
