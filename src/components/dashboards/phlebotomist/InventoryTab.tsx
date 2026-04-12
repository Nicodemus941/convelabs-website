
import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const InventoryTab: React.FC = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Inventory Tracking</CardTitle>
        <CardDescription>Record supplies used during appointments</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="border rounded-lg p-4">
            <h3 className="font-medium text-lg mb-4">Today's Usage</h3>
            
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="text-left px-4 py-3 text-sm font-medium">Supply Item</th>
                    <th className="text-left px-4 py-3 text-sm font-medium">Used Today</th>
                    <th className="text-left px-4 py-3 text-sm font-medium">Unit Size</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t">
                    <td className="px-4 py-3 text-sm">SST Tubes</td>
                    <td className="px-4 py-3 text-sm">2</td>
                    <td className="px-4 py-3 text-sm">100/pack</td>
                  </tr>
                  <tr className="border-t">
                    <td className="px-4 py-3 text-sm">Butterfly Needles 23g</td>
                    <td className="px-4 py-3 text-sm">1</td>
                    <td className="px-4 py-3 text-sm">99/box</td>
                  </tr>
                  <tr className="border-t">
                    <td className="px-4 py-3 text-sm">Alcohol Wipes</td>
                    <td className="px-4 py-3 text-sm">1</td>
                    <td className="px-4 py-3 text-sm">2,000/box</td>
                  </tr>
                  <tr className="border-t">
                    <td className="px-4 py-3 text-sm">Gloves</td>
                    <td className="px-4 py-3 text-sm">1</td>
                    <td className="px-4 py-3 text-sm">100 pairs/box</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="border rounded-lg p-4">
            <h3 className="font-medium text-lg mb-4">Record Inventory Usage</h3>
            
            <form>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Appointment</label>
                  <select className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-conve-red">
                    <option>Select appointment</option>
                    <option>Jennifer Miller - 10:30 AM</option>
                    <option>Robert Thomas - 1:15 PM</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Date</label>
                  <input 
                    type="date" 
                    className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-conve-red"
                    defaultValue={new Date().toISOString().substring(0, 10)}
                  />
                </div>
              </div>
              
              <h4 className="font-medium text-md mt-6 mb-3">Supplies Used</h4>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">SST Tubes</label>
                    <input 
                      type="number" 
                      min="0"
                      className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-conve-red"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Lavender Tubes</label>
                    <input 
                      type="number"
                      min="0" 
                      className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-conve-red"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Red Top Tubes</label>
                    <input 
                      type="number"
                      min="0" 
                      className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-conve-red"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Blue Top Tubes</label>
                    <input 
                      type="number"
                      min="0" 
                      className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-conve-red"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Royal Blue Tubes</label>
                    <input 
                      type="number"
                      min="0" 
                      className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-conve-red"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Butterfly Needles 23g</label>
                    <input 
                      type="number"
                      min="0" 
                      className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-conve-red"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Butterfly Needles 21g</label>
                    <input 
                      type="number"
                      min="0" 
                      className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-conve-red"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Alcohol Wipes</label>
                    <input 
                      type="number"
                      min="0" 
                      className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-conve-red"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Gloves (pairs)</label>
                  <input 
                    type="number"
                    min="0" 
                    className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-conve-red max-w-[200px]"
                  />
                </div>
              </div>
              
              <div className="mt-6">
                <Button className="luxury-button">Submit Inventory Usage</Button>
              </div>
            </form>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default InventoryTab;
