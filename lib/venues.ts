import { compactPostcode } from "@/lib/geo"

export type Venue = {
  id: string
  name: string
  address: string
  postcode: string
  latitude: number
  longitude: number
  /** Outward codes this room belongs to. */
  postcodes: string[]
  areaIds: string[]
  aliases: string[]
  website: string | null
  note: string
}

/**
 * Real rooms, checked against the venues' own sites in October 2026.
 * Coordinates are the OpenStreetMap point where one existed, otherwise the
 * unit postcode centroid from postcodes.io. Pryzm Kingston (154 Clarence
 * Street, KT1 1QP) closed in July 2025, and a current Hippodrome music room
 * could not be verified, so neither is listed.
 */
const VENUES: Venue[] = [
  {
    id: "bulls-head",
    name: "The Bull's Head",
    address: "373 Lonsdale Road, Barnes, London",
    postcode: "SW13 9PY",
    latitude: 51.47379,
    longitude: -0.25106,
    postcodes: ["SW13"],
    areaIds: ["barnes", "richmond-borough"],
    aliases: ["Bull's Head", "Bulls Head"],
    website: "https://www.thebullsheadbarnes.com/",
    note: "Jazz room on the river at Barnes Bridge.",
  },
  {
    id: "oso",
    name: "OSO Arts Centre",
    address: "49 Station Road, Barnes, London",
    postcode: "SW13 0LF",
    latitude: 51.47228,
    longitude: -0.24662,
    postcodes: ["SW13"],
    areaIds: ["barnes", "richmond-borough"],
    aliases: ["OSO Arts Centre", "Old Sorting Office"],
    website: "https://www.osoarts.org.uk/",
    note: "Theatre and music on Barnes Green, in the old sorting office.",
  },
  {
    id: "half-moon",
    name: "The Half Moon",
    address: "93 Lower Richmond Road, Putney, London",
    postcode: "SW15 1EU",
    latitude: 51.46726,
    longitude: -0.22007,
    postcodes: ["SW15"],
    areaIds: ["putney", "wandsworth-borough"],
    aliases: ["Half Moon", "Half Moon Putney"],
    website: "https://www.halfmoon.co.uk/",
    note: "Putney live-music pub.",
  },
  {
    id: "fighting-cocks",
    name: "The Fighting Cocks",
    address: "56 Old London Road, Kingston upon Thames",
    postcode: "KT2 6QA",
    latitude: 51.41068,
    longitude: -0.29783,
    postcodes: ["KT2"],
    areaIds: ["kingston", "norbiton", "kingston-borough"],
    aliases: ["Fighting Cocks"],
    website: "https://the-fighting-cocks.co.uk/",
    note: "Kingston music pub. The site also writes the street as London Road; the postcode is KT2 6QA.",
  },
  {
    id: "banquet-records",
    name: "Banquet Records",
    address: "52 Eden Street, Kingston upon Thames",
    postcode: "KT1 1EE",
    latitude: 51.40916,
    longitude: -0.3032,
    postcodes: ["KT1"],
    areaIds: ["kingston", "kingston-borough"],
    aliases: ["Banquet Records"],
    website: "https://www.banquetrecords.com/",
    note: "Kingston record shop that puts on in-store shows.",
  },
  {
    id: "richmond-theatre",
    name: "Richmond Theatre",
    address: "The Green, Richmond, London",
    postcode: "TW9 1QJ",
    latitude: 51.46207,
    longitude: -0.3038,
    postcodes: ["TW9"],
    areaIds: ["richmond", "richmond-borough"],
    aliases: ["Richmond Theatre"],
    website: "https://www.atgtickets.com/venues/richmond-theatre/",
    note: "Matcham theatre on Richmond Green. Music listings are whatever the gig feeds return for this building.",
  },
  {
    id: "eel-pie",
    name: "Eel Pie Club at The Cabbage Patch",
    address: "67 London Road, Twickenham",
    postcode: "TW1 3SZ",
    latitude: 51.4488,
    longitude: -0.32988,
    postcodes: ["TW1"],
    areaIds: ["richmond-borough"],
    aliases: ["Eel Pie Club", "Cabbage Patch"],
    website: "https://www.eelpieclub.com/",
    note: "Rhythm and blues club upstairs at The Cabbage Patch in Twickenham. TW1 is in the Richmond borough, outside the TW9 and TW10 catalogue districts.",
  },
  {
    id: "exchange",
    name: "The Exchange",
    address: "75 London Road, Twickenham",
    postcode: "TW1 1BE",
    latitude: 51.45004,
    longitude: -0.33132,
    postcodes: ["TW1"],
    areaIds: ["richmond-borough"],
    aliases: ["Exchange Twickenham", "The Exchange Twickenham"],
    website: "https://www.exchangetwickenham.co.uk/",
    note: "Twickenham theatre and live-music room opposite the station.",
  },
  {
    id: "new-wimbledon-theatre",
    name: "New Wimbledon Theatre",
    address: "93 The Broadway, Wimbledon, London",
    postcode: "SW19 1QG",
    latitude: 51.41922,
    longitude: -0.20142,
    postcodes: ["SW19"],
    areaIds: ["wimbledon"],
    aliases: ["New Wimbledon Theatre", "Wimbledon Theatre"],
    website: "https://www.atgtickets.com/venues/new-wimbledon-theatre/",
    note: "Wimbledon theatre. Concerts show up here when a listing feed files them as music.",
  },
  {
    id: "bedford",
    name: "The Bedford",
    address: "77 Bedford Hill, Balham, London",
    postcode: "SW12 9HD",
    latitude: 51.44272,
    longitude: -0.14936,
    postcodes: ["SW12"],
    areaIds: ["wandsworth-borough"],
    aliases: ["The Bedford", "Bedford Balham"],
    website: "https://thebedford.com/",
    note: "Balham music and comedy room in the Wandsworth borough. SW12 is not one of the catalogue postcodes, so it stays on the borough page.",
  },
]

export function venues(): Venue[] {
  return VENUES
}

export function venueById(id: string): Venue | undefined {
  return VENUES.find((venue) => venue.id === id)
}

export function venuePath(id: string): string {
  return `/venue/${id}`
}

export function samePostcode(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = compactPostcode(left)
  const b = compactPostcode(right)
  return Boolean(a && b && a === b)
}
