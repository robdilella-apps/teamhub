// All branding lives here. Override any value with a VITE_* variable in .env.
const env = import.meta.env

export const brand = {
  appName: env.VITE_APP_NAME || 'TeamHub',
  companyName: env.VITE_COMPANY_NAME || 'Sample Business Co',
  tagline: env.VITE_TAGLINE || 'Team chat for your business',
  color: env.VITE_BRAND_COLOR || '#4f46e5',
  logo: '/logo.svg',
  locationLabel: env.VITE_LOCATION_LABEL || 'Location',
  kudosCategories: ['teamwork', 'above_and_beyond', 'customer_love', 'hustle'],
  reactions: ['👍', '❤️', '🎉', '😂', '👀', '✅'],
}

export function applyBrandColor() {
  const hex = brand.color.replace('#', '')
  const n = parseInt(hex.length === 3 ? hex.split('').map((c: string) => c + c).join('') : hex, 16)
  document.documentElement.style.setProperty('--brand', `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`)
  document.title = brand.appName
}
