
import type { Config } from "tailwindcss";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
		extend: {
			screens: {
				// Extra-small breakpoint (480px) — between stock mobile and
				// sm:640. Lets us pack 3-col KPI grids once we have enough
				// width without forcing 2-col on 375px iPhone SE.
				xs: '480px',
			},
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				},
				conve: {
					red: '#B91C1C', // [legacy] Deep red for CTAs and icons
					gold: '#D4AF37', // [legacy] Gold accent color
					black: '#111111', // Rich black for text
					light: '#F9F9F9', // Light background shade
					'red-light': '#FEF2F2', // Light red background
					'red-dark': '#991B1B', // Dark red variant
				},
				// ─── BRAND SYSTEM v2 (rack-card aesthetic, 2026-05) ──────────
				// Source of truth: business card + rack card design language.
				// Use these tokens going forward — `conve.*` legacy tokens are
				// preserved so existing pages don't visually shift until each
				// surface is intentionally migrated. Once every page migrates,
				// the legacy tokens can be deleted.
				brand: {
					// Burgundy — deep wine red. Primary CTA, headers, accent blocks.
					burgundy: {
						DEFAULT: '#7F1D1D',
						deep:    '#5C1414',
						darker:  '#3F0A0A',
						soft:    '#A02828', // for hover states on light backgrounds
					},
					// Gold — warm muted champagne. Dividers, accent text, italics.
					gold: {
						DEFAULT: '#C9A961',
						deep:    '#B8924A',
						soft:    '#DDC586', // for soft glow / borders
					},
					// Cream — warm off-white. NEVER pure #FFFFFF for backgrounds.
					cream: {
						DEFAULT: '#F8F4ED',
						soft:    '#FBF8F2',
						warm:    '#F0EAE0',
					},
					charcoal: '#0F0F10',     // body text on cream
					'gray-warm': '#6B5E54',  // secondary text
				}
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)',
				'2xl': '1.5rem',
				'3xl': '2rem',
			},
			keyframes: {
				'accordion-down': {
					from: {
						height: '0'
					},
					to: {
						height: 'var(--radix-accordion-content-height)'
					}
				},
				'accordion-up': {
					from: {
						height: 'var(--radix-accordion-content-height)'
					},
					to: {
						height: '0'
					}
				},
				'pulse-gentle': {
					'0%, 100%': { opacity: '1' },
					'50%': { opacity: '0.85' }
				},
				'luxury-float': {
					'0%, 100%': { transform: 'translateY(0px)' },
					'50%': { transform: 'translateY(-8px)' }
				},
				'luxury-fade-in': {
					'0%': { opacity: '0', transform: 'translateY(20px)' },
					'100%': { opacity: '1', transform: 'translateY(0)' }
				},
				'luxury-scale-in': {
					'0%': { transform: 'scale(0.9)', opacity: '0' },
					'100%': { transform: 'scale(1)', opacity: '1' }
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				'pulse-gentle': 'pulse-gentle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
				'luxury-float': 'luxury-float 3s ease-in-out infinite',
				'luxury-fade-in': 'luxury-fade-in 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
				'luxury-scale-in': 'luxury-scale-in 0.6s cubic-bezier(0.165, 0.84, 0.44, 1) forwards'
			},
			fontFamily: {
				lato: ['Lato', 'sans-serif'],
				montserrat: ['Montserrat', 'sans-serif'],
				inter: ['Inter', 'sans-serif'],
				playfair: ['Playfair Display', 'serif'],
			},
			boxShadow: {
				'luxury': '0 8px 32px rgba(0, 0, 0, 0.08), 0 4px 16px rgba(0, 0, 0, 0.04)',
				'luxury-hover': '0 20px 64px rgba(0, 0, 0, 0.12), 0 8px 32px rgba(0, 0, 0, 0.08)',
				'luxury-red': '0 8px 24px rgba(185, 28, 28, 0.3)',
				'luxury-red-hover': '0 12px 32px rgba(185, 28, 28, 0.4)',
			},
			spacing: {
				'18': '4.5rem',
				'88': '22rem',
				'128': '32rem',
			}
		}
	},
	plugins: [require("tailwindcss-animate")],
} satisfies Config;
