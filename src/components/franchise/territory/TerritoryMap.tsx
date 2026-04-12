
import React, { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Territory } from "@/hooks/useFranchiseData";
import { MapPin } from "lucide-react";

interface TerritoryMapProps {
  territories: Territory[];
}

// State abbreviations to full name mapping
const stateAbbreviations: Record<string, string> = {
  "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
  "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
  "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho",
  "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
  "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
  "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi",
  "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
  "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York",
  "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
  "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
  "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah",
  "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia",
  "WI": "Wisconsin", "WY": "Wyoming", "DC": "District of Columbia"
};

// Convert state full names to abbreviations (for data processing)
const getStateAbbreviation = (fullName: string): string => {
  const entries = Object.entries(stateAbbreviations);
  const found = entries.find(([_, name]) => name.toLowerCase() === fullName.toLowerCase());
  return found ? found[0] : fullName;
};

const TerritoryMap: React.FC<TerritoryMapProps> = ({ territories }) => {
  // Process territory data to get state stats
  const { 
    assignedStates, 
    availableStates, 
    stateToTerritoryCount,
    assignedTerritoriesCount,
    totalTerritoriesCount
  } = useMemo(() => {
    const assigned = new Set<string>();
    const available = new Set<string>();
    const territoryCounts: Record<string, { total: number, assigned: number }> = {};
    
    let assignedCount = 0;
    
    territories.forEach(territory => {
      // Handle both abbreviation and full state name
      const stateAbbr = territory.state.length === 2 
        ? territory.state 
        : getStateAbbreviation(territory.state);
      
      // Initialize state count if not exists
      if (!territoryCounts[stateAbbr]) {
        territoryCounts[stateAbbr] = { total: 0, assigned: 0 };
      }
      
      territoryCounts[stateAbbr].total += 1;
      
      if (territory.status === 'assigned') {
        assigned.add(stateAbbr);
        territoryCounts[stateAbbr].assigned += 1;
        assignedCount++;
      } else if (territory.status === 'available') {
        available.add(stateAbbr);
      }
    });
    
    return {
      assignedStates: Array.from(assigned),
      availableStates: Array.from(available),
      stateToTerritoryCount: territoryCounts,
      assignedTerritoriesCount: assignedCount,
      totalTerritoriesCount: territories.length
    };
  }, [territories]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Territory Map</CardTitle>
        <CardDescription>
          {assignedTerritoriesCount} of {totalTerritoriesCount} territories assigned across {assignedStates.length} states
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-slate-50 p-4 rounded-lg overflow-auto">
            <svg
              className="w-full h-auto"
              viewBox="0 0 959 593"
              preserveAspectRatio="xMidYMid meet"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Alaska */}
              <path
                d="M161.1,453.7l-0.3,85.4l1.6,1l3.1,0.2l1.5-1.1h2.6l0.2,2.9l7,6.8l0.5,2.6l3.4-1.9l0.6-0.2l0.3-3.1 l1.5-1.6l1.1-0.2l1.9-1.5l3.1,2.1l0.6,2.9l1.9,1.1l1.1,2.4l3.9,1.8l3.4,6l2.7,3.9l2.3,2.7l1.5,3.7l5,1.8l5.2,2.1l1,4.4l0.5,3.1 l-1,3.4l-1.8,2.3l-1.6-0.8l-1.5-3.1l-2.7-1.5l-1.8-1.1l-0.8,0.8l1.5,2.7l0.2,3.7l-1.1,0.5l-1.9-1.9l-2.1-1.3l0.5,1.6l1.3,1.8 l-0.8,0.8c0,0-0.8-0.3-1.3-1c-0.5-0.6-2.1-3.4-2.1-3.4l-1-2.3c0,0-0.3,1.3-1,1c-0.6-0.3-1.3-1.5-1.3-1.5l1.8-1.9l-1.5-1.5v-5h-0.8 l-0.8,3.4l-1.1,0.5l-1-3.7l-0.6-3.7l-0.8-0.5l0.3,5.7v1.1l-1.5-1.3l-3.6-6l-2.1-0.5l-0.6-3.7l-1.6-2.9l-1.6-1.1v-2.3l2.1-1.3 l-0.5-0.3l-2.6,0.6l-3.4-2.4l-2.6-2.9l-4.8-2.6l-4-2.6l1.3-3.2v-1.6l-1.8,1.6l-2.9,1.1l-3.7-1.1l-5.7-2.4h-5.5l-0.6,0.5l-6.5-3.9 l-2.1-0.3l-2.7-5.8l-3.6,0.3l-3.6,1.5l0.5,4.5l1.1-2.9l1,0.3l-1.5,4.4l3.2-2.7l0.6,1.6l-3.9,4.4l-1.3-0.3l-0.5-1.9l-1.3-0.8 l-1.3,1.1l-2.7-1.8l-3.1,2.1l-1.8,2.1l-3.4,2.1l-4.7-0.2l-0.5-2.1l3.7-0.6v-1.3l-2.3-0.6l1-2.4l2.3-3.9v-1.8l0.2-0.8l4.4-2.3 l1,1.3h2.7l-1.3-2.6l-3.7-0.3l-5,2.7l-2.4,3.4l-1.8,2.6l-1.1,2.3l-4.2,1.5l-3.1,2.6l-0.3,1.6l2.3,1l0.8,2.1l-2.7,3.2l-6.5,4.2 l-7.8,4.2l-2.1,1.1l-5.3,1.1l-5.3,2.3l1.8,1.3l-1.5,1.5l-0.5,1.1l-2.7-1l-3.2,0.2l-0.8,2.3h-1l0.3-2.4l-3.6,1.3l-2.9,1l-3.4-1.3 l-2.9,1.9h-3.2l-2.1,1.3l-1.6,0.8l-2.1-0.3l-2.6-1.1l-2.3,0.6l-1,1l-1.6-1.1v-1.9l3.1-1.3l6.3,0.6l4.4-1.6l2.1-2.1l2.9-0.6l1.8-0.8 l2.7,0.2l1.6,1.3l1-0.3l2.3-2.7l3.1-1l3.4-0.6l1.3-0.3l0.6,0.5h0.8l1.3-3.7l4-1.5l1.9-3.7l2.3-4.5l1.6-1.5l0.3-2.6l-1.6,1.3 l-3.4,0.6l-0.6-2.4l-1.3-0.3l-1,1l-0.2,2.9l-1.5-0.2l-1.5-5.8l-1.3,1.3l-1.1-0.5l-0.3-1.9l-4,0.2l-2.1,1.1l-2.6-0.3l1.5-1.5 l0.5-2.6l-0.6-1.9l1.5-1l1.3-0.2l-0.6-1.8v-4.4l-1-1l-0.8,1.5h-6.1l-1.5-1.3l-0.6-3.9l-2.1-3.6v-1l2.1-0.8l0.2-2.1l1.1-1.1 l-0.8-0.5l-1.3,0.5l-1.1-2.7l1-5l4.5-3.2l2.6-1.6l1.9-3.7l2.7-1.3l2.6,1.1l0.3,2.4l2.4-0.3l3.2-2.4l1.6,0.6l1,0.6h1.6l2.3-1.3 l0.8-4.4c0,0,0.3-2.9,1-3.4c0.6-0.5,1-1,1-1l-1.1-1.9l-2.6,0.8l-3.2,0.8l-1.9-0.5l-3.6-1.8l-5-0.2l-3.6-3.7l0.5-3.9l0.6-2.4 l-2.1-1.8l-1.9-3.7l0.5-0.8l6.8-0.5h2.1l1,1h0.6l-0.2-1.6l3.9-0.6l2.6,0.3l1.5,1.1l-1.5,2.1l-0.5,1.5l2.7,1.6l5,1.8l1.8-1 l1.5-3.1l2.7,0.6l1.9,0.6l0.8-0.6l1.9,2.1l1.1,0.2l2.3-0.6l1-4.2l-0.2-4.4l1.8-0.8l1.8-1.9l0.5-1.1l0.8-0.5l1.3,1.1l1.5,1.3l2.3-0.2 l0.8-1.1l1.3-0.6l-0.2-3.2l-1.3-2.3l0.2-1.3l3.6,0.6l3.9-1.1l-0.3-3.7l1.1-3.2l2.3-1h1l1.6,1.1l3.9-0.6l3.4-0.8l3.1,0.3l2.7,1.3 l1.8-1l-1-2.7l3.7-1.8l1.1-1.1l1.1-0.8l-0.3-4.8l0.5-2.7l-1.3-2.3l-1.6-2.9l0.8-1.8l1.6-1.6l0.5-2.3l-0.5-4.2l2.6-1.3L153.7,384 l1.1,2.1l2.3-0.6l2.9,2.9l-1.1,2.3l2.6,0.6l1.8,0.5l-0.5,1.9l0.6,2.3l1.8-0.8l-0.3,4.4l-0.3,2.7l-1.6,1.2l-3.1,0.5l-2.3,0.5 l-1.6-0.6L156.5,406l-1.3-0.5l-0.8-1.1l-1.3-0.2l-0.6,0.6l-1.5-0.2l-2.6,1.3l-1.3,1.5l-4.2,1.9l-3.1,1.2l-1.9,1.9l-1.3,1.3l-0.3,1.3 l-1.3,2.3l-3.2,1l-1.9-2.6l-2.1-0.2l-3.7,1.1l-4.7,4.7l-4,3.9l-6.1,5.5l-1.9,0.8l-2.4-1l-5.5,5.5l-2.9,6.1l-3.9,7.3v0.6l0.2,1.1 L97.8,456l-1.4,2.3l0.6,2.3l-1.3,1.3l-1.5,1.5l-0.6,3.1l-3.9,2.7l-2.7,5.8l-3.9,4.4l-4.2,2.7l-2.1,1.1l-0.5,2.9L73,490l-1.8,1.5 l-8.6,1.5l-4,1.1l-2.6,1.6l-3.5,1.9l-5.2,1.1l-5.8,2.3l-3.6,0.3l-3.8,1.3l-4,1.3l-1.3,0.8l-0.6,1.6l0.2,3.7l-1.5,1.5l-3.1-0.5 l-2.4,1.6l-6.1-2.1l-1.9,0.3l-2.3-1l-2.9,1.3l-3.4,3.5l-4.2,1.6l-5.5,1.3l-2.7,1.6l-1.8-0.8l-3.2,0.8l-1.9,4.8l-0.5,1l-1.1-4 l1-1l-0.8-1.8l-3.2-4.8l-4.5-0.3l-1.8-2.3l-1.5-0.5l-0.8-1.1l-4.5-0.5l-3.4,1.1l-6.8,1.1l-0.5,0.5l-2.9-0.8l-3.9,0.5l-4.5-0.3 l-3.9-1.8l-1.9-2.6h-2.9l-4.2-0.8l-1.1-1.6L0,504l0.3-2.3l2.3-14.2l2.9-18.5L7.8,449l8.1-37.3l8.1-31.5L33.4,347L36,333.1 l2.8-15l3.9-26.2l4.5-30.2l3.7-17.9l1.6-5.3l2.9-5.8l1.6,1.1v2.3l1.8,1L61,237l0.7-0.2l-1.9-4.8l4.7-8.1l-2.1-2.6L65,219l-1.3-4 l2.3-7.9l-1.1-5.8l1.8-0.5l3.2-0.2L72.1,197l4.4-3.9l3.1,0.2l0.5,4.4l1.8,0.5l0.5-1.6l4.2,0.6l2.9,2.1l-0.5,2.3l-4.7,1l-3.6,3.6 l-1.3,4l-0.3,5.2l3.6,3.6l0.8,3.1l-1.9,2.6l-0.3,3.9l1.6,3.7l1.1,0.2l1.6-2.1l1.3,1.1l2.6,0.2L91,228l-0.8,1.9l1.6,1.6L93,233 l-1.3,2.3L93,239l2.6-1.6l0.6,2.6l2.3,3.7l0.3,2.9l-0.8,2.9l0.6,1.9l3.6-0.3l1.3-5.5l0.6-2.4l1.6-0.6l-0.2-3.4l-1.3-3.6v-4l1-1.3 l3.1,0.3l1.3-1.1l1.3,0.3l0.8,1.3l-1,1.3l0.3,2.3l1.3,1.3h2.1l0.8,1.9l0.3,1.1l6.1,0.5l2.1-0.5l-0.3-1.6l-2.9-0.6l0.3-2.6l-3.1-3.7 L116,214l-0.3-5.5l-1.3-0.6l-1-2.1l0.8-1.1l-0.2-3.7L112.1,199l-1.8-1.9l-2.9-1.3l0.3-3.7l3.4-3.1l3.4-0.6l1.6-2.3l-0.6-2.7 L113,182l1.8-2.7l-0.5-1l-3.1,0.2l-3.4-3.4l-3.6-6.6l-4.4-2.6l-3.6-0.5l-2.3-2.6l-2.1-0.6l-2.3,0.8l-2.4-1.6l-1.1-1.6l-1.6,1 l-2.1-0.6l-2.9-2.3l-4.4,1l-8.9-4.3l-0.5-2.3l-2.6-4.8l-1.1-3.6l-2.6-4.8l-2.9-3.6l-2.1-4l-3.8-3.8L52.7,130l-0.5-3.1l0.5-6.1 l-1.5-4.3l-2.4-3.1l-3.2-2.6l-5.2-2.1l-3.2-1.3l-2.6,0.8l-0.5,1.5l-4.2-3.1l-2.6,0.5l-0.5,1.3l-4.8-0.5l-3.9-5.9l-3.6-0.8l-3.1-1.8 l-2.3-1.3l0.5-2.4l-1.5-1.1L7.9,95l-2.9,1.5l-5.5-0.5l-0.2-0.6L0,91.9l4-4.2l5-1.6l1.8-1.5l-0.8-1l0.8-1.5l1.5-0.8l3.4,0.6L17,83 l2.6-1.1l0.3,1l2.4-1.5l3.7-0.5l4.7,0.3l1.1-1.3l-0.3-1.3l-1.3-0.8l0.6-1.6l-1.1-1.8l-2.6-0.5l0.8-2.9l-2.9-1l-0.3-3.6l-1.9-2.1 l3.1-1.6l-0.3-4l-2.1-1.3l-10.2,3.6L7.8,60.7l-2.1,0.5l-2.3,4.7l-0.8,4.2l1.9,2.6l-0.6,4.2l-5.5,7.9L0,88.3l1.6,3.6L0,94.1l3.4,6 l3.7,0.5l2.4-1.1l2.9,0.8l6.8-4.2l1.1-1.1l1.5,0.5l0.8-2.1l-2.1-3.7l5.7-1.1l5.5-6l2.6-0.3l1.6-4l2.6-0.8l2.7-4.4l2.6-0.3l2.3-3.2 l4.7-3.2l-0.5-2.1l2.3-1l0.3-2.7l-3.1-0.3l-2.6,4.4l-5.5,2.3l-2.6-0.2l0.2-2.1l4-3.6l4.2-1.3l-2.1-4l-0.3-3.1l3.4-5.2l3.4-1.4 l1.3,0.7L82.1,42l0.3-2.4l-1.3-0.8l-0.3-1.9l-5.2,0.5l-5.5,3.9l-2.1-0.3L65.5,43l-2.6-1.8l1-2.7l-2.9-0.8l-2.6-2.4l-5,0.3l-0.8-1.8 l-3.6,2.3l-1-1l-4.8,0.8L42,35.3l-1.6,0.8l-5.2-0.3l-11-6.3l-4,0.3L17,32.9l-4.4,1.1l-3.4-1l-11.5,4.5L0,38.7v-4.2L0.8,33l0.6-4.4 l1-1.5l0.5-3.2l5.7-7.1l1.8-1l5.7-5.5l2.3-0.5l2.9-4.4l4.4-0.5l7.1-3.9l6.5-1l1-1.1l7.3,0.3l5.7-0.8l2.4-1.8l1.9,0.8l10.8-6.7 l3.2-3.1l8.9-5l7.7-2.9l6-0.6l2.3-2.7l12.6-4.5L113,0l3.9,3.2l4.5,0.3l4.5,1.5l3.2,0.2l0.2,2.3l-2.1,3.2l0.2,2.1l-2.6,3.1 L124,19l0.5,3.4l2.3,3.9l7.4-2.3l0.5-1.1l5.2,1.3l2.3-3.1l4.5,1.3L152.2,20l2.4-1l6.5-5.3L161.1,4.6l2.3-2.9l6.5-1.6l6,0.8l4-2.1 l2.4-3.2l3.9-0.2l3.6-3.3l4.8-0.5l5.5-3.1l2.9,1l6.3-0.8l4.2,3.4l2.6,0.6h7.8l5.8-2.6l1.3,1.9l2.9-0.3l3.4-4.4l7.8-0.5l1.1-3.1 l5.8-0.8l7.1-1.9l5.2-0.3l6.5,3.1l7.3,1l5.7,0.8l3.2,0.6l3.4,5.5l7.6,3.9l6,3.1v2.3l2.3,4.7l8.1,4.7l1.1,2.3l1.1,2.3l2.9,0.3v2.1 l3,1.3l0.2,1.5l5.8,0.5l0.5,2.4l-0.8,1.5l-7.6,0.5l-5.8,3.7l-3.7,0.5l-3.9,4.2L279.8,37l-11.8,0.5l-4.8,3.7l-7.8,2.1l-3.9,2.6 l-4.4,3.9l-6.3,5.5l-5,5.3L232.5,65l-5.8,2.6l-3.4,0.5l-4.7,3.7l-5.5,7.4l-1.6,5.2l-0.3,3.4l-1,1.5l-0.3,5.2l-1.3,1.8l-4.4,2.1v1.3 l-5.7,3.1l-1.3,2.1l-7.8,4.4l-7.1,0.6l-3.1,2.7l-5.2,1.1l-8.3,4.1l0.5,2.3h-1l-2.6,6l1,1.8l-7.6,9.7l-3.9,5.7l-1.5,5.2l1.3,1.8 l-1.5,5.7L147,153l1.1,5.5l2.6,4.4l2.3,1.1l-0.3,2.7l-1.6,1l0.3,1.3l-0.3,1.8l-2.9,1.5l0.8,9.2l-2.9,4.7l-4.4,3.1l-3.6-1.3l-1-3.1 l-1.5-1.5l-4.5,1.3l-2.1-2.3l-12.7-2.3l-2.9-0.8l-0.8,2.7l1.6,4.8l2.1,3.6l-3.9,5.2l-0.5,2.3l-3.4,2.6v1.6l3.4,6.5l-1.5,2.3l-7.4,4.4 l-9.5,7.6l-15,8.3L85.7,235l-1.8,1.5L82,244l-1.5,6.3l0.5,2.9l-1.6,5.8l-0.3,8.1L77.5,275l2.6,8.4l-0.8,3.9l2.3,9.5l-0.5,4.4 l1.1,2.3l-0.3,3.6l-1.1,2.4l-3.4,4.7l2.3,2.6l4.2,0.5l3.2,3.7l-0.5,2.4l1,7.1l4.2,3.6L95,334l3.9,3.4l2.1,3.9l-0.3,5.2l3.4,0.5 l1.6,3.1l0.3,3.1l6.1,6l3.2,0.8l3.4-1.6l4,1.3l2.9,2.4l7.6,3.9l2.9-1.5l4.8-4.8l4-0.2l2.1,2.7v3.1l-7.1,5.7l-1.8,2.3l-2.4,4.9 l-2.6,1.3l-1.6,0.3l-3.2-2.9l-7.9-0.5l-5.8-0.3l-3.2-2.1l-2.4,0.6L109,376l-7.4,0.2l-2.3-3.6l1.1-3.1l0.2-4.7l-0.8-3.2l-2.9-1.8 l-3.2-0.5l-1-1l-4-0.2l-2.1-4.4l1.1-4.2l-1.6-2.1l-7.3,2.6L75,357v4.4l-3.1,2.6L68.4,369l-1.5,0.3l-0.8-1l-2.1,0.3l-2.9,3.7 l-2.3,4.9l-1.8,0.8l-2.3-0.8l-3.1,4.2l1.6,4.7l1,3.7l-1.5,2.6l0.5,2.9l1.8,0.2l0.8,1.1l-0.3,6l-1.8,2.4l1.3,4.2l1.8,2.6 l-0.5,2.3l1.1,4.5l0.3,2.6l2.6,0.3l2.1,4.4l2.3,2.3l1.3,0.5l0.3,1.6l-3.7,2.4l-1.3,2.9l-2.9,1l2.6,5.7l3.9,4l-1.8,2.1l2.1,2.6 l-0.6,2.3l-2.3,0.3l2.9,2.7l3.9,2.1l3.2-0.6l4.4-1.5l3.2-3.7l1.1-2.1l3.7-2.9l4.5-1.1l4.9-4.5l2.1-0.8l1,1.3l3.1-0.2l3.6-3.1 l1-2.3H123l3.7-4.4l6.8-1.6l6.3-4.9l2.9-10.4l-2.9-2.7l2.3-2.3l2.7,1.3l4.2,2.7l0.3,2.4l-3.6,1.1l0.2,3.2l2.1,3.7l-0.3,4.4l1.8,1.9 l-0.5,1.5l-3.7,1.9l-4.4,1.9l-4.7,4.4l2.1,2.9l-3.2,3.4l-3.9,4.2l-5.3,4.2l-5.7,3.4l-2.3,3.6l-1.8,1.1l-1.9-1.9l-0.5,1.8l-6.3,1.9 l-5.8,2.6l-2.1,1.9l-9.1,0.6l-7.1,0.2l-5.5-2.3l-3.2-3.4l-1.5,1.1l-4.5-9.5l-0.8,0.5l-3.7-5.3l-3.4-0.7l-2.6-1.5l-2.6,0.8 l-1.9-1.5l-2.9-0.5l-2.9-4.3l-2.6-1.3l-1.3,0.8l-1.5-1.3L39,460l-0.2-9.4l-1.6-1.1l0.5-1.6l-1-1l-0.5-4.9"
                className="state"
                fill={assignedStates.includes('AK') ? '#e0827d' : availableStates.includes('AK') ? '#acd8e6' : '#f9f9f9'}
                stroke="#ffffff"
                strokeWidth="1"
                id="AK"
                data-name="Alaska"
                data-id="AK"
              ></path>
              {/* Hawaii */}
              <path
                d="M233.1,519.3l1.9-3.6l2.3-0.3l0.3,0.8l-2.1,3.1H233.1z M243.3,515.6l6.1,2.6l2.1-0.3l1.6-3.9 l-0.6-3.4l-4.2-0.5l-4,1.8L243.3,515.6z M274.2,525.6l3.7,5.5l2.4-0.3l1.1-0.5l1.5,1.3l3.7-0.2l1-1.5l-2.9-1.8l-1.9-3.7l-2.1-3.6 l-5.8,2.9L274.2,525.6z M294.9,534.5l1.3-1.9l4.7,1l0.6-0.5l6.1,0.6l-0.3,1.3l-2.6,1.5l-4.4-0.3L294.9,534.5z M299.5,539.7l1.9,3.9 l3.1-1.1l0.3-1.6l-1.6-2.1l-3.7-0.3V539.7z M306.5,538.5l2.3-2.9l4.7,2.4l4.4,1.1l4.4,2.7v1.9l-3.6,1.8l-4.8,1l-2.4-1.5 L306.5,538.5z M295.1,553.4l1.6-1.3h4.4l4.8,2.3l1.1,1.3l3.7,0.5l2.7,1.6l-1.1,3.4l-3.6,2.7l-4.2,0.5l-3.7-0.5l-2.6-1.1l-0.5-1.6 l-3.1-2.4l-1.9-1.8L295.1,553.4z"
                className="state"
                fill={assignedStates.includes('HI') ? '#e0827d' : availableStates.includes('HI') ? '#acd8e6' : '#f9f9f9'}
                stroke="#ffffff"
                strokeWidth="1"
                id="HI"
                data-name="Hawaii"
                data-id="HI"
              ></path>
              {/* US Mainland states */}
              <g>
                <path
                  d="M385.9,228.8l48.4-4.4l1.1,25.5l2.1,38.9l1.9,2.3v0.9l-2.9,5.3l-0.5,1.5l2.5,4.4l0.3,5.3l-0.8,1.6v3.6l-1.5,0.3l-2.7,6.2 l-0.5,6.4l0.8,1.3l-0.5,2.5l-1.9,2.7l-0.3,0.8l-0.6,6.7l-1.1,2.8l-1.3,0.8l-0.3,4.2l-6.6,0.9l-41.1,4.3l-37.6,2.7l-3.2-57.5 l-1-28L385.9,228.8z"
                  className="state"
                  fill={assignedStates.includes('AL') ? '#e0827d' : availableStates.includes('AL') ? '#acd8e6' : '#f9f9f9'}
                  stroke="#ffffff"
                  strokeWidth="1"
                  id="AL"
                  data-name="Alabama"
                  data-id="AL"
                ></path>
                <path
                  d="M130,382.3l2.3-23.6l3.5-38.8l1.1-11.4l0.8-8.6l7.3-0.5l28-3.7l28.2-4.1l29.3-5l-0.3,10.1l-1.4,0.1l-1.1,2.8l-1.8,0.8 l-1.5,4.1l-2.1,0.2l-1.3,0.7l-0.2,3.3l-1.5,2.7l-0.3,1.1l1,0.8l-0.4,1.5l-1.3,0.9l-1,1.6l-1.7,0.3l-1.5,1.8l-0.3,1.3l0.6,0.9 l1.8,0.1l-0.7,2.5l-2.3,0.3l-1.8,2.1l-1.1,3.4l-0.6,0.6l0.2,1.1l-0.8,0.1l-0.5,0.9l-2,0.5l-1.4,1.2l-1.5,0.2l-3.2,1.5l-1.8,0.1 l-1.5,0.7l-0.8,1.5l-2.5,0.5l-1,1.3l-1,0.5l-2.1,1.8l-1.8,0.8l-0.6,1.9l0.3,1.5l-0.7,2.2l-2.5,0.6l-1.3-0.5l-0.4-2 l-0.8-0.1l-1.3,0.4 l-0.8-0.1l-0.1,0.8l-0.5,0.5l-0.3,1.3l-2.2-0.1l-1.3-2.8l-2.3-1l-3.5-0.4l-1-1.6l-2.1-0.2l-1-1.1l-0.2-1.8l0.7-3.7l1.8-1.7l-0.1-1.7 l1.2-1.9l-2-5.6l-1.1-0.7l-0.6-1.5l-1.5-1.7l-3.5-0.8l-1.9-2.8l-2.3-0.2l-2.3-1.3l-2.4-3.6l-0.2-3.2l1.3-4.1l-1.5-2.9l-2.8-1.8 l-3.2-0.4l-2-2.9l-0.1-1.7l-1-2.6l-1.7-0.1l-0.9,0.3l-0.9-0.8l0.6-1.4l-1.2-1.8l-2.3,0.2l-1.1-0.2l-0.9-2.9l-0.9-0.9l-2.1-0.6 l-2.2-3.9L130,382.3z"
                  className="state"
                  fill={assignedStates.includes('AZ') ? '#e0827d' : availableStates.includes('AZ') ? '#acd8e6' : '#f9f9f9'}
                  stroke="#ffffff"
                  strokeWidth="1"
                  id="AZ"
                  data-name="Arizona"
                  data-id="AZ"
                ></path>
                <path
                  d="M169.4,175.2L171,175l0.8-0.4l0.7-2.2l3.9-5.7l3.9-5.8l2-2.1l0.3-1.2l-1.2-2.8l0.7-0.4l0.9,0.6l1.4,1.4l0.5-0.7l-0.8-2.9 l0.3-3.5l1.1-1.6l2.3,1.1l1-0.6l2.1-3.8l0.9-0.2l1.8,1.2l1-0.1l0.6-0.9l1.9-0.9l1.9-0.9l1.4-1.8l1-2.3l1.3-1.3l2.1-1.5l3.1-1.5 l1.9-1.9l1.6-0.7l0.8-0.7l-0.1-1l1-1.5l1-0.3l0.1-0.5l-0.9-1.7l0.2-1.1l3.8-1l2.3-1.1l2.2-0.9l1.9-1.6l1.8-0.5l0.8-0.6l-0.7-0.9 l-0.2-0.5l0.6-0.5l2-2.2l0.5,0.3l0.2-0.4l-0.4-0.8l0.2-0.3l1.7,0.4l2.5-0.8l3.2-1.1l0.4-0.6l38.1,8.5l24.3,4.9l23.2,4.1l0.4,0.8 l4.2,3.4l1.9,1l3.9,4.3l0.9,0.3v0.7l3.3,2.8l2.6,3l-1.5,0.2l-1.6,1.4l-0.8,2l1.1,3.3l2.5,4.4l-0.3,1.7l-1.3,1.2l0.3,1.3l-0.7,1.7 l0.2,1.9l-0.9,0.5l-0.5,2.1l1.3,2.6l0.1,2.2l-1.2,2.4l-2.8,0.5l-3.1,1.7l-1.9,3.1l-2.5,0.6l-0.4,0.4l-0.2,1.1l-1.5,0.7l-0.6,1.6 l-1.4,0.3l-1.1,0.4l-2.7,2.9l-0.8,1.8l-0.3,2.6l0.7,1.7l1.8,0.2l0.3,0.9l-0.2,2.7l-1.5,0.7l0.2,0.5l-0.2,0.5l0.4,1.2l-0.3,0.2 l-0.2,0.8l-1.7,2.1l-0.3,1.3l0.8,1.5l-1.2,0.8l-1.8,1.1l-2.5,2.4l-2.4,1.3l-1.2,1.4l-0.4,1.6l0.1,3.1l-0.3,1.7l0.8,3.6l-48.1,4.1 L114,257.7l-14.2,0.9l-32.4,1.1l-1.1-2.2l0.4-4.9l1.3-2.4l0.7-2.7l1.3-2.2l0.7-2.7l0.7-1.3l3.8-0.6l0.5-1.7l-2.3-2.2L74,238 l1.1-5.6l1.8-2.9l0.3-1.3l1.2-1.3l0.7-0.7l-0.7-3.4l-1.6-1.9l-1.5-3.5l-1-1.3l1.8-2.3l-0.2-4.3l-1-3.7l0.2-3.5l1.1-1.4l0.3-2.1 l2.1-1.8L169.4,175.2z"
                  className="state"
                  fill={assignedStates.includes('CO') ? '#e0827d' : availableStates.includes('CO') ? '#acd8e6' : '#f9f9f9'}
                  stroke="#ffffff"
                  strokeWidth="1"
                  id="CO"
                  data-name="Colorado"
                  data-id="CO"
                ></path>
                {/* Include similar paths for all other states */}
              </g>
            </svg>
          </div>
          <div className="lg:col-span-1">
            <div className="bg-white p-4 rounded-lg shadow-sm mb-4">
              <h3 className="text-lg font-medium mb-2">Territory Status</h3>
              <dl className="space-y-2">
                <div className="flex justify-between">
                  <dt>Assigned territories:</dt>
                  <dd className="font-medium">{assignedTerritoriesCount}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>States with territories:</dt>
                  <dd className="font-medium">{Object.keys(stateToTerritoryCount).length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>States with active franchises:</dt>
                  <dd className="font-medium">{assignedStates.length}</dd>
                </div>
              </dl>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm">
              <h3 className="text-lg font-medium mb-2">Top States</h3>
              <div className="space-y-2">
                {Object.entries(stateToTerritoryCount)
                  .sort(([_, a], [__, b]) => b.total - a.total)
                  .slice(0, 5)
                  .map(([state, data]) => (
                    <div key={state} className="flex items-center">
                      <div className="w-4 h-4 mr-2 flex-shrink-0">
                        <MapPin size={16} className={data.assigned > 0 ? "text-conve-red" : "text-blue-400"} />
                      </div>
                      <div className="flex-grow">
                        <div className="flex justify-between">
                          <span>{stateAbbreviations[state] || state}</span>
                          <span className="font-medium">{data.total} territories</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                          <div 
                            className="bg-conve-red h-2 rounded-full" 
                            style={{ width: `${(data.assigned / data.total) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default TerritoryMap;
