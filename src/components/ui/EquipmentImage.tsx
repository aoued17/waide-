import React, { useState } from 'react';
import { Wrench } from 'lucide-react';

export function EquipmentImage({
  src,
  alt,
  className = 'w-11 h-11',
}: {
  src?: string | null;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  const safeSrc =
    src && (src.startsWith('https://') || src.startsWith('http://') || src.startsWith('data:image/'))
      ? src
      : '';

  if (!safeSrc || failed) {
    return (
      <div
        className={`${className} rounded-lg bg-[#F4F6FA] border border-slate-200 flex items-center justify-center text-[#718096] shrink-0`}
        title={alt}
      >
        <Wrench className="w-4 h-4" />
      </div>
    );
  }

  return (
    <img
      src={safeSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${className} rounded-lg object-cover border border-slate-200 bg-slate-50 shrink-0`}
    />
  );
}
