import { clsx, type ClassValue } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function formatINR(value: number): string {
  if (value >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(2)} Cr`
  if (value >= 1_00_000) return `₹${(value / 1_00_000).toFixed(1)} L`
  return `₹${value.toLocaleString('en-IN')}`
}

export function daysAgo(dateStr: string): string {
  const diff = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)
  )
  if (diff === 0) return 'today'
  if (diff === 1) return 'yesterday'
  return `${diff} days ago`
}

export function getVerticalColor(vertical: string): string {
  const map: Record<string, string> = {
    'Industry': '#1E3A6B',
    'Marine': '#0E5550',
    'Vehicles': '#B8541E',
    'Small DG': '#4A7920',
    'Cross-vertical': '#5B3B6F',
  }
  return map[vertical] ?? '#6A675F'
}

export function getVerticalSoft(vertical: string): string {
  const map: Record<string, string> = {
    'Industry': '#D4DEED',
    'Marine': '#D5E5E3',
    'Vehicles': '#F2DCC6',
    'Small DG': '#DDE9C9',
    'Cross-vertical': '#E2D8EB',
  }
  return map[vertical] ?? '#E8E3D2'
}