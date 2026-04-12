
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ListChecks, CheckSquare } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChecklistSection } from './workflow/ChecklistSection';
import { ProcedureSection } from './workflow/ProcedureSection';
import { AppointmentTimer } from './workflow/AppointmentTimer';
import { useWorkflowState } from './workflow/useWorkflowState';

export const WorkflowOptimization = () => {
  const {
    activeAppointmentId,
    recordingVoice,
    currentTab,
    checklistItems,
    procedureSteps,
    timer,
    checklistProgress,
    procedureProgress,
    setCurrentTab,
    toggleChecklistItem,
    toggleProcedureStep,
    addPhotoToStep,
    addVoiceNoteToStep,
    startTimer,
    stopTimer,
    formatTime
  } = useWorkflowState("app-123");

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-center mb-1">
          <CardTitle className="text-lg font-semibold">
            <ListChecks className="inline-block mr-2 h-5 w-5" /> 
            Workflow Optimization
          </CardTitle>
          
          {activeAppointmentId ? (
            <AppointmentTimer 
              timer={timer}
              startTimer={startTimer}
              stopTimer={stopTimer}
              formatTime={formatTime}
            />
          ) : (
            <div>No active appointment</div>
          )}
        </div>
        <CardDescription>
          Digital checklists and procedure documentation
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!activeAppointmentId ? (
          <div className="text-center py-8 px-4">
            <p className="text-muted-foreground">Start an appointment to use workflow tools</p>
          </div>
        ) : (
          <Tabs defaultValue="checklist" value={currentTab} onValueChange={setCurrentTab}>
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="checklist" className="flex items-center">
                <CheckSquare className="h-4 w-4 mr-2" /> Pre-Appointment Checklist
              </TabsTrigger>
              <TabsTrigger value="procedure" className="flex items-center">
                <ListChecks className="h-4 w-4 mr-2" /> Procedure Documentation
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="checklist" className="pt-2">
              <ChecklistSection 
                checklistItems={checklistItems}
                toggleChecklistItem={toggleChecklistItem}
                checklistProgress={checklistProgress}
                onComplete={() => setCurrentTab("procedure")}
              />
            </TabsContent>
            
            <TabsContent value="procedure" className="space-y-4">
              <ProcedureSection 
                procedureSteps={procedureSteps}
                procedureProgress={procedureProgress}
                recordingVoice={recordingVoice}
                toggleProcedureStep={toggleProcedureStep}
                addPhotoToStep={addPhotoToStep}
                addVoiceNoteToStep={addVoiceNoteToStep}
              />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
};
