
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { X, Users } from 'lucide-react';

interface DemographicsSurveyProps {
  userId: string;
  onComplete?: () => void;
  onSkip?: () => void;
}

const DemographicsSurvey: React.FC<DemographicsSurveyProps> = ({ 
  userId, 
  onComplete, 
  onSkip 
}) => {
  const [formData, setFormData] = useState({
    age_range: '',
    gender: '',
    income_range: '',
    occupation: '',
    interests: [] as string[]
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const ageRanges = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
  const genders = ['Male', 'Female', 'Non-binary', 'Prefer not to say'];
  const incomeRanges = ['Under $25k', '$25k-$50k', '$50k-$75k', '$75k-$100k', '$100k-$150k', '$150k+'];
  const interestOptions = [
    'Health & Wellness', 'Fitness', 'Nutrition', 'Preventive Care', 
    'Technology', 'Travel', 'Business', 'Family', 'Sports'
  ];

  const handleInterestChange = (interest: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      interests: checked 
        ? [...prev.interests, interest]
        : prev.interests.filter(i => i !== interest)
    }));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('user_demographics')
        .insert([{
          user_id: userId,
          ...formData
        }]);

      if (error) throw error;

      toast({
        title: "Thank you!",
        description: "Your preferences have been saved and help us improve our services.",
      });

      onComplete?.();
    } catch (error) {
      console.error('Error saving demographics:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save your preferences. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-blue-500" />
          <CardTitle className="text-lg">Help Us Serve You Better</CardTitle>
        </div>
        {onSkip && (
          <Button variant="ghost" size="sm" onClick={onSkip}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>
      
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-600 mb-4">
          Optional: Share some basic information to help us provide more personalized health services.
        </p>

        {/* Age Range */}
        <div className="space-y-2">
          <Label htmlFor="age">Age Range</Label>
          <Select value={formData.age_range} onValueChange={(value) => 
            setFormData(prev => ({ ...prev, age_range: value }))
          }>
            <SelectTrigger>
              <SelectValue placeholder="Select your age range" />
            </SelectTrigger>
            <SelectContent>
              {ageRanges.map(range => (
                <SelectItem key={range} value={range}>{range}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Gender */}
        <div className="space-y-2">
          <Label htmlFor="gender">Gender</Label>
          <Select value={formData.gender} onValueChange={(value) => 
            setFormData(prev => ({ ...prev, gender: value }))
          }>
            <SelectTrigger>
              <SelectValue placeholder="Select gender" />
            </SelectTrigger>
            <SelectContent>
              {genders.map(gender => (
                <SelectItem key={gender} value={gender}>{gender}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Income Range */}
        <div className="space-y-2">
          <Label htmlFor="income">Household Income</Label>
          <Select value={formData.income_range} onValueChange={(value) => 
            setFormData(prev => ({ ...prev, income_range: value }))
          }>
            <SelectTrigger>
              <SelectValue placeholder="Select income range" />
            </SelectTrigger>
            <SelectContent>
              {incomeRanges.map(range => (
                <SelectItem key={range} value={range}>{range}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Interests */}
        <div className="space-y-2">
          <Label>Interests (select all that apply)</Label>
          <div className="grid grid-cols-2 gap-2">
            {interestOptions.map(interest => (
              <div key={interest} className="flex items-center space-x-2">
                <Checkbox 
                  id={interest}
                  checked={formData.interests.includes(interest)}
                  onCheckedChange={(checked) => 
                    handleInterestChange(interest, checked as boolean)
                  }
                />
                <Label 
                  htmlFor={interest} 
                  className="text-sm font-normal"
                >
                  {interest}
                </Label>
              </div>
            ))}
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-2 pt-4">
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting}
            className="flex-1"
          >
            {isSubmitting ? 'Saving...' : 'Save Preferences'}
          </Button>
          {onSkip && (
            <Button variant="outline" onClick={onSkip}>
              Skip
            </Button>
          )}
        </div>

        <p className="text-xs text-gray-500 text-center">
          Your information is kept private and used only to improve our services.
        </p>
      </CardContent>
    </Card>
  );
};

export default DemographicsSurvey;
