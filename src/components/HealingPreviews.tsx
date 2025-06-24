import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Expand, Minimize } from "lucide-react";

interface HealingPreviewsProps {
  isModelSaved?: boolean;
}

export const HealingPreviews = ({ isModelSaved = false }: HealingPreviewsProps) => {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const previews = [
    {
      title: "2 weeks post-op",
      description: "Significant bruising and swelling",
      bruisingLevel: "severe",
      image: "/lovable-uploads/elon-2weeks-bruising.png",
      bruisingColor: "bg-purple-600",
      swellingColor: "bg-red-400",
      features: [
        "Dark purple bruising around eyes and nose",
        "Significant swelling and redness",
        "Tender to touch",
        "May have slight bleeding"
      ]
    },
    {
      title: "1 month post-op",
      description: "Reduced bruising, healing well",
      bruisingLevel: "moderate", 
      image: "/lovable-uploads/elon-1month-bruising.png",
      bruisingColor: "bg-yellow-400",
      swellingColor: "bg-pink-300",
      features: [
        "Yellow/green bruising fading",
        "Reduced swelling",
        "Less tenderness",
        "Scar tissue forming"
      ]
    }
  ];

  const toggleExpanded = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Healing Previews</CardTitle>
        {!isModelSaved && (
          <p className="text-sm text-gray-500">Save your model to see healing progression</p>
        )}
      </CardHeader>
      <CardContent>
        {!isModelSaved ? (
          // Original simple design before save
          <div className="grid grid-cols-2 gap-3">
            {previews.map((preview, index) => (
              <div key={index} className="text-center">
                <div className="bg-gray-100 rounded-lg h-24 mb-2 flex items-center justify-center">
                  <div className="w-16 h-16 bg-gray-300 rounded-full"></div>
                </div>
                <p className="text-xs text-gray-600">{preview.title}</p>
              </div>
            ))}
          </div>
        ) : (
          // Detailed bruising previews after save
          <div className="space-y-4">
            {previews.map((preview, index) => (
              <div key={index} className="border rounded-lg overflow-hidden">
                {/* Preview Header */}
                <div className="p-3 bg-gray-50 flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-sm">{preview.title}</h4>
                    <p className="text-xs text-gray-600">{preview.description}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleExpanded(index)}
                  >
                    {expandedIndex === index ? (
                      <Minimize className="h-4 w-4" />
                    ) : (
                      <Expand className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {/* Preview Content */}
                <div className={`transition-all duration-300 ${
                  expandedIndex === index ? 'max-h-[600px] min-h-[350px]' : 'max-h-32'
                } overflow-hidden`}>
                  <div className="p-4">
                    {/* Show provided image for both previews after save */}
                    <div className="relative mb-4">
                      <img
                        src={preview.image}
                        alt={preview.title}
                        className="rounded-lg w-full h-48 object-contain bg-gray-100"
                      />
                    </div>

                    {/* Healing Features */}
                    {expandedIndex === index && (
                      <div className="space-y-2">
                        <h5 className="font-medium text-sm">Expected Symptoms:</h5>
                        <ul className="text-xs text-gray-600 space-y-1">
                          {preview.features.map((feature, featureIndex) => (
                            <li key={featureIndex} className="flex items-center">
                              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full mr-2"></span>
                              {feature}
                            </li>
                          ))}
                        </ul>
                        {/* Recovery tips */}
                        <div className="mt-3 p-2 bg-blue-50 rounded text-xs">
                          <p className="font-medium text-blue-800 mb-1">Recovery Tips:</p>
                          <p className="text-blue-700">
                            {preview.bruisingLevel === 'severe' 
                              ? 'Apply cold compresses, keep head elevated, avoid strenuous activity'
                              : 'Continue gentle care, protect from sun, follow surgeon\'s instructions'
                            }
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
