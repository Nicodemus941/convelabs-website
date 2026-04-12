
import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { FileText, Download } from "lucide-react";

interface Invoice {
  id: string;
  date: string;
  amount: string;
  period: string;
  status: "paid" | "pending" | "overdue";
}

const InvoiceHistory = () => {
  // Mock invoice data
  const invoices: Invoice[] = [
    {
      id: "INV-2025-001",
      date: "May 1, 2025",
      amount: "$299.99",
      period: "May 2025",
      status: "paid"
    },
    {
      id: "INV-2025-002",
      date: "April 1, 2025",
      amount: "$299.99",
      period: "April 2025",
      status: "paid"
    },
    {
      id: "INV-2025-003",
      date: "March 1, 2025",
      amount: "$299.99",
      period: "March 2025",
      status: "paid"
    },
  ];

  const downloadInvoice = (invoiceId: string) => {
    // In a real app, this would trigger a download of the invoice PDF
    console.log(`Downloading invoice ${invoiceId}`);
  };

  return (
    <div>
      <h3 className="text-lg font-medium mb-4">Invoice History</h3>
      
      <Card>
        <CardContent className="p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Billing Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium">{invoice.id}</TableCell>
                  <TableCell>{invoice.date}</TableCell>
                  <TableCell>{invoice.amount}</TableCell>
                  <TableCell>{invoice.period}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      invoice.status === 'paid' ? 'bg-green-100 text-green-800' :
                      invoice.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => downloadInvoice(invoice.id)}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Download
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default InvoiceHistory;
