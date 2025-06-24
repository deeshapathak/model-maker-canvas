import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
export const PatientInfo = () => {
  return <Card>
      <CardHeader>
        <CardTitle className="text-lg">Patient Information</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-600 mb-1">Name</p>
            <p className="font-medium">Elon Musk</p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">Age</p>
            <p className="font-medium">52 years</p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">Procedure</p>
            <p className="font-medium">Rhinoplasty</p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">Status</p>
            <p className="font-medium text-blue-600">3D Analysis Phase</p>
          </div>
        </div>
      </CardContent>
    </Card>;
};