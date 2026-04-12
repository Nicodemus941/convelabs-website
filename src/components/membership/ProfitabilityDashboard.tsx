
import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { formatPrice } from '@/services/stripe';
import { supabase } from '@/integrations/supabase/client';
import { addDays } from 'date-fns';
import { toast } from '@/components/ui/sonner';
import { Loader2, TrendingDown, TrendingUp } from 'lucide-react';

interface ProfitabilityData {
  user_id: string;
  user_name: string;
  membership_plan_name: string;
  membership_plan_id: string;
  total_paid: number;
  credits_used: number;
  total_cost_incurred: number;
  gross_profit: number;
  profit_margin_percentage: number;
  status_flag: string;
}

interface DateRange {
  from: Date;
  to: Date;
}

export default function ProfitabilityDashboard() {
  const [profitabilityData, setProfitabilityData] = useState<ProfitabilityData[]>([]);
  const [filteredData, setFilteredData] = useState<ProfitabilityData[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<string>('profit_margin_percentage');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRange>({
    from: addDays(new Date(), -90),
    to: new Date(),
  });

  // Fetch profitability data
  useEffect(() => {
    async function fetchProfitabilityData() {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc('calculate_profitability', {
          from_date: dateRange.from.toISOString(),
          to_date: dateRange.to.toISOString()
        });

        if (error) {
          throw error;
        }

        setProfitabilityData(data || []);
        setFilteredData(data || []);
      } catch (error) {
        console.error('Error fetching profitability data:', error);
        toast.error('Failed to load profitability data');
      } finally {
        setLoading(false);
      }
    }

    fetchProfitabilityData();
  }, [dateRange]);

  // Apply filters and sorting
  useEffect(() => {
    let results = [...profitabilityData];
    
    // Apply plan filter
    if (planFilter !== 'all') {
      results = results.filter(item => item.membership_plan_name === planFilter);
    }
    
    // Apply status filter
    if (statusFilter !== 'all') {
      results = results.filter(item => item.status_flag === statusFilter);
    }
    
    // Apply sorting
    results.sort((a, b) => {
      const valA = a[sortBy as keyof ProfitabilityData];
      const valB = b[sortBy as keyof ProfitabilityData];
      
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }
      
      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortOrder === 'asc' 
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }
      
      return 0;
    });
    
    setFilteredData(results);
  }, [profitabilityData, planFilter, statusFilter, sortBy, sortOrder]);

  // Get unique plan names for filter
  const uniquePlans = Array.from(
    new Set(profitabilityData.map(item => item.membership_plan_name))
  );

  // Get total metrics
  const totals = filteredData.reduce(
    (acc, item) => {
      acc.revenue += item.total_paid;
      acc.costs += item.total_cost_incurred;
      acc.profit += item.gross_profit;
      acc.credits += item.credits_used;
      return acc;
    },
    { revenue: 0, costs: 0, profit: 0, credits: 0 }
  );

  const profitMarginPercentage = totals.revenue > 0 
    ? (totals.profit / totals.revenue) * 100
    : 0;

  // Handle sort change
  const handleSortChange = (column: string) => {
    if (sortBy === column) {
      setSortOrder(prevOrder => prevOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Membership Profitability</CardTitle>
        <CardDescription>
          Analyze revenue, costs, and profitability for all memberships
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="overview">
          <TabsList className="mb-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="members">Individual Members</TabsTrigger>
          </TabsList>
          
          <div className="mb-6 flex flex-col space-y-4 sm:flex-row sm:space-x-4 sm:space-y-0">
            <DatePickerWithRange 
              date={dateRange}
              setDate={setDateRange}
              className="sm:max-w-[300px]"
            />
            
            <div className="flex space-x-2">
              <Select value={planFilter} onValueChange={setPlanFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Plans</SelectItem>
                  {uniquePlans.map(plan => (
                    <SelectItem key={plan} value={plan}>{plan}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="Healthy">Healthy</SelectItem>
                  <SelectItem value="At Risk">At Risk</SelectItem>
                  <SelectItem value="No Revenue">No Revenue</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <TabsContent value="overview">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Total Revenue</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatPrice(totals.revenue)}</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Total Costs</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatPrice(totals.costs)}</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Gross Profit</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center">
                    <div className="text-2xl font-bold">{formatPrice(totals.profit)}</div>
                    {profitMarginPercentage >= 50 ? (
                      <TrendingUp className="ml-2 h-4 w-4 text-green-500" />
                    ) : (
                      <TrendingDown className="ml-2 h-4 w-4 text-red-500" />
                    )}
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Profit Margin</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {profitMarginPercentage.toFixed(1)}%
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          <TabsContent value="members">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead 
                        className="cursor-pointer"
                        onClick={() => handleSortChange('user_name')}
                      >
                        Member
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer"
                        onClick={() => handleSortChange('membership_plan_name')}
                      >
                        Plan
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer text-right"
                        onClick={() => handleSortChange('total_paid')}
                      >
                        Revenue
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer text-center"
                        onClick={() => handleSortChange('credits_used')}
                      >
                        Credits Used
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer text-right"
                        onClick={() => handleSortChange('total_cost_incurred')}
                      >
                        Cost
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer text-right"
                        onClick={() => handleSortChange('gross_profit')}
                      >
                        Profit
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer text-right"
                        onClick={() => handleSortChange('profit_margin_percentage')}
                      >
                        Margin
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer"
                        onClick={() => handleSortChange('status_flag')}
                      >
                        Status
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="h-24 text-center">
                          No results found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredData.map(item => (
                        <TableRow key={item.user_id}>
                          <TableCell className="font-medium">
                            {item.user_name}
                          </TableCell>
                          <TableCell>{item.membership_plan_name}</TableCell>
                          <TableCell className="text-right">
                            {formatPrice(item.total_paid)}
                          </TableCell>
                          <TableCell className="text-center">{item.credits_used}</TableCell>
                          <TableCell className="text-right">
                            {formatPrice(item.total_cost_incurred)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatPrice(item.gross_profit)}
                          </TableCell>
                          <TableCell className="text-right">
                            {item.profit_margin_percentage.toFixed(1)}%
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                item.status_flag === 'Healthy' ? 'outline' :
                                item.status_flag === 'At Risk' ? 'destructive' : 'secondary'
                              }
                            >
                              {item.status_flag}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
