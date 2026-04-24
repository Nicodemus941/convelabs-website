import React from 'react';
import { Calendar, MessageSquare, CheckCircle2, Settings, FolderOpen } from 'lucide-react';

export type PhlebTab = 'schedule' | 'messages' | 'directory' | 'completed' | 'settings';

interface BottomNavProps {
  activeTab: PhlebTab;
  onTabChange: (tab: PhlebTab) => void;
  unreadMessages?: number;
}

const tabs: { id: PhlebTab; label: string; icon: React.ElementType }[] = [
  { id: 'schedule', label: 'Schedule', icon: Calendar },
  { id: 'messages', label: 'Messages', icon: MessageSquare },
  { id: 'directory', label: 'Directory', icon: FolderOpen },
  { id: 'completed', label: 'Done', icon: CheckCircle2 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onTabChange, unreadMessages = 0 }) => {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="max-w-lg mx-auto flex">
        {tabs.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={`flex-1 flex flex-col items-center py-2 pt-2.5 relative transition-colors ${
                isActive ? 'text-[#B91C1C]' : 'text-gray-400'
              }`}
            >
              {isActive && (
                <div className="absolute top-0 left-1/4 right-1/4 h-0.5 bg-[#B91C1C] rounded-b" />
              )}
              <div className="relative">
                <Icon className="h-5 w-5" />
                {id === 'messages' && unreadMessages > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-[#B91C1C] text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                    {unreadMessages > 9 ? '9+' : unreadMessages}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium mt-1">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
