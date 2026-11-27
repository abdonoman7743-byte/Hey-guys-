import { useState } from 'react';
import type { PresenceStatus } from '../types/domain';
import { getInitials } from '../utils/chatUtils';

interface AvatarProps {
  name: string;
  src?: string;
  status?: PresenceStatus;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showStatus?: boolean;
}

const sizeMap = {
  sm: 'w-9 h-9 text-xs',
  md: 'w-11 h-11 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-24 h-24 text-2xl',
};

const statusColorMap: Record<PresenceStatus, string> = {
  online: 'bg-emerald-500',
  busy: 'bg-amber-500',
  offline: 'bg-slate-400',
};

export function Avatar({
  name,
  src,
  status = 'offline',
  size = 'md',
  showStatus = false,
}: AvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div className="relative inline-flex shrink-0 items-center justify-center">
      {src && !imgFailed ? (
        <img
          src={src}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className={`${sizeMap[size]} rounded-full object-cover border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800`}
        />
      ) : (
        <div
          className={`${sizeMap[size]} rounded-full bg-teal-700 dark:bg-teal-600 text-white font-semibold flex items-center justify-center select-none border border-teal-800/10`}
          aria-hidden="true"
        >
          {getInitials(name)}
        </div>
      )}
      {showStatus && (
        <span
          className={`absolute bottom-0 end-0 block h-3 w-3 rounded-full ring-2 ring-white dark:ring-slate-900 ${statusColorMap[status]}`}
          title={status}
        />
      )}
    </div>
  );
}
