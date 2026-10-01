import {
  Architects_Daughter,
  DM_Sans,
  Fira_Code,
  Geist,
  Geist_Mono,
  Google_Sans_Flex,
  Instrument_Sans,
  Instrument_Serif,
  Inter,
  JetBrains_Mono,
  Merriweather,
  Mulish,
  Playfair_Display,
  Noto_Sans_Mono,
  Outfit,
  Source_Code_Pro,
  Space_Mono
} from 'next/font/google';
import localFont from 'next/font/local';

import { cn } from '@/lib/utils';

/**
 * Geist Pixel — the display face for headlines and instrument figures.
 *
 * Geist Pixel carries a single custom axis, `ELSH` (0–100), which changes the
 * SHAPE of the pixel elements rather than weight or width. Its six named stops
 * are Regular 0, Square 1, Circle 20, Grid 40, Triangle 60, Line 80.
 *
 * This file is a STATIC SUBSET at ELSH=20 (Circle) covering the full text
 * character set — 199 glyphs, Latin-1 punctuation included — so it can set
 * words and not just digits.
 *
 * SIZE, AND WHY THIS IS A WOFF2
 *
 * Uncompressed the ASCII range alone is 478 KB, which is what originally forced
 * this face down to the 19 digits-and-punctuation glyphs it used to ship as:
 * a 3.49 MB variable font is not worth it for three numbers. Compressed as
 * WOFF2 the full character set is 13.7 KB — smaller than the 82.5 KB
 * digits-only TTF it replaced. The browser gets more glyphs and less to
 * download. Ship the woff2; never the ttf.
 *
 * To use a different stop, regenerate from the original download:
 *
 *   python -m fontTools.varLib.instancer \
 *     GeistPixel-Regular-VariableFont_ELSH.ttf ELSH=40 -o static.ttf
 *   python -m fontTools.subset static.ttf \
 *     --unicodes="U+0020-007E,U+00A0-00FF,U+2018-201D,U+2013-2014,U+2026,U+00B7" \
 *     --layout-features='' --no-hinting --name-IDs=1,2,3,4,6 \
 *     --drop-tables+=GSUB,GPOS,GDEF,meta --output-file=GeistPixel-Grid.ttf
 *
 *   # then, with brotli installed, convert to woff2 — this is the step that
 *   # matters, and skipping it costs a factor of thirty
 *   python -c "from fontTools.ttLib import TTFont; \
 *     f=TTFont('GeistPixel-Grid.ttf'); f.flavor='woff2'; f.save('GeistPixel-Grid.woff2')"
 *
 * Licensed under the SIL Open Font License; see src/fonts/OFL.txt.
 */
const fontGeistPixel = localFont({
  src: '../../fonts/GeistPixel-Circle.woff2',
  display: 'swap',
  // Above the fold now — this sets the hero headline, so it is part of the
  // first paint rather than below-fold decoration. It is 13.7 KB, which is
  // cheaper than the layout shift that a swap on the largest text on the page
  // would cost.
  variable: '--font-geist-pixel',
  fallback: ['ui-monospace', 'monospace']
});

const fontSans = Geist({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans'
});

const fontMono = Geist_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono'
});

const fontGoogleSansFlex = Google_Sans_Flex({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--font-google-sans-flex'
});

const fontSourceCodePro = Source_Code_Pro({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--font-source-code-pro'
});

const fontInstrument = Instrument_Sans({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--font-instrument'
});

// Display face for the public surfaces. Instrument Serif ships a single
// weight, so it must be declared explicitly — there is no variable axis.
const fontInstrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-instrument-serif'
});

const fontNotoMono = Noto_Sans_Mono({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--font-noto-mono'
});

const fontMullish = Mulish({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--font-mullish'
});

const fontInter = Inter({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--font-inter'
});

const fontArchitectsDaughter = Architects_Daughter({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  preload: false,
  variable: '--font-architects-daughter'
});

const fontDMSans = DM_Sans({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--font-dm-sans'
});

const fontFiraCode = Fira_Code({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--font-fira-code'
});

const fontOutfit = Outfit({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--font-outfit'
});

const fontSpaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
  preload: false,
  variable: '--font-space-mono'
});

const fontJetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono'
});

const fontMerriweather = Merriweather({
  subsets: ['latin'],
  weight: ['300', '400', '700'],
  display: 'swap',
  preload: false,
  variable: '--font-merriweather'
});

const fontPlayfairDisplay = Playfair_Display({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--font-playfair-display'
});

export const fontVariables = cn(
  fontSans.variable,
  fontMono.variable,
  fontGoogleSansFlex.variable,
  fontSourceCodePro.variable,
  fontInstrument.variable,
  fontInstrumentSerif.variable,
  fontGeistPixel.variable,
  fontNotoMono.variable,
  fontMullish.variable,
  fontInter.variable,
  fontArchitectsDaughter.variable,
  fontDMSans.variable,
  fontFiraCode.variable,
  fontOutfit.variable,
  fontSpaceMono.variable,
  fontJetBrainsMono.variable,
  fontMerriweather.variable,
  fontPlayfairDisplay.variable
);
