
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const AIRecommendations = () => {
  const recommendations = [
    "Nasal bridge refinement - reduce prominence",
    "Jawline contouring - enhance angular definition", 
    "Cheekbone enhancement - increase projection",
    "Chin augmentation - improve facial balance"
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">AI Surgical Recommendations</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {recommendations.map((recommendation, index) => (
            <li key={index} className="flex items-start gap-2 text-sm">
              <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
              <span className="leading-relaxed">{recommendation}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 pt-3 border-t">
          <p className="text-xs text-gray-500">
            Recommendations based on facial analysis and aesthetic principles
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
