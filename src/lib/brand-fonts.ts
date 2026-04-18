// Curated shortlist of Google Fonts used by the Brand DNA font picker.
// Grouped by category so brands can filter quickly instead of typing exact
// names. Display names match the Google Fonts family exactly so the preview
// stylesheet URL resolves on @import.

export type FontCategory = 'sans' | 'serif' | 'display' | 'handwriting' | 'mono'

export interface BrandFont {
  name: string
  category: FontCategory
}

export const BRAND_FONTS: BrandFont[] = [
  // Sans-serif
  { name: 'Inter', category: 'sans' },
  { name: 'Roboto', category: 'sans' },
  { name: 'Open Sans', category: 'sans' },
  { name: 'Lato', category: 'sans' },
  { name: 'Montserrat', category: 'sans' },
  { name: 'Poppins', category: 'sans' },
  { name: 'Source Sans 3', category: 'sans' },
  { name: 'Nunito', category: 'sans' },
  { name: 'Nunito Sans', category: 'sans' },
  { name: 'Work Sans', category: 'sans' },
  { name: 'Raleway', category: 'sans' },
  { name: 'DM Sans', category: 'sans' },
  { name: 'Mulish', category: 'sans' },
  { name: 'Rubik', category: 'sans' },
  { name: 'Karla', category: 'sans' },
  { name: 'Archivo', category: 'sans' },
  { name: 'Manrope', category: 'sans' },
  { name: 'Plus Jakarta Sans', category: 'sans' },
  { name: 'Barlow', category: 'sans' },
  { name: 'Quicksand', category: 'sans' },
  { name: 'Urbanist', category: 'sans' },
  { name: 'Outfit', category: 'sans' },
  { name: 'PT Sans', category: 'sans' },
  { name: 'Josefin Sans', category: 'sans' },
  { name: 'Cabin', category: 'sans' },
  { name: 'Dosis', category: 'sans' },
  { name: 'Varela Round', category: 'sans' },
  { name: 'Comfortaa', category: 'sans' },
  { name: 'Kanit', category: 'sans' },
  { name: 'Exo 2', category: 'sans' },
  { name: 'Asap', category: 'sans' },
  { name: 'Prompt', category: 'sans' },
  { name: 'Oxygen', category: 'sans' },
  { name: 'Ubuntu', category: 'sans' },
  { name: 'Signika', category: 'sans' },
  { name: 'Titillium Web', category: 'sans' },

  // Serif
  { name: 'Playfair Display', category: 'serif' },
  { name: 'Merriweather', category: 'serif' },
  { name: 'Lora', category: 'serif' },
  { name: 'Libre Baskerville', category: 'serif' },
  { name: 'PT Serif', category: 'serif' },
  { name: 'Crimson Text', category: 'serif' },
  { name: 'EB Garamond', category: 'serif' },
  { name: 'Cormorant', category: 'serif' },
  { name: 'Bitter', category: 'serif' },
  { name: 'Source Serif 4', category: 'serif' },
  { name: 'Literata', category: 'serif' },
  { name: 'DM Serif Display', category: 'serif' },
  { name: 'Fraunces', category: 'serif' },

  // Display
  { name: 'Bebas Neue', category: 'display' },
  { name: 'Abril Fatface', category: 'display' },
  { name: 'Oswald', category: 'display' },
  { name: 'Anton', category: 'display' },
  { name: 'Fjalla One', category: 'display' },
  { name: 'Yanone Kaffeesatz', category: 'display' },
  { name: 'Archivo Black', category: 'display' },
  { name: 'Alfa Slab One', category: 'display' },
  { name: 'Righteous', category: 'display' },
  { name: 'Space Grotesk', category: 'display' },
  { name: 'Syne', category: 'display' },
  { name: 'Monoton', category: 'display' },

  // Handwriting / Script
  { name: 'Caveat', category: 'handwriting' },
  { name: 'Pacifico', category: 'handwriting' },
  { name: 'Dancing Script', category: 'handwriting' },
  { name: 'Kalam', category: 'handwriting' },
  { name: 'Shadows Into Light', category: 'handwriting' },

  // Monospace
  { name: 'JetBrains Mono', category: 'mono' },
  { name: 'Fira Code', category: 'mono' },
  { name: 'Space Mono', category: 'mono' },
  { name: 'IBM Plex Mono', category: 'mono' },
  { name: 'Roboto Mono', category: 'mono' },
  { name: 'Source Code Pro', category: 'mono' },
]

export const FONT_CATEGORY_LABELS: Record<FontCategory, string> = {
  sans: 'Sans-serif',
  serif: 'Serif',
  display: 'Display',
  handwriting: 'Handwriting',
  mono: 'Monospace',
}

/** Build a Google Fonts @import URL for previewing a list of families. */
export function googleFontsPreviewUrl(families: string[]): string {
  if (families.length === 0) return ''
  const params = families
    .map((name) => 'family=' + encodeURIComponent(name).replace(/%20/g, '+'))
    .join('&')
  return `https://fonts.googleapis.com/css2?${params}&display=swap`
}
