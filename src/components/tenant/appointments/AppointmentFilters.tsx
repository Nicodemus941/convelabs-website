
import React from "react";
import { Filter, Search, CalendarIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Popover,
  PopoverContent,
  PopoverTrigger 
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

interface AppointmentFiltersProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  statusFilter: string;
  setStatusFilter: (status: string) => void;
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
  onFilterApply: () => void;
  onFilterReset?: () => void;
}

const AppointmentFilters: React.FC<AppointmentFiltersProps> = ({
  activeTab,
  setActiveTab,
  searchTerm,
  setSearchTerm,
  statusFilter,
  setStatusFilter,
  dateRange,
  setDateRange,
  onFilterApply,
  onFilterReset,
}) => {
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      onFilterApply();
    }
  };
  
  const handleResetFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setDateRange({ from: new Date(), to: new Date(new Date().setMonth(new Date().getMonth() + 1)) });
    
    if (onFilterReset) {
      onFilterReset();
    } else {
      onFilterApply();
    }
  };
  
  const hasActiveFilters = searchTerm || statusFilter !== "all" || (dateRange?.from && dateRange?.to);
  
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <TabsList>
          <TabsTrigger 
            value="upcoming" 
            onClick={() => setActiveTab("upcoming")}
            className={activeTab === "upcoming" ? "bg-primary text-primary-foreground" : ""}
          >
            Upcoming
          </TabsTrigger>
          <TabsTrigger 
            value="past" 
            onClick={() => setActiveTab("past")}
            className={activeTab === "past" ? "bg-primary text-primary-foreground" : ""}
          >
            Past
          </TabsTrigger>
          <TabsTrigger 
            value="all" 
            onClick={() => setActiveTab("all")}
            className={activeTab === "all" ? "bg-primary text-primary-foreground" : ""}
          >
            All
          </TabsTrigger>
        </TabsList>
        
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex items-center">
            <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
            <Input 
              type="text"
              placeholder="Search by name or address" 
              className="pl-10 h-10 w-full sm:w-[250px]"
              value={searchTerm}
              onChange={handleSearchChange}
              onKeyDown={handleKeyDown}
            />
            {searchTerm && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="absolute right-0 h-full" 
                onClick={() => {
                  setSearchTerm("");
                  onFilterApply();
                }}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Clear search</span>
              </Button>
            )}
          </div>
          
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-10">
                <Filter className="mr-2 h-4 w-4" />
                Filters
                {hasActiveFilters && (
                  <Badge variant="secondary" className="ml-1 h-5 w-5 rounded-full p-0 flex items-center justify-center">
                    {(Number(!!searchTerm) + Number(statusFilter !== "all") + Number(!!(dateRange?.from && dateRange?.to)))}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <div className="space-y-4">
                <h4 className="font-medium">Filter Appointments</h4>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
                  <Select 
                    value={statusFilter}
                    onValueChange={setStatusFilter}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="scheduled">Scheduled</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                      <SelectItem value="no-show">No Show</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Date Range</label>
                  <DatePickerWithRange date={dateRange} setDate={setDateRange} />
                </div>
                
                <div className="flex justify-between pt-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleResetFilters}
                    disabled={!hasActiveFilters}
                  >
                    Reset
                  </Button>
                  <Button size="sm" onClick={onFilterApply}>Apply Filters</Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
};

export default AppointmentFilters;
