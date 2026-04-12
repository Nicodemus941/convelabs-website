
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  BookOpen, Award, Play, FileText, AlertTriangle, Search, 
  ChevronRight, Clock, Calendar 
} from 'lucide-react';

interface ResourceItem {
  id: string;
  title: string;
  type: 'video' | 'document' | 'guide';
  category: string;
  timeToComplete: string;
  viewed: boolean;
}

interface CertificationItem {
  id: string;
  name: string;
  status: 'active' | 'expiring-soon' | 'expired';
  expirationDate: string;
  daysRemaining?: number;
}

export const TrainingResourceCenter = () => {
  const [searchQuery, setSearchQuery] = useState('');
  
  const resources: ResourceItem[] = [
    { id: 'res-1', title: 'Proper Venipuncture Technique', type: 'video', category: 'Clinical', timeToComplete: '15 min', viewed: true },
    { id: 'res-2', title: 'Difficult Draw Scenarios', type: 'document', category: 'Clinical', timeToComplete: '10 min', viewed: false },
    { id: 'res-3', title: 'Pediatric Blood Collection', type: 'video', category: 'Clinical', timeToComplete: '20 min', viewed: false },
    { id: 'res-4', title: 'Infection Control Guidelines', type: 'guide', category: 'Safety', timeToComplete: '5 min', viewed: true },
    { id: 'res-5', title: 'Patient Communication Best Practices', type: 'document', category: 'Patient Care', timeToComplete: '8 min', viewed: false },
    { id: 'res-6', title: 'Documentation Requirements', type: 'guide', category: 'Compliance', timeToComplete: '12 min', viewed: true },
  ];
  
  const certifications: CertificationItem[] = [
    { id: 'cert-1', name: 'Phlebotomy Technician Certification', status: 'active', expirationDate: '2025-12-15', daysRemaining: 428 },
    { id: 'cert-2', name: 'CPR & First Aid', status: 'expiring-soon', expirationDate: '2025-07-10', daysRemaining: 36 },
    { id: 'cert-3', name: 'HIPAA Compliance', status: 'active', expirationDate: '2026-02-28', daysRemaining: 286 },
    { id: 'cert-4', name: 'Bloodborne Pathogens', status: 'active', expirationDate: '2025-09-01', daysRemaining: 112 },
  ];
  
  const performanceMetrics = {
    completionRate: 94,
    patientSatisfaction: 4.8,
    onTimeArrival: 97,
    documentationAccuracy: 98,
  };
  
  const getResourceIcon = (type: string) => {
    switch (type) {
      case 'video':
        return <Play className="h-4 w-4" />;
      case 'document':
        return <FileText className="h-4 w-4" />;
      case 'guide':
        return <BookOpen className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };
  
  const getCertificationBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">Active</span>;
      case 'expiring-soon':
        return <span className="px-2 py-1 rounded-full text-xs bg-amber-100 text-amber-800">Expiring Soon</span>;
      case 'expired':
        return <span className="px-2 py-1 rounded-full text-xs bg-red-100 text-red-800">Expired</span>;
      default:
        return null;
    }
  };
  
  const filteredResources = resources.filter(resource =>
    resource.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    resource.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold flex items-center">
          <BookOpen className="mr-2 h-5 w-5" /> Training & Resources
        </CardTitle>
        <CardDescription>Access reference materials and track certifications</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="resources">
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="resources">Reference Materials</TabsTrigger>
            <TabsTrigger value="certifications">Certifications</TabsTrigger>
            <TabsTrigger value="performance">Your Performance</TabsTrigger>
          </TabsList>
          
          <TabsContent value="resources">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search resources..."
                className="pl-10 pr-4 py-2 w-full border rounded-md text-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            <ScrollArea className="h-[320px] pr-4">
              {filteredResources.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No resources found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredResources.map((resource) => (
                    <div
                      key={resource.id}
                      className="border rounded-md p-3 transition-colors hover:bg-slate-50"
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-start space-x-3">
                          <div className={`p-2 rounded-md ${
                            resource.type === 'video' ? 'bg-blue-100' :
                            resource.type === 'document' ? 'bg-purple-100' :
                            'bg-emerald-100'
                          }`}>
                            {getResourceIcon(resource.type)}
                          </div>
                          <div>
                            <h4 className="font-medium">{resource.title}</h4>
                            <div className="flex items-center mt-1">
                              <span className="text-xs bg-slate-100 px-2 py-0.5 rounded">
                                {resource.category}
                              </span>
                              <span className="text-xs text-muted-foreground ml-2 flex items-center">
                                <Clock className="h-3 w-3 mr-1" /> {resource.timeToComplete}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        <div>
                          <Button variant="ghost" size="sm" className="h-8 gap-1">
                            {resource.viewed ? 'Review' : 'View'} <ChevronRight className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
          
          <TabsContent value="certifications">
            <ScrollArea className="h-[320px] pr-4">
              <div className="space-y-4">
                {certifications.map((cert) => (
                  <div key={cert.id} className="border rounded-md p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center">
                          <Award className="h-5 w-5 mr-2 text-conve-red" />
                          <h4 className="font-medium">{cert.name}</h4>
                        </div>
                        <div className="flex items-center mt-2">
                          {getCertificationBadge(cert.status)}
                          <span className="text-sm text-muted-foreground ml-2 flex items-center">
                            <Calendar className="h-3 w-3 mr-1" /> 
                            Expires: {new Date(cert.expirationDate).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      
                      <div className="text-right">
                        {cert.daysRemaining !== undefined && (
                          <span className={`text-sm ${
                            cert.status === 'expiring-soon' ? 'text-amber-600 font-medium' : 'text-muted-foreground'
                          }`}>
                            {cert.daysRemaining} days remaining
                          </span>
                        )}
                        <Button variant="outline" size="sm" className="mt-2">
                          {cert.status === 'expired' ? 'Renew Now' : 'View Details'}
                        </Button>
                      </div>
                    </div>
                    
                    {cert.status === 'expiring-soon' && (
                      <div className="mt-2 p-2 bg-amber-50 border border-amber-100 rounded flex items-center">
                        <AlertTriangle className="h-4 w-4 text-amber-500 mr-2" />
                        <span className="text-sm text-amber-800">
                          This certification is expiring soon. Please schedule renewal.
                        </span>
                      </div>
                    )}
                  </div>
                ))}
                
                <Button className="w-full">View All Certifications & Requirements</Button>
              </div>
            </ScrollArea>
          </TabsContent>
          
          <TabsContent value="performance">
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="border rounded-md p-4">
                  <h4 className="text-sm text-muted-foreground mb-1">Appointment Completion Rate</h4>
                  <div className="text-2xl font-bold">{performanceMetrics.completionRate}%</div>
                </div>
                <div className="border rounded-md p-4">
                  <h4 className="text-sm text-muted-foreground mb-1">Patient Satisfaction</h4>
                  <div className="text-2xl font-bold">{performanceMetrics.patientSatisfaction}/5</div>
                </div>
                <div className="border rounded-md p-4">
                  <h4 className="text-sm text-muted-foreground mb-1">On-Time Arrival</h4>
                  <div className="text-2xl font-bold">{performanceMetrics.onTimeArrival}%</div>
                </div>
                <div className="border rounded-md p-4">
                  <h4 className="text-sm text-muted-foreground mb-1">Documentation Accuracy</h4>
                  <div className="text-2xl font-bold">{performanceMetrics.documentationAccuracy}%</div>
                </div>
              </div>
              
              <div className="border rounded-md p-4">
                <h4 className="font-medium mb-2">Recent Feedback</h4>
                <div className="space-y-2">
                  <div className="p-3 bg-green-50 rounded-md text-sm">
                    "Very professional and gentle technique. Made the patient feel at ease."
                  </div>
                  <div className="p-3 bg-green-50 rounded-md text-sm">
                    "Arrived on time and was very thorough in explaining the procedure."
                  </div>
                </div>
              </div>
              
              <Button className="w-full">View Full Performance History</Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
