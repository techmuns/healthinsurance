import {
  TrendingUp,
  PieChart,
  Scale,
  ShieldCheck,
  Percent,
  Gauge,
  Building2,
  Users,
  Network,
  Landmark,
  Compass,
  MessageSquareQuote,
  Newspaper,
  LayoutDashboard,
  Home,
  BarChart3,
  ClipboardCheck,
  type LucideIcon,
} from 'lucide-react'

export type IconKey =
  | 'growth'
  | 'share'
  | 'ratio'
  | 'shield'
  | 'returns'
  | 'valuation'
  | 'market'
  | 'distribution'
  | 'capital'
  | 'peers'
  | 'ownership'
  | 'commentary'
  | 'events'
  | 'overview'
  | 'home'
  | 'analytics'
  | 'audit'

export const iconMap: Record<IconKey, LucideIcon> = {
  growth: TrendingUp,
  share: PieChart,
  ratio: Scale,
  shield: ShieldCheck,
  returns: Percent,
  valuation: Gauge,
  market: Building2,
  distribution: Network,
  capital: Landmark,
  peers: Users,
  ownership: Landmark,
  commentary: MessageSquareQuote,
  events: Newspaper,
  overview: LayoutDashboard,
  home: Home,
  analytics: BarChart3,
  audit: ClipboardCheck,
}

export function Icon({ name, className }: { name: IconKey; className?: string }) {
  const Cmp = iconMap[name] ?? Compass
  return <Cmp className={className} />
}
