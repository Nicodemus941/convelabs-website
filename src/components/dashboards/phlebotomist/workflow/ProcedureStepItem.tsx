
import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Camera, Mic } from 'lucide-react';
import { toast } from '@/components/ui/sonner';

export interface ProcedureStep {
  id: string;
  title: string;
  description: string;
  hasPhoto: boolean;
  hasVoiceNote: boolean;
  completed: boolean;
  timeElapsed?: number; // in seconds
}

interface ProcedureStepItemProps {
  step: ProcedureStep;
  index: number;
  recordingVoice: boolean;
  toggleProcedureStep: (id: string) => void;
  addPhotoToStep: (id: string) => void;
  addVoiceNoteToStep: (id: string) => void;
}

export const ProcedureStepItem: React.FC<ProcedureStepItemProps> = ({
  step,
  index,
  recordingVoice,
  toggleProcedureStep,
  addPhotoToStep,
  addVoiceNoteToStep,
}) => {
  return (
    <div 
      className={`border rounded-md p-3 ${step.completed ? 'bg-green-50 border-green-200' : ''}`}
    >
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center">
          <span className="flex items-center justify-center w-6 h-6 bg-slate-100 rounded-full text-sm font-medium mr-3">
            {index + 1}
          </span>
          <h4 className="font-medium">{step.title}</h4>
        </div>
        <div className="flex items-center space-x-2">
          <Button 
            variant="outline" 
            size="icon" 
            onClick={() => addPhotoToStep(step.id)}
            className={step.hasPhoto ? 'bg-blue-50 border-blue-200 text-blue-600' : ''}
          >
            <Camera className="h-4 w-4" />
          </Button>
          <Button 
            variant="outline" 
            size="icon" 
            onClick={() => addVoiceNoteToStep(step.id)}
            className={(step.hasVoiceNote || (recordingVoice && step.id === 'step-3')) ? 'bg-red-50 border-red-200 text-red-600' : ''}
          >
            <Mic className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      <p className="text-sm text-muted-foreground mb-3">{step.description}</p>
      
      <div className="flex items-center mt-2 justify-between">
        <div className="flex space-x-2">
          {step.hasPhoto && (
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              <Camera className="h-3 w-3 mr-1" /> Photo
            </Badge>
          )}
          {step.hasVoiceNote && (
            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
              <Mic className="h-3 w-3 mr-1" /> Voice Note
            </Badge>
          )}
        </div>
        <Button 
          variant={step.completed ? "outline" : "default"}
          size="sm"
          className={step.completed ? "bg-green-50 border-green-200 text-green-700 hover:bg-green-100" : ""}
          onClick={() => toggleProcedureStep(step.id)}
        >
          {step.completed ? (
            <>
              <Check className="h-3 w-3 mr-1" /> Completed
            </>
          ) : "Mark Complete"}
        </Button>
      </div>
    </div>
  );
};
