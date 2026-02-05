import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { title?: string };

function IconBase({
  children,
  title,
  ...props
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m6 9 6 6 6-6" />
    </IconBase>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </IconBase>
  );
}

export function LayoutDashboardIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="10" width="7" height="11" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </IconBase>
  );
}

export function CameraIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M9 3h6l1.5 2H21a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4.5z" />
      <circle cx="12" cy="13" r="3.5" />
    </IconBase>
  );
}

export function InboxIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5 7l2-3h10l2 3v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" />
    </IconBase>
  );
}

export function FileTextIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h8" />
      <path d="M8 9h3" />
    </IconBase>
  );
}

export function CheckCircleIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </IconBase>
  );
}

export function ArrowLeftRightIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M8 3 4 7l4 4" />
      <path d="M4 7h16" />
      <path d="m16 21 4-4-4-4" />
      <path d="M20 17H4" />
    </IconBase>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </IconBase>
  );
}

export function BarChart3Icon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-7" />
    </IconBase>
  );
}

export function PlugIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 2v6" />
      <path d="M8 2v6" />
      <path d="M16 2v6" />
      <path d="M7 8h10" />
      <path d="M9 8v6a3 3 0 0 0 6 0V8" />
      <path d="M12 17v5" />
    </IconBase>
  );
}

export function Building2Icon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18" />
      <path d="M6 12h12" />
      <path d="M10 6h1" />
      <path d="M10 10h1" />
      <path d="M10 14h1" />
      <path d="M14 6h1" />
      <path d="M14 10h1" />
      <path d="M14 14h1" />
    </IconBase>
  );
}

export function Wand2Icon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m21 7-9 9" />
      <path d="M12 7l2 2" />
      <path d="M7 12l2 2" />
      <path d="m3 21 9-9" />
      <path d="M16 3l1 1" />
      <path d="M3 16l1 1" />
    </IconBase>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
      <path d="M19.4 15a7.8 7.8 0 0 0 .1-2l2-1.2-2-3.5-2.3.5a7.2 7.2 0 0 0-1.7-1L15 2h-6l-.5 2.8a7.2 7.2 0 0 0-1.7 1L4.5 5.3l-2 3.5L4.5 10a7.8 7.8 0 0 0 0 2L2.5 13.2l2 3.5 2.3-.5a7.2 7.2 0 0 0 1.7 1L9 22h6l.5-2.8a7.2 7.2 0 0 0 1.7-1l2.3.5 2-3.5z" />
    </IconBase>
  );
}

