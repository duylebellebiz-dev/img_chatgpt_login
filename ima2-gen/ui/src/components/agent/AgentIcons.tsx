type IconProps = {
  size?: number;
};

function Svg({ size = 16, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return <Svg {...props}><path d="M12 5v14" /><path d="M5 12h14" /></Svg>;
}

export function SearchIcon(props: IconProps) {
  return <Svg {...props}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></Svg>;
}

export function ImageIcon(props: IconProps) {
  return <Svg {...props}><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8" cy="10" r="1.5" /><path d="M21 16l-5-5L5 19" /></Svg>;
}

export function CloseIcon(props: IconProps) {
  return <Svg {...props}><path d="M18 6L6 18" /><path d="M6 6l12 12" /></Svg>;
}

export function SendIcon(props: IconProps) {
  return <Svg {...props}><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></Svg>;
}

export function PaperclipIcon(props: IconProps) {
  return <Svg {...props}><path d="M21.4 11.1l-9.2 9.1a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" /></Svg>;
}

export function GlobeIcon(props: IconProps) {
  return <Svg {...props}><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 0 20" /><path d="M12 2a15.3 15.3 0 0 0 0 20" /></Svg>;
}

export function MenuIcon(props: IconProps) {
  return <Svg {...props}><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></Svg>;
}

export function ArrowLeftIcon(props: IconProps) {
  return <Svg {...props}><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></Svg>;
}

export function QueueIcon(props: IconProps) {
  return <Svg {...props}><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><circle cx="3" cy="6" r="1" /><circle cx="3" cy="12" r="1" /><circle cx="3" cy="18" r="1" /></Svg>;
}

export function TrashIcon(props: IconProps) {
  return <Svg {...props}><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></Svg>;
}

export function EditIcon(props: IconProps) {
  return <Svg {...props}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></Svg>;
}

export function ChevronDownIcon(props: IconProps) {
  return <Svg {...props}><path d="M6 9l6 6 6-6" /></Svg>;
}

export function ChevronRightIcon(props: IconProps) {
  return <Svg {...props}><path d="M9 6l6 6-6 6" /></Svg>;
}
