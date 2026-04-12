
import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import NotificationsPanel from "./NotificationsPanel";
import UsageTracker from "./UsageTracker";
import InvoiceHistory from "./InvoiceHistory";

const BillingTab = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing & Credits</CardTitle>
        <CardDescription>Manage your billing information and lab credits</CardDescription>
      </CardHeader>
      <CardContent>
        <NotificationsPanel />
        <UsageTracker />
        <InvoiceHistory />
      </CardContent>
    </Card>
  );
};

export default BillingTab;
