import {
  Hexagon,
  Cloud,
  User,
  Sun,
  Briefcase,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Calendar,
  CheckCircle2,
  Sparkles,
  HardDrive,
  Table,
  FileText,
  Database,
  BookOpen,
  Plus,
  GitPullRequest,
  LayoutDashboard,
  ListTodo,
  Bot,
  Plug,
  Settings,
  Search,
  GripVertical,
  Check,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ArrowUpRight,
  Circle,
  CircleDot,
  KeyRound,
  Shield,
  Zap,
  Activity,
  Hand,
  X,
  Link2,
  SendHorizontal,
  Paperclip,
  AtSign,
  Landmark,
  Triangle,
  Clock,
  Grid3x3,
  MessageSquare,
  Mic,
  MicOff,
  CornerDownLeft,
  RefreshCcw,
  CheckCheck,
  Play,
  HelpCircle,
  Square,
  Trash2,
  Pencil,
  AlertCircle,
  House,
  Download,
  Loader2,
  Inbox,
  type LucideIcon,

} from "lucide-react";

/** Custom sheep icon (lucide has none) — matches the LucideIcon prop shape. */
function Sheep({
  size = 18,
  strokeWidth = 1.75,
  className,
  style,
  color,
}: {
  size?: number | string;
  strokeWidth?: number | string;
  className?: string;
  style?: React.CSSProperties;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? "currentColor"}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      {/* ears */}
      <path d="M7 12.4c-1.4.2-2.5 1-2.4 2.2" />
      <path d="M17 12.4c1.4.2 2.5 1 2.4 2.2" />
      {/* fluffy wool head */}
      <path d="M12 4.5c1.4 0 2.6.8 3.1 2 .2-.1.5-.1.7-.1 1.2 0 2.2.9 2.4 2 .9.2 1.6 1 1.6 2 0 .7-.4 1.4-.9 1.8.3.4.4.9.4 1.4 0 2.4-2.8 4.4-6.3 4.4S6.7 16 6.7 13.6c0-.5.1-1 .4-1.4-.5-.4-.9-1.1-.9-1.8 0-1 .7-1.8 1.6-2 .2-1.1 1.2-2 2.4-2 .2 0 .5 0 .7.1.5-1.2 1.7-2 3.1-2Z" />
      {/* eyes */}
      <path d="M10.4 12.6h.01" />
      <path d="M13.6 12.6h.01" />
    </svg>
  );
}

const REGISTRY: Record<string, LucideIcon> = {
  Hexagon,
  Cloud,
  Sheep: Sheep as unknown as LucideIcon,
  User,
  Sun,
  Briefcase,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Calendar,
  CheckCircle2,
  Sparkles,
  HardDrive,
  Table,
  FileText,
  Database,
  BookOpen,
  Plus,
  GitPullRequest,
  LayoutDashboard,
  ListTodo,
  Bot,
  Plug,
  Settings,
  Search,
  GripVertical,
  Check,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ArrowUpRight,
  Circle,
  CircleDot,
  KeyRound,
  Shield,
  Zap,
  Activity,
  Hand,
  X,
  Link2,
  SendHorizontal,
  Paperclip,
  AtSign,
  Landmark,
  Triangle,
  Clock,
  Grid3x3,
  MessageSquare,
  Mic,
  MicOff,
  CornerDownLeft,
  RefreshCcw,
  CheckCheck,
  Play,
  HelpCircle,
  Square,
  Trash2,
  Pencil,
  AlertCircle,
  House,
  Download,
  Loader: Loader2,
  Inbox,
};

export function Icon({
  name,
  className,
  size = 18,
  strokeWidth = 1.75,
  style,
  color,
}: {
  name: string;
  className?: string;
  size?: number;
  strokeWidth?: number;
  style?: React.CSSProperties;
  color?: string;
}) {
  const Cmp = REGISTRY[name] ?? Circle;
  return (
    <Cmp
      className={className}
      size={size}
      strokeWidth={strokeWidth}
      style={style}
      color={color}
    />
  );
}
