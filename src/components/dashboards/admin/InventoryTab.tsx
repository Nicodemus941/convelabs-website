
import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, TrendingDown, TrendingUp } from "lucide-react";
import { Progress } from "@/components/ui/progress";

const InventoryTab = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  
  const inventoryItems = [
    { 
      name: "23g Butterfly Needles", 
      category: "Needles",
      currentQuantity: 15,
      reorderThreshold: 20,
      unitSize: "Box of 100",
      lastRestock: "2025-05-01",
      status: "low"
    },
    { 
      name: "SST Tubes", 
      category: "Tubes",
      currentQuantity: 18,
      reorderThreshold: 25,
      unitSize: "Box of 100",
      lastRestock: "2025-05-03",
      status: "low"
    },
    { 
      name: "EDTA Tubes", 
      category: "Tubes",
      currentQuantity: 45,
      reorderThreshold: 30,
      unitSize: "Box of 100",
      lastRestock: "2025-05-10",
      status: "ok"
    },
    { 
      name: "Alcohol Prep Pads", 
      category: "Supplies",
      currentQuantity: 250,
      reorderThreshold: 100,
      unitSize: "Box of 500",
      lastRestock: "2025-04-25",
      status: "ok"
    },
    { 
      name: "Tourniquet", 
      category: "Equipment",
      currentQuantity: 40,
      reorderThreshold: 15,
      unitSize: "Individual",
      lastRestock: "2025-04-15",
      status: "ok"
    }
  ];
  
  const filteredItems = inventoryItems.filter(item => {
    const matchesSearch = searchQuery === "" || 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === "" || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  // Extract unique categories for filter dropdown
  const categories = [...new Set(inventoryItems.map(item => item.category))];
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Inventory Management</CardTitle>
        <CardDescription>Track and manage lab supplies</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row justify-between gap-4">
            <div className="flex flex-wrap gap-2">
              <input 
                type="text" 
                placeholder="Search inventory..." 
                className="px-4 py-2 border rounded-md"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              <select 
                className="px-4 py-2 border rounded-md"
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
              >
                <option value="">All categories</option>
                {categories.map((category, index) => (
                  <option key={index} value={category}>{category}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button className="luxury-button-outline-sm">Export CSV</button>
              <button className="luxury-button-sm">Order Supplies</button>
            </div>
          </div>
          
          {/* Inventory at a glance */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">In Stock Items</h3>
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <p className="text-2xl font-bold mt-2">3</p>
            </div>
            
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Low Stock Items</h3>
                <TrendingDown className="h-5 w-5 text-red-600" />
              </div>
              <p className="text-2xl font-bold mt-2">2</p>
            </div>
            
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Total Categories</h3>
                <span className="h-5 w-5 flex items-center justify-center text-blue-600 font-medium">4</span>
              </div>
              <p className="text-2xl font-bold mt-2">{categories.length}</p>
            </div>
          </div>
          
          {/* Item listing */}
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-4">Item</th>
                <th className="text-left py-3 px-4">Category</th>
                <th className="text-left py-3 px-4">Qty</th>
                <th className="text-left py-3 px-4">Unit Size</th>
                <th className="text-left py-3 px-4">Last Restock</th>
                <th className="text-left py-3 px-4">Status</th>
                <th className="text-left py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item, i) => (
                <tr key={i} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4">{item.name}</td>
                  <td className="py-3 px-4">{item.category}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <span>{item.currentQuantity}</span>
                      {item.status === 'low' && <AlertCircle className="h-4 w-4 text-red-500" />}
                    </div>
                    <div className="w-24 mt-1">
                      <Progress 
                        value={(item.currentQuantity / item.reorderThreshold) * 100} 
                        className={item.status === 'low' ? "bg-red-200" : "bg-gray-200"}
                      />
                    </div>
                  </td>
                  <td className="py-3 px-4">{item.unitSize}</td>
                  <td className="py-3 px-4">{item.lastRestock}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-1 rounded text-xs ${
                      item.status === 'ok' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {item.status === 'ok' ? 'In stock' : 'Low stock'}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex gap-2">
                      <button className="text-blue-600 hover:text-blue-800">Update</button>
                      <button className="text-green-600 hover:text-green-800">Restock</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};

export default InventoryTab;
