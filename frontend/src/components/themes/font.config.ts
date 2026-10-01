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
 * Geist Pixel — the instrument face, used for large figures.
 *
 * Geist Pixel carries a single custom axis, `ELSH` (0–100), which changes the
 * SHAPE of the pixel elements rather than weight or width. Its six named stops
 * are Regular 0, Square 1, Circle 20, Grid 40, Triangle 60, Line 80.
 *
 * This file is a STATIC SUBSET at ELSH=20 (Circle), cut down to the 20 glyphs
 * the design actually sets in it — the digit figures and their punctuation.
 * That takes it from 3.49 MB to 83 KB, which matters because the font is
 * decoration: shipping the full variable font for three numbers would have
 * nearly doubled the site's page weight and cost real Core Web Vitals.
 *
 * To use a different stop, regenerate the subset from the original download
 * (see the note in src/fonts/):
 *
 *   python -m fontTools.varLib.instancer \
 *     GeistPixel-Regular-VariableFont_ELSH.ttf ELSH=40 -o static.ttf
 *   python -m fontTools.subset static.ttf \
 *     --text="0123456789.,%+-—·/ " --layout-features='' --no-hinting \
 *     --name-IDs=1,2,3,4,6 --drop-tables+=GSUB,GPOS,GDEF,meta \
 *     --output-file=src/fonts/GeistPixel-Grid.ttf
 *
 * Licensed under the SIL Open Font License; see src/fonts/OFL.txt.
 */
const fontGeistPixel = localFont({
  src: '../../fonts/GeistPixel-Circle.ttf',
  display: 'swap',
  // Decorative, and only used below the fold on one page: never block a render
  // on it. The fallback shows digits immediately and the face swaps in.
  preload: false,
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
