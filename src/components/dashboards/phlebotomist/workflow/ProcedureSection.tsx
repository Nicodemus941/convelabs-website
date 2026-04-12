
import React from 'react';
import { Progress } from '@/components/ui/progress';
import { ProcedureStepItem, ProcedureStep } from './ProcedureStepItem';

interface ProcedureSectionProps {
  procedureSteps: ProcedureStep[];
  procedureProgress: number;
  recordingVoice: boolean;
  toggleProcedureStep: (id: string) => void;
  addPhotoToStep: (id: string) => void;
  addVoiceNoteToStep: (id: string) => void;
}

export const ProcedureSection: React.FC<ProcedureSectionProps> = ({
  procedureSteps,
  procedureProgress,
  recordingVoice,
  toggleProcedureStep,
  addPhotoToStep,
  addVoiceNoteToStep,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium">Procedure Progress</h3>
        <span className="text-sm text-muted-foreground">
          {procedureSteps.filter(step => step.completed).length}/{procedureSteps.length} completed
        </span>
      </div>
      
      <Progress value={procedureProgress} className="mb-4" />
      
      {procedureSteps.map((step, index) => (
        <ProcedureStepItem
          key={step.id}
          step={step}
          index={index}
          recordingVoice={recordingVoice}
          toggleProcedureStep={toggleProcedureStep}
          addPhotoToStep={addPhotoToStep}
          addVoiceNoteToStep={addVoiceNoteToStep}
        />
      ))}
    </div>
  );
};
