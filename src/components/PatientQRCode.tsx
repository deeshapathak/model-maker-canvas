import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Copy, QrCode, Smartphone, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface PatientQRCodeProps {
  token: string;
  patientName?: string;
  scanId?: string;
}

export const PatientQRCode = ({ token, patientName, scanId }: PatientQRCodeProps) => {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  
  const scanUrl = `https://scan.rhinovate.ai/?token=${token}`;
  
  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(scanUrl);
      setCopied(true);
      toast({
        title: "URL Copied!",
        description: "The scan URL has been copied to your clipboard.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: "Copy Failed",
        description: "Please copy the URL manually.",
        variant: "destructive",
      });
    }
  };

  const handleCopyToken = async () => {
    try {
      await navigator.clipboard.writeText(token);
      toast({
        title: "Token Copied!",
        description: "The scan token has been copied to your clipboard.",
      });
    } catch (error) {
      toast({
        title: "Copy Failed",
        description: "Please copy the token manually.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <CardTitle className="flex items-center justify-center gap-2">
          <QrCode className="h-5 w-5" />
          Face Scan QR Code
        </CardTitle>
        <CardDescription>
          Scan this QR code with your iPhone to capture a 3D face model
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Patient Info */}
        {patientName && (
          <div className="text-center">
            <Badge variant="secondary" className="mb-2">
              Patient: {patientName}
            </Badge>
            {scanId && (
              <div className="text-sm text-gray-500">
                Scan ID: {scanId}
              </div>
            )}
          </div>
        )}

        {/* QR Code */}
        <div className="flex justify-center">
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <QRCodeSVG
              value={scanUrl}
              size={300}
              level="H"
              includeMargin={true}
              className="w-full h-auto"
            />
          </div>
        </div>

        {/* Token Display */}
        <div className="space-y-2">
          <div className="text-sm font-medium text-gray-700">Scan Token:</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-gray-100 px-3 py-2 rounded text-sm font-mono break-all">
              {token}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyToken}
              className="shrink-0"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* URL Display */}
        <div className="space-y-2">
          <div className="text-sm font-medium text-gray-700">Scan URL:</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-gray-100 px-3 py-2 rounded text-sm font-mono break-all">
              {scanUrl}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyUrl}
              className="shrink-0"
            >
              {copied ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="flex items-start gap-3">
            <Smartphone className="h-5 w-5 text-blue-600 mt-0.5" />
            <div className="text-sm text-blue-800">
              <div className="font-medium mb-1">Instructions:</div>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>Open Camera app on iPhone</li>
                <li>Point camera at this QR code</li>
                <li>Tap the notification that appears</li>
                <li>Follow the scanning instructions</li>
                <li>Wait for 3D model generation</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Status Badge */}
        <div className="text-center">
          <Badge variant="outline" className="text-green-600 border-green-600">
            Ready for Scanning
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
};
