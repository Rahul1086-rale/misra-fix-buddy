import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';

export default function SettingsPage() {
  const { state, dispatch } = useAppContext();
  const { toast } = useToast();
  const { modelSettings } = state;

  const handleSaveSettings = async () => {
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(modelSettings),
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Settings saved successfully",
        });
      } else {
        throw new Error('Failed to save settings');
      }
    } catch (error) {
      console.error('Save settings error:', error);
      toast({
        title: "Error",
        description: "Failed to save settings",
        variant: "destructive",
      });
    }
  };

  const updateSetting = (key: keyof typeof modelSettings, value: any) => {
    dispatch({
      type: 'UPDATE_MODEL_SETTINGS',
      payload: { [key]: value }
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link to="/">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Chat
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Settings</h1>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Model Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Model Selection */}
            <div className="space-y-2">
              <Label htmlFor="model">Model</Label>
              <Select
                value={modelSettings.model_name}
                onValueChange={(value) => updateSetting('model_name', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini-1.5-flash">Gemini 1.5 Flash</SelectItem>
                  <SelectItem value="gemini-1.5-pro">Gemini 1.5 Pro</SelectItem>
                  <SelectItem value="gemini-2.0-flash">Gemini 2.0 Flash</SelectItem>
                  <SelectItem value="gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Temperature */}
            <div className="space-y-3">
              <div className="flex justify-between">
                <Label>Temperature</Label>
                <span className="text-sm text-muted-foreground">
                  {modelSettings.temperature}
                </span>
              </div>
              <Slider
                value={[modelSettings.temperature]}
                onValueChange={(value) => updateSetting('temperature', value[0])}
                max={1}
                min={0}
                step={0.1}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Controls randomness. Lower values are more deterministic.
              </p>
            </div>

            {/* Top P */}
            <div className="space-y-3">
              <div className="flex justify-between">
                <Label>Top P</Label>
                <span className="text-sm text-muted-foreground">
                  {modelSettings.top_p}
                </span>
              </div>
              <Slider
                value={[modelSettings.top_p]}
                onValueChange={(value) => updateSetting('top_p', value[0])}
                max={1}
                min={0}
                step={0.05}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Controls diversity via nucleus sampling.
              </p>
            </div>

            {/* Max Tokens */}
            <div className="space-y-2">
              <Label htmlFor="maxTokens">Max Output Tokens</Label>
              <Input
                id="maxTokens"
                type="number"
                value={modelSettings.max_tokens}
                onChange={(e) => updateSetting('max_tokens', parseInt(e.target.value))}
                min={1}
                max={100000}
              />
              <p className="text-xs text-muted-foreground">
                Maximum number of tokens to generate.
              </p>
            </div>

            {/* Safety Settings */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label>Safety Filters</Label>
                <p className="text-xs text-muted-foreground">
                  Enable basic safety filtering for content
                </p>
              </div>
              <Switch
                checked={modelSettings.safety_settings}
                onCheckedChange={(checked) => updateSetting('safety_settings', checked)}
              />
            </div>

            {/* Save Button */}
            <div className="pt-4">
              <Button onClick={handleSaveSettings} className="w-full">
                <Save className="w-4 h-4 mr-2" />
                Save Settings
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Current Configuration Preview */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Current Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto">
              {JSON.stringify(modelSettings, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}