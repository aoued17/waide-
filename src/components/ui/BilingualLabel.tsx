import React from 'react';

interface BilingualLabelProps {
  fr: string;
  ar?: string;
  required?: boolean;
  className?: string;
  arClassName?: string;
}

export function BilingualLabel({ fr, ar, required, className = '', arClassName = '' }: BilingualLabelProps) {
  return (
    <div className={`flex flex-col ${className}`}>
      <span className="text-sm font-medium text-[#202B3C]">
        {fr}
        {required && <span className="text-[#E74C3C] ml-1">*</span>}
      </span>
      {ar && (
        <span className={`font-arabic text-[11px] leading-tight text-[#718096] mt-0.5 ${arClassName}`}>
          {ar}
        </span>
      )}
    </div>
  );
}
