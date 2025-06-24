import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { User, Scan, Download, Upload, Camera } from 'lucide-react';
import { PhotogrammetryCapture } from './PhotogrammetryCapture';

interface ModelSelectorProps {
  onModelChange: (modelPath: string, modelType: 'default' | 'custom') => void;
  currentModelPath: string;
}

interface CustomModel {
  id: string;
  name: string;
  url: string;
  createdAt: string;
  thumbnail?: string;
}

export const ModelSelector = ({ onModelChange, currentModelPath }: ModelSelectorProps) => {
  const [customModels, setCustomModels] = useState<CustomModel[]>([]);
  const [activeModel, setActiveModel] = useState<'default' | 'custom'>('default');
  const [isCapturing, setIsCapturing] = useState(false);

  const handleModelGenerated = (modelUrl: string) => {
    const newModel: CustomModel = {
      id: Date.now().toString(),
      name: `Face Scan ${new Date().toLocaleDateString()}`,
      url: modelUrl,
      createdAt: new Date().toISOString(),
    };

    setCustomModels(prev => [newModel, ...prev]);
    setActiveModel('custom');
    onModelChange(modelUrl, 'custom');
  };

  const handleScanComplete = (scanData: any) => {
    console.log('Scan completed:', scanData);
    // You can store additional scan metadata here
  };

  const handleModelSelect = (model: CustomModel) => {
    setActiveModel('custom');
    onModelChange(model.url, 'custom');
  };

  const handleDefaultModelSelect = () => {
    setActiveModel('default');
    onModelChange('/models/elon-musk.glb', 'default');
  };



  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Model Selection
        </CardTitle>
        <CardDescription>
          Choose between the default model or create your own using photogrammetry
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <Tabs value={activeModel} onValueChange={(value) => setActiveModel(value as 'default' | 'custom')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="default" onClick={handleDefaultModelSelect}>
              <User className="h-4 w-4 mr-2" />
              Default Model
            </TabsTrigger>
            <TabsTrigger value="custom">
              <Scan className="h-4 w-4 mr-2" />
              Custom Models
            </TabsTrigger>
          </TabsList>

          <TabsContent value="default" className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <User className="h-6 w-6 text-white" />
                </div>
                <div>
                  <div className="font-medium">Elon Musk Model</div>
                  <div className="text-sm text-gray-500">Default reference model</div>
                </div>
              </div>
              <Badge variant={activeModel === 'default' ? 'default' : 'secondary'}>
                {activeModel === 'default' ? 'Active' : 'Available'}
              </Badge>
            </div>
            
            <div className="text-sm text-gray-600 space-y-2">
              <div>• Pre-loaded 3D face model</div>
              <div>• Ready for immediate editing</div>
              <div>• Perfect for testing features</div>
            </div>
          </TabsContent>

          <TabsContent value="custom" className="space-y-4">
            {/* Custom Models List */}
            {customModels.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Your Scanned Models</h4>
                {customModels.map((model) => (
                  <div
                    key={model.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                    onClick={() => handleModelSelect(model)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-blue-600 rounded-lg flex items-center justify-center">
                        <Scan className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <div className="font-medium text-sm">{model.name}</div>
                        <div className="text-xs text-gray-500">
                          {new Date(model.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <Badge variant={currentModelPath === model.url ? 'default' : 'secondary'}>
                      {currentModelPath === model.url ? 'Active' : 'Select'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            {/* Photogrammetry Capture Component */}
            <div className="border-t pt-4">
              <PhotogrammetryCapture
                onModelGenerated={handleModelGenerated}
                onScanComplete={handleScanComplete}
              />
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
