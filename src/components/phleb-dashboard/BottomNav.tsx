import React from 'react';
import { Calendar, MessageSquare, CheckCircle2, Settings, FolderOpen, Truck, DollarSign } from 'lucide-react';

export type PhlebTab = 'schedule' | 'messages' | 'directory' | 'completed' | 'deliveries' | 'earnings' | 'settings';

interface BottomNavProps {
  activeTab: PhlebTab;
  onTabChange: (tab: PhlebTab) => void;
  unreadMessages?: number;
}

const tabs: { id: PhlebTab; label: string; icon: React.ElementType }[] = [
  { id: 'schedule', label: 'Schedule', icon: Calendar },
  { id: 'messages', label: 'Messages', icon: MessageSquare },
  { id: 'directory', label: 'Directory', icon: FolderOpen },
  { id: 'deliveries', label: 'Deliveries', icon: Truck },
  { id: 'earnings', label: 'Earnings', icon: DollarSign },
  { id: 'completed', label: 'Done', icon: CheckCircle2 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onTabChange, unreadMessages = 0 }) => {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#EFE3E1] shadow-lg z-50"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="max-w-lg mx-auto flex">
        {tabs.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={`flex-1 flex flex-col items-center py-1.5 pt-2 relative transition-colors ${
                isActive ? 'text-[#B91C1C]' : 'text-[#B7A9AB]'
              }`}
            >
              {/* Approved design: soft crimson pill behind the active icon */}
              <div className={`relative flex items-center justify-center rounded-full px-3 py-0.5 transition-colors ${isActive ? 'bg-[#B91C1C]/10' : ''}`}>
                <Icon className="h-5 w-5" />
                {id === 'messages' && unreadMessages > 0 && (
                  <span className="absolute -top-1.5 -right-1 bg-[#B91C1C] text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                    {unreadMessages > 9 ? '9+' : unreadMessages}
                  </span>
                )}
              </div>
              <span className={`text-[10px] mt-0.5 ${isActive ? 'font-bold' : 'font-medium'}`}>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
