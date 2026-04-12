
import React from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { UseFormReturn } from 'react-hook-form';
import { EmailTemplate } from '@/types/marketingTypes';

interface EmailPreviewProps {
  form: UseFormReturn<any>;
  previewLoading: boolean;
  setPreviewLoading: (loading: boolean) => void;
  showPreview: boolean;
  setShowPreview: (show: boolean) => void;
  selectedTemplate: EmailTemplate | null;
  previewHtml: string;
  onLoadPreview: () => Promise<void>;
}

const EmailPreview: React.FC<EmailPreviewProps> = ({ 
  form, 
  previewLoading, 
  showPreview, 
  setShowPreview, 
  selectedTemplate,
  previewHtml,
  onLoadPreview
}) => {
  return (
    <Sheet open={showPreview} onOpenChange={setShowPreview}>
      <SheetTrigger asChild>
        <Button 
          type="button" 
          variant="outline" 
          onClick={onLoadPreview} 
          disabled={previewLoading || !selectedTemplate}
        >
          {previewLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Preview Email
        </Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Email Preview</SheetTitle>
          <SheetDescription>
            This is how your email will appear to recipients
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="h-[80vh] mt-6 pr-4">
          <div className="border rounded-md p-4 bg-white">
            <div className="text-sm text-muted-foreground mb-2">
              <span className="font-semibold">Subject:</span> {form.watch('subject')}
            </div>
            <div className="text-sm text-muted-foreground mb-2">
              <span className="font-semibold">From:</span> {form.watch('senderName')} &lt;{form.watch('senderEmail')}&gt;
            </div>
            <div className="text-sm text-muted-foreground mb-4">
              <span className="font-semibold">Reply-To:</span> {form.watch('replyTo')}
            </div>
            <div className="border-t pt-4">
              <h3 className="font-bold mb-2">Email Content</h3>
              {previewLoading ? (
                <span className="flex items-center"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading preview...</span>
              ) : (
                <>
                  <p className="mb-4 text-sm text-muted-foreground">
                    <span className="font-semibold">Custom Message:</span><br />
                    {form.watch('customMessage') || "No custom message"}
                  </p>
                  {previewHtml && (
                    <div className="border-t pt-4 mt-4">
                      <h4 className="font-semibold mb-2">HTML Preview:</h4>
                      <div 
                        className="p-3 border rounded bg-gray-50"
                        dangerouslySetInnerHTML={{ __html: previewHtml }}
                      />
                    </div>
                  )}
                </>
              )}
              <Badge variant="outline" className="mt-2">Preview Mode</Badge>
            </div>
          </div>
        </ScrollArea>
        <SheetFooter>
          <SheetClose asChild>
            <Button type="button">Close Preview</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default EmailPreview;
