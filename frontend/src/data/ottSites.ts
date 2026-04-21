/** Preset OTT targets for quick pick in Control Center (labels + canonical URLs). */
export interface OttSitePreset {
  label: string;
  /** Optional hint under the title */
  subtitle?: string;
  url: string;
}

/** Curated list: picking one starts a scan with the selected URL. */
export const OTT_SITES: OttSitePreset[] = [
  { label: 'Netflix', url: 'https://www.netflix.com/' },
  { label: 'Prime Video', subtitle: 'Amazon Prime Video', url: 'https://www.primevideo.com/' },
  { label: 'JioHotstar', subtitle: 'Disney+ Hotstar', url: 'https://www.hotstar.com/' },
  { label: 'Sony LIV', url: 'https://www.sonyliv.com/' },
  { label: 'ZEE5', url: 'https://www.zee5.com/' },
  { label: 'MX Player', url: 'https://www.mxplayer.in/' },
  { label: 'Airtel Xstream', url: 'https://www.airtelxstream.in/' },
  { label: 'Tata Play', url: 'https://www.tataplay.com/' },
  { label: 'Tata Play Binge', url: 'https://www.tataplaybinge.com/' },
  { label: 'discovery+', url: 'https://www.discoveryplus.in/' },
  { label: 'Apple TV', subtitle: 'Apple TV+ (web)', url: 'https://tv.apple.com/' },
  { label: 'YuppTV', subtitle: 'Fast TV', url: 'https://www.yupptv.com/fast-tv' },
  { label: 'Hungama', url: 'https://www.hungama.com/' },
];
