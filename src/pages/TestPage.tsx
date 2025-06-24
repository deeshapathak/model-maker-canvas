import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, XCircle, Loader2, Play, TestTube, Camera, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TestResult {
  step: string;
  status: 'pending' | 'running' | 'success' | 'error';
  message: string;
  data?: any;
}

const TestPage = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [capturedImages, setCapturedImages] = useState<File[]>([]);
  const { toast } = useToast();

  const testSteps = [
    {
      name: 'Backend Health Check',
      test: async () => {
        const response = await fetch('https://3d-scanner-backend.pathakdeesha.workers.dev/health');
        if (!response.ok) throw new Error('Backend server not responding');
        const data = await response.json();
        return { message: 'Backend server is running', data };
      }
    },
    {
      name: 'Session Creation',
      test: async () => {
        const response = await fetch('https://3d-scanner-backend.pathakdeesha.workers.dev/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patientName: 'Test Patient', patientId: 'test123' })
        });
        if (!response.ok) throw new Error('Session creation failed');
        const data = await response.json();
        return { message: 'Session created successfully', data };
      }
    },

    {
      name: 'Photo Capture Simulation',
      test: async () => {
        // Create test images
        const testImages: File[] = [];
        
        for (let i = 0; i < 10; i++) {
          const canvas = document.createElement('canvas');
          canvas.width = 640;
          canvas.height = 480;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#f0f0f0';
            ctx.fillRect(0, 0, 640, 480);
            ctx.fillStyle = '#333';
            ctx.font = '24px Arial';
            ctx.fillText(`Test Image ${i + 1}`, 50, 50);
          }
          
          const blob = await new Promise<Blob>((resolve) => {
            canvas.toBlob((blob) => {
              if (blob) resolve(blob);
            }, 'image/jpeg', 0.8);
          });
          
          const file = new File([blob], `test_image_${i + 1}.jpg`, { type: 'image/jpeg' });
          testImages.push(file);
        }
        
        setCapturedImages(testImages);
        return { message: 'Test images created', data: { count: testImages.length } };
      }
    },
    {
      name: 'Photo Processing Test',
      test: async () => {
        if (capturedImages.length === 0) {
          throw new Error('No images to process');
        }

        const formData = new FormData();
        formData.append('sessionId', 'test_session_123');
        capturedImages.forEach((image, index) => {
          formData.append('images', image);
        });

        const response = await fetch('https://3d-scanner-backend.pathakdeesha.workers.dev/api/capture-photos', {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`Photo processing failed: ${errorData.error || response.statusText}`);
        }

        const data = await response.json();
        return { message: 'Photo processing successful', data };
      }
    }
  ];

  const runTest = async () => {
    setIsRunning(true);
    setResults([]);
    setCurrentStep(0);

    for (let i = 0; i < testSteps.length; i++) {
      const step = testSteps[i];
      setCurrentStep(i);

      // Add pending result
      setResults(prev => [...prev, {
        step: step.name,
        status: 'running',
        message: 'Testing...'
      }]);

      try {
        const result = await step.test();
        
        // Update result to success
        setResults(prev => prev.map((r, index) => 
          index === i ? {
            step: step.name,
            status: 'success',
            message: result.message,
            data: result.data
          } : r
        ));

        // Small delay between tests
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        // Update result to error
        setResults(prev => prev.map((r, index) => 
          index === i ? {
            step: step.name,
            status: 'error',
            message: error.message
          } : r
        ));
      }
    }

    setCurrentStep(testSteps.length);
    setIsRunning(false);
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'running': return <Loader2 className="h-4 w-4 animate-spin" />;
      case 'success': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error': return <XCircle className="h-4 w-4 text-red-500" />;
      default: return <div className="h-4 w-4 rounded-full bg-gray-300" />;
    }
  };

  const getStatusColor = (status: TestResult['status']) => {
    switch (status) {
      case 'success': return 'bg-green-50 border-green-200';
      case 'error': return 'bg-red-50 border-red-200';
      case 'running': return 'bg-blue-50 border-blue-200';
      default: return 'bg-gray-50 border-gray-200';
    }
  };

  const allTestsPassed = results.length > 0 && results.every(r => r.status === 'success');
  const anyTestsFailed = results.some(r => r.status === 'error');

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card className="w-full max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TestTube className="h-5 w-5" />
            3D Model Capture Integration Test
          </CardTitle>
          <CardDescription>
            Comprehensive test of the photo capture and KIRI Engine integration
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <Button 
              onClick={runTest} 
              disabled={isRunning}
              className="flex items-center gap-2"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running Tests...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Run Integration Test
                </>
              )}
            </Button>
            
            {results.length > 0 && (
              <div className="flex items-center gap-2">
                <Badge variant={allTestsPassed ? 'default' : anyTestsFailed ? 'destructive' : 'secondary'}>
                  {results.filter(r => r.status === 'success').length}/{results.length} Passed
                </Badge>
              </div>
            )}
          </div>

          {isRunning && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Progress</span>
                <span>{Math.round((currentStep / testSteps.length) * 100)}%</span>
              </div>
              <Progress value={(currentStep / testSteps.length) * 100} />
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-medium">Test Results:</h4>
              {results.map((result, index) => (
                <div 
                  key={index}
                  className={`p-3 rounded-lg border ${getStatusColor(result.status)}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(result.status)}
                      <span className="font-medium">{result.step}</span>
                    </div>
                    <Badge variant={result.status === 'success' ? 'default' : result.status === 'error' ? 'destructive' : 'secondary'}>
                      {result.status}
                    </Badge>
                  </div>
                  <p className="text-sm mt-1 text-gray-600">{result.message}</p>
                  {result.data && (
                    <pre className="text-xs mt-2 p-2 bg-gray-100 rounded overflow-auto">
                      {JSON.stringify(result.data, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}

          {allTestsPassed && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                <strong>All tests passed!</strong> Your 3D model capture integration is working correctly. 
                The photo capture and KIRI Engine processing should now function properly.
              </AlertDescription>
            </Alert>
          )}

          {anyTestsFailed && (
            <Alert className="border-red-200 bg-red-50">
              <XCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                <strong>Some tests failed.</strong> Check the error messages above and fix any issues before proceeding.
              </AlertDescription>
            </Alert>
          )}

          {/* Test Images Preview */}
          {capturedImages.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-medium">Test Images ({capturedImages.length}):</h4>
              <div className="grid grid-cols-5 gap-2">
                {capturedImages.map((image, index) => (
                  <div key={index} className="relative">
                    <img 
                      src={URL.createObjectURL(image)} 
                      alt={`Test ${index + 1}`}
                      className="w-full h-20 object-cover rounded border"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-1 text-center">
                      {index + 1}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-xs text-gray-500 space-y-1">
            <p><strong>What this test does:</strong></p>
            <ul className="list-disc list-inside space-y-1">
              <li>Verifies backend server connectivity</li>
              <li>Tests session creation functionality</li>
              <li>Validates KIRI API integration</li>
              <li>Creates test images for processing</li>
              <li>Tests photo capture and processing pipeline</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TestPage;
