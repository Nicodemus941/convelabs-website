
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';

const MarketingTools: React.FC = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <FileText className="mr-2 h-5 w-5" />
          Marketing Tools
        </CardTitle>
        <CardDescription>
          Access marketing resources and campaigns
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button variant="outline" className="h-20 flex flex-col justify-center">
              <span>Marketing Materials</span>
              <span className="text-xs text-muted-foreground">Flyers, brochures & more</span>
            </Button>
            <Button variant="outline" className="h-20 flex flex-col justify-center">
              <span>Email Templates</span>
              <span className="text-xs text-muted-foreground">Ready-to-use campaigns</span>
            </Button>
            <Button variant="outline" className="h-20 flex flex-col justify-center">
              <span>Social Media</span>
              <span className="text-xs text-muted-foreground">Posts & graphics</span>
            </Button>
            <Button variant="outline" className="h-20 flex flex-col justify-center">
              <span>Local SEO Guide</span>
              <span className="text-xs text-muted-foreground">Boost your presence</span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default MarketingTools;
