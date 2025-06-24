
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const HealingPreviews = () => {
  const previews = [
    {
      title: "2 weeks post-op",
      image: "/lovable-uploads/fb685f08-83db-4318-8cf3-ac883ce113d3.png"
    },
    {
      title: "1 month post-op", 
      image: "/lovable-uploads/fb685f08-83db-4318-8cf3-ac883ce113d3.png"
    }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Healing Previews</CardTitle>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
};
