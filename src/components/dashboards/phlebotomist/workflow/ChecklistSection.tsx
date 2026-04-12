
import React from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Check } from 'lucide-react';

interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  required: boolean;
}

interface ChecklistSectionProps {
  checklistItems: ChecklistItem[];
  toggleChecklistItem: (id: string) => void;
  checklistProgress: number;
  onComplete: () => void;
}

export const ChecklistSection: React.FC<ChecklistSectionProps> = ({
  checklistItems,
  toggleChecklistItem,
  checklistProgress,
  onComplete,
}) => {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium">Checklist Progress</h3>
        <span className="text-sm text-muted-foreground">
          {checklistItems.filter(item => item.completed).length}/{checklistItems.length} completed
        </span>
      </div>
      
      <Progress value={checklistProgress} className="mb-4" />
      
      <div className="space-y-3">
        {checklistItems.map(item => (
          <div 
            key={item.id} 
            className={`flex items-center justify-between p-3 border rounded-md cursor-pointer hover:bg-slate-50 transition-colors ${item.completed ? 'bg-green-50 border-green-200' : ''}`}
            onClick={() => toggleChecklistItem(item.id)}
          >
            <div className="flex items-center">
              <div className={`flex items-center justify-center w-5 h-5 border rounded mr-3 ${item.completed ? 'bg-green-500 border-green-500' : ''}`}>
                {item.completed && <Check className="h-3 w-3 text-white" />}
              </div>
              <span className={`${item.completed ? 'line-through text-muted-foreground' : ''} ${item.required ? 'font-medium' : ''}`}>
                {item.text}
                {item.required && <span className="text-red-500 ml-1">*</span>}
              </span>
            </div>
          </div>
        ))}
      </div>
      
      {checklistProgress === 100 && (
        <Button 
          className="w-full mt-4" 
          onClick={onComplete}
        >
          Start Procedure Documentation
        </Button>
      )}
    </div>
  );
};
