// Icônes au trait (aria-hidden : le texte voisin porte le sens)
type P = { size?: number; className?: string };
const base = (size = 20) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true });

export const IconHome = ({ size, className }: P) => <svg {...base(size)} className={className}><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" /></svg>;
export const IconSun = ({ size, className }: P) => <svg {...base(size)} className={className}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
export const IconMoon = ({ size, className }: P) => <svg {...base(size)} className={className}><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></svg>;
export const IconChart = ({ size, className }: P) => <svg {...base(size)} className={className}><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 5-6" /></svg>;
export const IconBell = ({ size, className }: P) => <svg {...base(size)} className={className}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>;
export const IconArrowRight = ({ size, className }: P) => <svg {...base(size)} className={className}><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>;
export const IconArrowLeft = ({ size, className }: P) => <svg {...base(size)} className={className}><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>;
export const IconCheck = ({ size, className }: P) => <svg {...base(size)} className={className}><path d="M20 6 9 17l-5-5" /></svg>;
export const IconPlus = ({ size, className }: P) => <svg {...base(size)} className={className}><path d="M12 5v14M5 12h14" /></svg>;
export const IconTrash = ({ size, className }: P) => <svg {...base(size)} className={className}><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>;
export const IconDownload = ({ size, className }: P) => <svg {...base(size)} className={className}><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>;
export const IconClip = ({ size, className }: P) => <svg {...base(size)} className={className}><path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" /></svg>;
export const IconWallet = ({ size, className }: P) => <svg {...base(size)} className={className}><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></svg>;
export const IconGrid = ({ size, className }: P) => <svg {...base(size)} className={className}><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></svg>;
export const IconUsers = ({ size, className }: P) => <svg {...base(size)} className={className}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></svg>;
export const IconFile = ({ size, className }: P) => <svg {...base(size)} className={className}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></svg>;
export const IconFolder = ({ size, className }: P) => <svg {...base(size)} className={className}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>;
export const IconUser = ({ size, className }: P) => <svg {...base(size)} className={className}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
export const IconSettings = ({ size, className }: P) => <svg {...base(size)} className={className}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></svg>;
export const IconLock = ({ size, className }: P) => <svg {...base(size)} className={className}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
export const IconCamera = ({ size, className }: P) => <svg {...base(size)} className={className}><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" /><circle cx="12" cy="13" r="3.5" /></svg>;
export const IconChevron = ({ size, className }: P) => <svg {...base(size)} className={className}><path d="m9 18 6-6-6-6" /></svg>;
