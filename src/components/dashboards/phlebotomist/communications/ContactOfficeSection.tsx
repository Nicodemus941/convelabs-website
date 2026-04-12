
import React from "react";
import { Button } from "@/components/ui/button";
import { MessageSquare, Phone } from "lucide-react";
import { toast } from "@/components/ui/sonner";

const ContactOfficeSection = () => {
  const handleSendMessage = () => {
    toast.success("Message sent to office manager");
  };

  return (
    <div className="border rounded-lg p-4">
      <h3 className="font-medium text-lg mb-4">Contact Office</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Button 
          variant="outline" 
          className="h-auto py-4 flex flex-col items-center gap-2"
          onClick={handleSendMessage}
        >
          <MessageSquare className="h-8 w-8 text-conve-red" />
          <span className="font-medium">Message Office</span>
          <span className="text-xs text-muted-foreground">For non-urgent matters</span>
        </Button>
        
        <Button 
          variant="outline" 
          className="h-auto py-4 flex flex-col items-center gap-2"
          onClick={() => toast.success("Calling office manager...")}
        >
          <Phone className="h-8 w-8 text-conve-red" />
          <span className="font-medium">Call Office</span>
          <span className="text-xs text-muted-foreground">For urgent matters</span>
        </Button>
      </div>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Quick Message</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Button variant="outline" className="justify-start text-left" onClick={handleSendMessage}>
              Running late for appointment
            </Button>
            <Button variant="outline" className="justify-start text-left" onClick={handleSendMessage}>
              Need help with directions
            </Button>
            <Button variant="outline" className="justify-start text-left" onClick={handleSendMessage}>
              Patient not at location
            </Button>
            <Button variant="outline" className="justify-start text-left" onClick={handleSendMessage}>
              Supply shortage alert
            </Button>
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Custom Message</label>
          <textarea 
            className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-conve-red" 
            rows={3}
            placeholder="Type your message here..."
          ></textarea>
          <Button className="mt-2" onClick={handleSendMessage}>Send Message</Button>
        </div>
      </div>
    </div>
  );
};

export default ContactOfficeSection;
