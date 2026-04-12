
import { useState } from 'react';
import { useNotifications } from '@/contexts/NotificationsContext';
import { SupplyItem } from './SupplyTypes';

export const useSuppliesState = () => {
  const { addNotification } = useNotifications();
  const [supplies, setSupplies] = useState<SupplyItem[]>([
    { id: '1', name: 'Blood Collection Tubes (Red Top)', level: 15, threshold: 20, unit: 'tubes', lastUpdated: new Date() },
    { id: '2', name: 'Lancets', level: 35, threshold: 30, unit: 'pieces', lastUpdated: new Date() },
    { id: '3', name: 'Biohazard Bags', level: 8, threshold: 10, unit: 'bags', lastUpdated: new Date() },
    { id: '4', name: 'Alcohol Swabs', level: 50, threshold: 40, unit: 'swabs', lastUpdated: new Date() },
    { id: '5', name: 'Gloves (Medium)', level: 12, threshold: 20, unit: 'pairs', lastUpdated: new Date() },
  ]);

  const getLevelColor = (level: number, threshold: number) => {
    if (level <= threshold * 0.5) return 'bg-red-500';
    if (level <= threshold) return 'bg-amber-500';
    return 'bg-green-500';
  };

  const getPercentage = (level: number, threshold: number) => {
    // Calculate percentage where threshold is 40%
    const percentage = Math.min((level / (threshold * 2.5)) * 100, 100);
    return Math.max(percentage, 5); // Ensure at least 5% for visibility
  };

  const handleUpdateSupply = (id: string, newLevel: number) => {
    setSupplies(prev => 
      prev.map(item => 
        item.id === id ? { ...item, level: newLevel, lastUpdated: new Date() } : item
      )
    );

    const supply = supplies.find(item => item.id === id);
    if (supply && newLevel <= supply.threshold) {
      addNotification({
        type: 'equipment',
        title: 'Low Supply Alert',
        message: `${supply.name} is running low (${newLevel} ${supply.unit} left). Please restock soon.`,
        priority: newLevel <= supply.threshold * 0.5 ? 'high' : 'medium',
      });
    }
  };

  const handleRequestRestock = (id: string) => {
    const supply = supplies.find(item => item.id === id);
    if (supply) {
      addNotification({
        type: 'equipment',
        title: 'Restock Request Sent',
        message: `A restock request for ${supply.name} has been sent to the office manager.`,
        priority: 'low',
      });
    }
  };

  const updateAllSupplies = () => {
    setSupplies(prev => prev.map(item => ({...item, lastUpdated: new Date()})));
  };

  return {
    supplies,
    getLevelColor,
    getPercentage,
    handleUpdateSupply,
    handleRequestRestock,
    updateAllSupplies
  };
};
