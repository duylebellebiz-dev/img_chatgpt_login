function base(props) {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    ...props,
  };
}

export function UploadIcon(props) {
  return (
    <svg {...base(props)}>
      <path d="M12 15V4" />
      <path d="M8 8l4-4 4 4" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

export function XIcon(props) {
  return (
    <svg {...base(props)}>
      <path d="M18 6 6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

export function SparklesIcon(props) {
  return (
    <svg {...base(props)}>
      <path d="M9.5 3v3M9.5 3H6.5M9.5 3H12.5" strokeWidth="0" fill="none" />
      <path
        d="M9.5 2.5 10.6 5.4 13.5 6.5 10.6 7.6 9.5 10.5 8.4 7.6 5.5 6.5 8.4 5.4 9.5 2.5Z"
        fill="currentColor"
        stroke="none"
      />
      <path
        d="M17 12.5 17.8 14.6 19.9 15.4 17.8 16.2 17 18.3 16.2 16.2 14.1 15.4 16.2 14.6 17 12.5Z"
        fill="currentColor"
        stroke="none"
      />
      <path
        d="M14 3.5 14.5 4.9 15.9 5.4 14.5 5.9 14 7.3 13.5 5.9 12.1 5.4 13.5 4.9 14 3.5Z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

export function ImagesIcon(props) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="3" width="13" height="13" rx="2.5" />
      <path d="m3 13 3.5-3.5a1.5 1.5 0 0 1 2.1 0L13 13.5" />
      <circle cx="7.2" cy="7" r="1.1" fill="currentColor" stroke="none" />
      <path d="M19 8v9a2.5 2.5 0 0 1-2.5 2.5H8" />
    </svg>
  );
}

export function CheckCircleIcon(props) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.3 2.3 2.3 4.7-4.7" />
    </svg>
  );
}

export function XCircleIcon(props) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="m9.5 9.5 5 5" />
      <path d="m14.5 9.5-5 5" />
    </svg>
  );
}

export function AlertIcon(props) {
  return (
    <svg {...base(props)}>
      <path d="M12 3.5 21.5 20h-19L12 3.5Z" />
      <path d="M12 9.5v4" />
      <circle cx="12" cy="16.7" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function DownloadIcon(props) {
  return (
    <svg {...base(props)}>
      <path d="M12 4v11" />
      <path d="M8 11.5 12 15.5 16 11.5" />
      <path d="M4 16.5v2.5A1.5 1.5 0 0 0 5.5 20.5h13a1.5 1.5 0 0 0 1.5-1.5v-2.5" />
    </svg>
  );
}

export function TrashIcon(props) {
  return (
    <svg {...base(props)}>
      <path d="M4.5 6.5h15" />
      <path d="M9 6.5V4.75A1.25 1.25 0 0 1 10.25 3.5h3.5A1.25 1.25 0 0 1 15 4.75V6.5" />
      <path d="M6.5 6.5 7.3 19a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12.5" />
    </svg>
  );
}

export function BellIcon(props) {
  return (
    <svg {...base(props)}>
      <path d="M6 10.5a6 6 0 0 1 12 0v4l1.5 2.5h-15L6 14.5v-4Z" />
      <path d="M10 19.5a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function LinkIcon(props) {
  return (
    <svg {...base(props)}>
      <path d="M9.5 14.5 14.5 9.5" />
      <path d="M11 6.5 12.6 4.9a3.2 3.2 0 0 1 4.5 4.5L15.5 11" />
      <path d="M13 17.5 11.4 19.1a3.2 3.2 0 0 1-4.5-4.5L8.5 13" />
    </svg>
  );
}

export function CalendarIcon(props) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3v3.5M16 3v3.5" />
    </svg>
  );
}

export function ChevronLeftIcon(props) {
  return (
    <svg {...base(props)}>
      <path d="M15 5.5 8.5 12l6.5 6.5" />
    </svg>
  );
}

export function ChevronRightIcon(props) {
  return (
    <svg {...base(props)}>
      <path d="M9 5.5 15.5 12 9 18.5" />
    </svg>
  );
}

export function FolderIcon(props) {
  return (
    <svg {...base(props)}>
      <path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h4l2 2h7A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-11Z" />
    </svg>
  );
}

export function ChartIcon(props) {
  return (
    <svg {...base(props)}>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M8 20v-6" />
      <path d="M12.5 20V9" />
      <path d="M17 20v-9" />
    </svg>
  );
}

export function Spinner(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={props.className}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
