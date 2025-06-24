import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Progress } from './ui/progress';
import { Camera, Video, Download, RotateCcw, Play, Square } from 'lucide-react';
import { toast } from './ui/use-toast';

interface CaptureStatus {
  status: 'idle' | 'recording' | 'processing' | 'completed' | 'failed';
  progress: number;
  message: string;
  modelUrl?: string;
  error?: string;
}

interface AdvancedFaceCaptureProps {
  sessionId: string;
  onModelReady?: (sessionId: string, modelUrl: string) => void;
}

const BACKEND_URL = 'http://localhost:8000'; // Update this to your backend URL

export const AdvancedFaceCapture: React.FC<AdvancedFaceCaptureProps> = ({
  sessionId,
  onModelReady
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [captureStatus, setCaptureStatus] = useState<CaptureStatus>({
    status: 'idle',
    progress: 0,
    message: 'Ready to start 4K face capture'
  });
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [keyframes, setKeyframes] = useState<Blob[]>([]);
  const [recordingTime, setRecordingTime] = useState(0);
  const [faceDetected, setFaceDetected] = useState(false);

  // Initialize session
  useEffect(() => {
    initializeSession();
  }, [sessionId]);

  const initializeSession = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/create-session/${sessionId}`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error('Failed to create session');
      }
      
      console.log('Session initialized:', sessionId);
    } catch (error) {
      console.error('Session initialization error:', error);
      setCaptureStatus(prev => ({
        ...prev,
        status: 'failed',
        error: 'Failed to initialize session'
      }));
    }
  };

  const startCamera = async () => {
    try {
      const constraints = {
        video: {
          width: { ideal: 3840 }, // 4K
          height: { ideal: 2160 },
          facingMode: 'user', // Front camera
          frameRate: { ideal: 30 }
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      // Start face detection
      startFaceDetection();
      
    } catch (error) {
      console.error('Camera access error:', error);
      toast({
        title: "Camera Error",
        description: "Failed to access camera. Please check permissions.",
        variant: "destructive"
      });
    }
  };

  const startFaceDetection = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const detectFace = () => {
      if (!videoRef.current || !ctx) return;

      const video = videoRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Draw video frame to canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Get image data for face detection
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      // Simple face detection using skin tone detection
      // In a real implementation, you'd use a proper face detection library
      const data = imageData.data;
      let skinPixels = 0;
      let totalPixels = data.length / 4;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Simple skin tone detection
        if (r > 95 && g > 40 && b > 20 && 
            Math.max(r, g, b) - Math.min(r, g, b) > 15 &&
            Math.abs(r - g) > 15 && r > g && r > b) {
          skinPixels++;
        }
      }

      const skinPercentage = (skinPixels / totalPixels) * 100;
      const hasFace = skinPercentage > 10; // Threshold for face detection
      
      setFaceDetected(hasFace);

      // Continue detection
      requestAnimationFrame(detectFace);
    };

    detectFace();
  };

  const startRecording = async () => {
    if (!streamRef.current) {
      await startCamera();
      return;
    }

    try {
      const options = {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 8000000 // 8 Mbps for high quality
      };

      const mediaRecorder = new MediaRecorder(streamRef.current, options);
      mediaRecorderRef.current = mediaRecorder;

      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const recordedBlob = new Blob(chunks, { type: 'video/webm' });
        setRecordedChunks([recordedBlob]);
        extractKeyframes(recordedBlob);
      };

      mediaRecorder.start(1000); // Record in 1-second chunks
      setIsRecording(true);
      setRecordingTime(0);

      // Start recording timer
      const timer = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      // Stop recording after 30 seconds
      setTimeout(() => {
        stopRecording();
        clearInterval(timer);
      }, 30000);

    } catch (error) {
      console.error('Recording error:', error);
      toast({
        title: "Recording Error",
        description: "Failed to start recording.",
        variant: "destructive"
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const extractKeyframes = async (videoBlob: Blob) => {
    setCaptureStatus(prev => ({
      ...prev,
      status: 'processing',
      progress: 10,
      message: 'Extracting keyframes from video...'
    }));

    try {
      // Create video element for frame extraction
      const video = document.createElement('video');
      video.src = URL.createObjectURL(videoBlob);
      
      await new Promise((resolve) => {
        video.onloadedmetadata = resolve;
      });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Failed to get canvas context');

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const keyframeBlobs: Blob[] = [];
      const frameInterval = Math.floor(video.duration / 20); // Extract ~20 frames
      let frameCount = 0;

      for (let time = 0; time < video.duration; time += frameInterval) {
        video.currentTime = time;
        
        await new Promise((resolve) => {
          video.onseeked = resolve;
        });

        // Draw frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Convert to JPEG with 90% quality
        canvas.toBlob((blob) => {
          if (blob) {
            keyframeBlobs.push(blob);
            frameCount++;
            
            setCaptureStatus(prev => ({
              ...prev,
              progress: 10 + (frameCount / 20) * 20,
              message: `Extracted ${frameCount} keyframes...`
            }));
          }
        }, 'image/jpeg', 0.9);
      }

      setKeyframes(keyframeBlobs);
      setCaptureStatus(prev => ({
        ...prev,
        progress: 30,
        message: `Extracted ${keyframeBlobs.length} keyframes, uploading...`
      }));

      // Upload keyframes
      await uploadKeyframes(keyframeBlobs);

    } catch (error) {
      console.error('Keyframe extraction error:', error);
      setCaptureStatus(prev => ({
        ...prev,
        status: 'failed',
        error: 'Failed to extract keyframes'
      }));
    }
  };

  const uploadKeyframes = async (keyframeBlobs: Blob[]) => {
    try {
      let uploadedCount = 0;
      const totalFrames = keyframeBlobs.length;

      for (const blob of keyframeBlobs) {
        const formData = new FormData();
        formData.append('file', blob, `frame_${uploadedCount}.jpg`);

        const response = await fetch(`${BACKEND_URL}/upload-image/${sessionId}`, {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.warn(`Frame ${uploadedCount} upload failed:`, errorData);
          // Continue with other frames
        } else {
          uploadedCount++;
        }

        setCaptureStatus(prev => ({
          ...prev,
          progress: 30 + (uploadedCount / totalFrames) * 30,
          message: `Uploaded ${uploadedCount}/${totalFrames} frames...`
        }));
      }

      if (uploadedCount >= 10) {
        // Start 3D processing
        await start3DProcessing();
      } else {
        throw new Error(`Insufficient frames uploaded: ${uploadedCount}/10`);
      }

    } catch (error) {
      console.error('Upload error:', error);
      setCaptureStatus(prev => ({
        ...prev,
        status: 'failed',
        error: 'Failed to upload frames'
      }));
    }
  };

  const start3DProcessing = async () => {
    try {
      setCaptureStatus(prev => ({
        ...prev,
        progress: 60,
        message: 'Starting 3D reconstruction...'
      }));

      const response = await fetch(`${BACKEND_URL}/process-session/${sessionId}`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error('Failed to start 3D processing');
      }

      // Start polling for completion
      pollProcessingStatus();

    } catch (error) {
      console.error('3D processing error:', error);
      setCaptureStatus(prev => ({
        ...prev,
        status: 'failed',
        error: 'Failed to start 3D processing'
      }));
    }
  };

  const pollProcessingStatus = async () => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/session-status/${sessionId}`);
        
        if (response.ok) {
          const status = await response.json();
          
          setCaptureStatus(prev => ({
            ...prev,
            progress: status.progress || prev.progress,
            message: status.message || prev.message
          }));

          if (status.status === 'completed') {
            clearInterval(pollInterval);
            setCaptureStatus(prev => ({
              ...prev,
              status: 'completed',
              progress: 100,
              message: '3D model ready!',
              modelUrl: status.model_url
            }));

            if (onModelReady && status.model_url) {
              onModelReady(sessionId, `${BACKEND_URL}${status.model_url}`);
            }

            toast({
              title: "Success!",
              description: "3D face model created successfully!",
            });

          } else if (status.status === 'failed') {
            clearInterval(pollInterval);
            setCaptureStatus(prev => ({
              ...prev,
              status: 'failed',
              error: status.error || 'Processing failed'
            }));
          }
        }
      } catch (error) {
        console.error('Status polling error:', error);
      }
    }, 2000); // Poll every 2 seconds

    // Stop polling after 10 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
      if (captureStatus.status === 'processing') {
        setCaptureStatus(prev => ({
          ...prev,
          status: 'failed',
          error: 'Processing timeout'
        }));
      }
    }, 600000);
  };

  const resetCapture = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsRecording(false);
    setRecordedChunks([]);
    setKeyframes([]);
    setRecordingTime(0);
    setFaceDetected(false);
    
    setCaptureStatus({
      status: 'idle',
      progress: 0,
      message: 'Ready to start 4K face capture'
    });
  };

  const downloadModel = () => {
    if (captureStatus.modelUrl) {
      const link = document.createElement('a');
      link.href = captureStatus.modelUrl;
      link.download = `face_model_${sessionId}.glb`;
      link.click();
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Advanced 4K Face Capture
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Video Preview */}
          <div className="relative bg-black rounded-lg overflow-hidden">
            <video
              ref={videoRef}
              className="w-full h-80 object-cover"
              autoPlay
              playsInline
              muted
            />
            <canvas
              ref={canvasRef}
              className="hidden"
            />
            
            {/* Face Detection Indicator */}
            <div className="absolute top-4 right-4">
              <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                faceDetected 
                  ? 'bg-green-500 text-white' 
                  : 'bg-red-500 text-white'
              }`}>
                {faceDetected ? 'Face Detected' : 'No Face'}
              </div>
            </div>

            {/* Recording Timer */}
            {isRecording && (
              <div className="absolute top-4 left-4">
                <div className="bg-red-500 text-white px-3 py-1 rounded-full text-sm font-medium">
                  Recording: {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
                </div>
              </div>
            )}
          </div>

          {/* Status Display */}
          {captureStatus.status !== 'idle' && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{captureStatus.message}</span>
                <span>{captureStatus.progress}%</span>
              </div>
              <Progress value={captureStatus.progress} className="w-full" />
              
              {captureStatus.error && (
                <div className="text-red-500 text-sm">
                  Error: {captureStatus.error}
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            {captureStatus.status === 'idle' && (
              <Button
                onClick={startRecording}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
                disabled={!faceDetected}
              >
                <Video className="h-4 w-4 mr-2" />
                Start 4K Recording
              </Button>
            )}

            {isRecording && (
              <Button
                onClick={stopRecording}
                className="flex-1 bg-red-600 hover:bg-red-700"
              >
                <Square className="h-4 w-4 mr-2" />
                Stop Recording
              </Button>
            )}

            {captureStatus.status === 'completed' && (
              <Button
                onClick={downloadModel}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                <Download className="h-4 w-4 mr-2" />
                Download 3D Model
              </Button>
            )}

            <Button
              onClick={resetCapture}
              variant="outline"
              className="px-4"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>

          {/* Instructions */}
          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2">📸 Capture Instructions:</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Ensure good lighting (natural light is best)</li>
              <li>• Keep your face centered in the camera</li>
              <li>• Recording will automatically stop after 30 seconds</li>
              <li>• Move slowly around your face during recording</li>
              <li>• The system will extract ~20 keyframes automatically</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
