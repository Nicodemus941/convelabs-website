
import React from "react";

interface DividerProps {
  text: string;
}

export const Divider = ({ text }: DividerProps) => {
  return (
    <div className="relative my-6">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-gray-300"></div>
      </div>
      <div className="relative flex justify-center text-xs uppercase">
        <span className="bg-white px-2 text-gray-500">{text}</span>
      </div>
    </div>
  );
};
