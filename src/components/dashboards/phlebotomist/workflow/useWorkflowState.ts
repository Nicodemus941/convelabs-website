
import { useState, useEffect } from 'react';
import { toast } from '@/components/ui/sonner';
import { ProcedureStep } from './ProcedureStepItem';

interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  required: boolean;
}

export const useWorkflowState = (initialAppointmentId: string | null = null) => {
  const [activeAppointmentId, setActiveAppointmentId] = useState<string | null>(initialAppointmentId);
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [currentTab, setCurrentTab] = useState("checklist");
  
  // Checklist state
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([
    { id: 'checklist-1', text: 'Verify patient identity', completed: false, required: true },
    { id: 'checklist-2', text: 'Check requisition form', completed: false, required: true },
    { id: 'checklist-3', text: 'Prepare collection tubes', completed: false, required: true },
    { id: 'checklist-4', text: 'Verify patient fasting status', completed: false, required: true },
    { id: 'checklist-5', text: 'Check for allergies', completed: false, required: true },
    { id: 'checklist-6', text: 'Sanitize hands', completed: false, required: true },
    { id: 'checklist-7', text: 'Prepare labeling', completed: false, required: true },
  ]);
  
  // Procedure steps state
  const [procedureSteps, setProcedureSteps] = useState<ProcedureStep[]>([
    { id: 'step-1', title: 'Patient identification', description: 'Verify patient identity using two identifiers', hasPhoto: false, hasVoiceNote: false, completed: false },
    { id: 'step-2', title: 'Venipuncture site selection', description: 'Assess and select appropriate venipuncture site', hasPhoto: false, hasVoiceNote: false, completed: false },
    { id: 'step-3', title: 'Collection procedure', description: 'Perform venipuncture according to protocol', hasPhoto: false, hasVoiceNote: false, completed: false, timeElapsed: 0 },
    { id: 'step-4', title: 'Sample labeling', description: 'Label all specimens with required information', hasPhoto: false, hasVoiceNote: false, completed: false },
    { id: 'step-5', title: 'Biohazard disposal', description: 'Dispose of biohazard materials appropriately', hasPhoto: false, hasVoiceNote: false, completed: false },
  ]);
  
  // Timer state for service time tracking
  const [timer, setTimer] = useState({
    running: false,
    startTime: 0,
    elapsed: 0,
  });
  
  const toggleChecklistItem = (id: string) => {
    setChecklistItems(prev => prev.map(item => 
      item.id === id ? { ...item, completed: !item.completed } : item
    ));
  };
  
  const toggleProcedureStep = (id: string) => {
    setProcedureSteps(prev => prev.map(step => 
      step.id === id ? { ...step, completed: !step.completed } : step
    ));
  };
  
  const addPhotoToStep = (id: string) => {
    // In a real app, this would open the camera
    toast.info('Camera opened', { description: 'Photo would be captured here' });
    
    setProcedureSteps(prev => prev.map(step => 
      step.id === id ? { ...step, hasPhoto: true } : step
    ));
  };
  
  const addVoiceNoteToStep = (id: string) => {
    setRecordingVoice(!recordingVoice);
    
    if (recordingVoice) {
      // Simulate ending a voice recording
      setProcedureSteps(prev => prev.map(step => 
        step.id === id ? { ...step, hasVoiceNote: true } : step
      ));
      
      toast.info('Voice note saved', { description: 'Voice note has been added to this step' });
    } else {
      // Simulate starting a voice recording
      toast.info('Recording voice note', { description: 'Speak now to record a note' });
    }
  };
  
  const startTimer = () => {
    if (!timer.running) {
      setTimer({
        running: true,
        startTime: Date.now() - timer.elapsed,
        elapsed: timer.elapsed,
      });
      
      toast.info('Timer started', { description: 'Tracking time for this appointment' });
    }
  };
  
  const stopTimer = () => {
    if (timer.running) {
      const elapsed = Date.now() - timer.startTime;
      setTimer({
        running: false,
        startTime: 0,
        elapsed: elapsed,
      });
      
      toast.info('Timer stopped', { description: `Total time: ${formatTime(elapsed)}` });
    }
  };
  
  const formatTime = (milliseconds: number) => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
  };
  
  // Update the timer every second
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (timer.running) {
      interval = setInterval(() => {
        const elapsed = Date.now() - timer.startTime;
        setTimer(prev => ({ ...prev, elapsed }));
      }, 1000);
    }
    
    return () => clearInterval(interval);
  }, [timer.running, timer.startTime]);
  
  const checklistProgress = checklistItems.length > 0
    ? Math.round((checklistItems.filter(item => item.completed).length / checklistItems.length) * 100)
    : 0;
    
  const procedureProgress = procedureSteps.length > 0
    ? Math.round((procedureSteps.filter(step => step.completed).length / procedureSteps.length) * 100)
    : 0;

  return {
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
  };
};
