
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const ConciergeDoctorCard = () => {
  const navigate = useNavigate();
  
  return (
    <Card className="flex flex-col h-full shadow-lg hover:shadow-xl transition-shadow bg-gradient-to-br from-white to-blue-50">
      <CardHeader>
        <Badge className="mb-2 self-start">For Doctors</Badge>
        <CardTitle>Concierge Doctor</CardTitle>
        <CardDescription>Comprehensive program for concierge physicians</CardDescription>
        
        <div className="mt-4">
          <div className="text-3xl font-bold">
            $80
            <span className="text-sm font-normal text-muted-foreground ml-1">
              /patient/month
            </span>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="flex-grow">
        <ul className="space-y-2">
          <li className="flex items-start">
            <Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />
            <span>Choose between 5-100 patients</span>
          </li>
          <li className="flex items-start">
            <Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />
            <span>12 lab services per patient annually</span>
          </li>
          <li className="flex items-start">
            <Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />
            <span>Patient management dashboard</span>
          </li>
          <li className="flex items-start">
            <Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />
            <span>Quarterly or annual billing options</span>
          </li>
          <li className="flex items-start">
            <Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />
            <span>No patient-facing charges</span>
          </li>
        </ul>
      </CardContent>
      
      <CardFooter>
        <Button 
          className="w-full" 
          onClick={() => navigate('/concierge-doctor-signup')}
        >
          Enroll Now
        </Button>
      </CardFooter>
    </Card>
  );
};
