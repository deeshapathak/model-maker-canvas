
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const AIRecommendations = () => {
  const recommendations = [
    "Dorsal hump reduction",
    "Alar base widening", 
    "Nasal tip refinement"
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">AI Recommendations</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {recommendations.map((recommendation, index) => (
            <li key={index} className="flex items-center gap-2 text-sm">
              <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
              {recommendation}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};
