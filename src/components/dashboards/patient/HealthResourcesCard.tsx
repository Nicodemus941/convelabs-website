
import React from "react";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const HealthResourcesCard = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Health Resources</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="border rounded-md p-4 hover:bg-slate-50">
            <h4 className="font-medium">Understanding Your Lab Results</h4>
            <p className="text-sm text-muted-foreground mt-1">
              A guide to interpreting your lab test results and what the numbers mean.
            </p>
            <Button variant="link" className="px-0" asChild>
              <a href="/blog/understanding-labs">Read More</a>
            </Button>
          </div>
          
          <div className="border rounded-md p-4 hover:bg-slate-50">
            <h4 className="font-medium">Preparing for Your Blood Draw</h4>
            <p className="text-sm text-muted-foreground mt-1">
              Tips and guidelines to prepare for your upcoming laboratory services.
            </p>
            <Button variant="link" className="px-0" asChild>
              <a href="/blog/blood-draw-prep">Read More</a>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default HealthResourcesCard;
