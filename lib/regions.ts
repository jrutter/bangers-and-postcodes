import type { ArtistRecord } from "@/lib/types"
import { postcodeArea } from "@/lib/districts"

export type PostcodeAreaInfo = {
  code: string
  name: string
  knownFor: string
  gettingThere: string
}

export type Region = {
  id: string
  name: string
  group: "inner" | "outer"
  intro: string
  knownFor: string
  areas: PostcodeAreaInfo[]
}

/**
 * London, then a region, then a postcode district.
 * Inner regions are one compass postcode area, except Central, which is EC and WC.
 * Outer regions group the Greater London districts whose letters sit outside that compass
 * (EN, HA, UB, TW, KT, CR, SM, BR, DA, IG, RM). No WD district falls inside Greater London.
 */
export const REGIONS: Region[] = [
  {
    id: "central",
    name: "Central London",
    group: "inner",
    intro:
      "The middle of the map: the City of London and the West End districts in EC and WC. Walkable, busy at night, and full of rooms a visitor can reach from one Tube stop.",
    knownFor: "Theatre pits, Soho and Covent Garden, jazz basements, and the Barbican.",
    areas: [
      {
        code: "EC",
        name: "City of London",
        knownFor: "The Barbican, Smithfield's clubs, and the City's smaller rooms.",
        gettingThere:
          "Circle, District, Central, Northern, and the Elizabeth line. Useful stations: Liverpool Street, Bank, Moorgate, Farringdon, and St Paul's.",
      },
      {
        code: "WC",
        name: "West Central",
        knownFor: "Covent Garden, theatreland, and the Bloomsbury edge of the West End.",
        gettingThere:
          "Piccadilly, Northern, and Central lines. Useful stations: Covent Garden, Leicester Square, Tottenham Court Road, Holborn, and Charing Cross.",
      },
    ],
  },
  {
    id: "north",
    name: "North London",
    group: "inner",
    intro:
      "The N districts, from Angel and Highbury up through Finsbury Park to Tottenham and the northern suburbs. A mix of small venues and a long musical history.",
    knownFor: "Tottenham, Highbury, and Finsbury Park: soul, grime, and indie pub rooms.",
    areas: [
      {
        code: "N",
        name: "North",
        knownFor: "Pub gigs and the scenes around Highbury, Finsbury Park, Muswell Hill, and Tottenham.",
        gettingThere:
          "Victoria line to Finsbury Park and Highbury & Islington, Piccadilly line through Arsenal and Bounds Green, Northern line on the High Barnet branch. National Rail from Finsbury Park, Alexandra Palace, and Seven Sisters.",
      },
    ],
  },
  {
    id: "northwest",
    name: "Northwest London",
    group: "inner",
    intro:
      "The NW districts: Camden, St John's Wood, Kilburn, Hampstead, and on towards Wembley Park. This is the part of town most visitors already have on a list.",
    knownFor: "Camden's venues, Abbey Road, and the rooms through Kilburn and Hampstead.",
    areas: [
      {
        code: "NW",
        name: "Northwest",
        knownFor: "Camden Town, the Roundhouse end of Chalk Farm, and Abbey Road in St John's Wood.",
        gettingThere:
          "Northern line to Camden Town, Chalk Farm, and Hampstead. Jubilee line to St John's Wood and Kilburn. Metropolitan line to Wembley Park. Bakerloo to Kilburn Park.",
      },
    ],
  },
  {
    id: "west",
    name: "West London",
    group: "inner",
    intro:
      "The W districts, from Soho's western streets and Notting Hill out through Shepherd's Bush to Ealing and Hammersmith.",
    knownFor: "Notting Hill, Shepherd's Bush Empire, and Hammersmith Apollo.",
    areas: [
      {
        code: "W",
        name: "West",
        knownFor: "Carnival sound in Notting Hill, plus the Empire and the Apollo.",
        gettingThere:
          "Central line to Notting Hill Gate, Shepherd's Bush, and Ealing Broadway. District, Circle, and Hammersmith & City to Paddington and Hammersmith. Piccadilly line through Earl's Court.",
      },
    ],
  },
  {
    id: "southwest",
    name: "Southwest London",
    group: "inner",
    intro:
      "The SW districts, from Chelsea and Battersea down through Clapham, Brixton, Putney, and Wimbledon. This week's bills for these districts are on this page.",
    knownFor: "Brixton, the Putney Half Moon, and a long pub-gig circuit out to Wimbledon.",
    areas: [
      {
        code: "SW",
        name: "Southwest",
        knownFor: "Brixton and Clapham nights, Putney's Half Moon, and the Wimbledon theatres.",
        gettingThere:
          "District line to Putney Bridge, East Putney, and Wimbledon. Northern line to Clapham and Balham. South Western Railway and the Overground via Clapham Junction, Putney, Barnes, and Richmond.",
      },
    ],
  },
  {
    id: "southeast",
    name: "Southeast London",
    group: "inner",
    intro:
      "The SE districts: Borough and London Bridge, Deptford, Peckham, Greenwich, Lewisham, and the peninsula.",
    knownFor: "Deptford and Peckham's small rooms, Greenwich, and the O2.",
    areas: [
      {
        code: "SE",
        name: "Southeast",
        knownFor: "Peckham and Deptford venues, plus Greenwich and the O2 at North Greenwich.",
        gettingThere:
          "Jubilee line to London Bridge, Bermondsey, and North Greenwich. National Rail from London Bridge, Cannon Street, and Charing Cross to Greenwich, Lewisham, and New Cross. Overground through Peckham and Deptford.",
      },
    ],
  },
  {
    id: "east",
    name: "East London",
    group: "inner",
    intro:
      "The E districts: Shoreditch, Whitechapel, Bethnal Green, Bow, Hackney's eastern streets, and Stratford.",
    knownFor: "Grime's home turf, from Bow and Stratford back to the Shoreditch rooms.",
    areas: [
      {
        code: "E",
        name: "East",
        knownFor: "Shoreditch, Bethnal Green, Bow, and Stratford.",
        gettingThere:
          "Central line to Bethnal Green and Stratford. District, and Hammersmith & City, to Whitechapel and Mile End. Elizabeth line to Liverpool Street and Stratford. Overground and the DLR fill in the gaps.",
      },
    ],
  },
  {
    id: "outer-north",
    name: "Outer North",
    group: "outer",
    intro: "Enfield's EN districts that sit inside Greater London. Quieter than the inner N postcodes, with pubs and local bills rather than a destination strip.",
    knownFor: "Enfield's pubs and a handful of local stages.",
    areas: [
      {
        code: "EN",
        name: "Enfield",
        knownFor: "Local rooms in Enfield, south of the M25.",
        gettingThere:
          "National Rail from Liverpool Street and Moorgate to Enfield Town and Enfield Chase. Oakwood, on the Piccadilly line, is the nearest Tube.",
      },
    ],
  },
  {
    id: "outer-northwest",
    name: "Outer Northwest",
    group: "outer",
    intro: "Harrow's HA districts, including the Wembley postcodes that use HA. One big arena and a suburban circuit around it.",
    knownFor: "Wembley's arena and stadium, and Harrow's smaller rooms.",
    areas: [
      {
        code: "HA",
        name: "Harrow",
        knownFor: "OVO Arena Wembley and Wembley Stadium sit in HA9.",
        gettingThere:
          "Metropolitan line to Harrow-on-the-Hill and Wembley Park. Bakerloo and Overground to Harrow & Wealdstone. Chiltern Railways from Marylebone.",
      },
    ],
  },
  {
    id: "outer-west",
    name: "Outer West",
    group: "outer",
    intro: "Hillingdon's UB districts, from Uxbridge to Hayes. A long ride, and the reward is a local room rather than a famous strip.",
    knownFor: "Local pubs and halls around Uxbridge and Hayes.",
    areas: [
      {
        code: "UB",
        name: "Uxbridge",
        knownFor: "Suburban bills in Uxbridge and Hayes.",
        gettingThere:
          "Metropolitan and Piccadilly lines to Uxbridge. Elizabeth line to Hayes & Harlington. Central line to West Ruislip for the north of the area.",
      },
    ],
  },
  {
    id: "outer-southwest",
    name: "Outer Southwest",
    group: "outer",
    intro:
      "Twickenham, Hounslow, and Kingston: the TW and KT districts inside Greater London. Eel Pie's story starts here, and Kingston still has a theatre and a record shop that puts on shows.",
    knownFor: "Eel Pie, Richmond's western edge, Kingston's theatre, and Banquet Records.",
    areas: [
      {
        code: "TW",
        name: "Twickenham",
        knownFor: "Twickenham and Hounslow, with Eel Pie's history on the river.",
        gettingThere:
          "South Western Railway to Twickenham, St Margarets, Hounslow, and Feltham. District line and Overground to Richmond. Piccadilly line to Hounslow.",
      },
      {
        code: "KT",
        name: "Kingston",
        knownFor: "Kingston's theatre and Banquet Records. The old Pryzm on Clarence Street has closed.",
        gettingThere:
          "South Western Railway from Waterloo to Kingston, Surbiton, and Norbiton. There is no Tube station in Kingston; Richmond is the nearest Underground.",
      },
    ],
  },
  {
    id: "outer-south",
    name: "Outer South",
    group: "outer",
    intro: "Croydon and Sutton: the CR and SM districts. A proper suburban night out, with a couple of larger rooms and a lot of pubs.",
    knownFor: "Croydon's larger rooms and the Sutton circuit.",
    areas: [
      {
        code: "CR",
        name: "Croydon",
        knownFor: "Croydon high-street venues and the Fairfield tradition.",
        gettingThere:
          "National Rail from London Bridge and Victoria to East Croydon and West Croydon. Overground to West Croydon. Trams from the town centre.",
      },
      {
        code: "SM",
        name: "Sutton",
        knownFor: "Sutton, Cheam, and Carshalton's local rooms.",
        gettingThere: "National Rail and Thameslink to Sutton, Cheam, and Carshalton. The nearest Tube is Morden, on the Northern line, to the north.",
      },
    ],
  },
  {
    id: "outer-southeast",
    name: "Outer Southeast",
    group: "outer",
    intro:
      "Bromley and the Dartford-edge DA districts that still fall inside Greater London. David Bowie grew up on this side of town.",
    knownFor: "Bowie's Bromley, and smaller rooms out towards Bexley and Crayford.",
    areas: [
      {
        code: "BR",
        name: "Bromley",
        knownFor: "Bromley, Beckenham, and the borough Bowie left for the city.",
        gettingThere: "National Rail from Victoria, Charing Cross, and London Bridge to Bromley South and Bromley North.",
      },
      {
        code: "DA",
        name: "Dartford fringe",
        knownFor: "Bexley, Crayford, and the other DA districts that sit inside the London boroughs.",
        gettingThere:
          "National Rail to Bexley, Crayford, and Abbey Wood. The Elizabeth line at Abbey Wood is the nearest Tube.",
      },
    ],
  },
  {
    id: "outer-east",
    name: "Outer East",
    group: "outer",
    intro: "Redbridge and Havering: the IG and RM districts. Romford has a dance-music history; Ilford is on the Elizabeth line.",
    knownFor: "Romford's dance history, and Ilford on the way out of Stratford.",
    areas: [
      {
        code: "IG",
        name: "Ilford",
        knownFor: "Ilford and the Redbridge rooms along the eastern railway.",
        gettingThere: "Elizabeth line to Ilford and Seven Kings. Central line to Gants Hill and Newbury Park.",
      },
      {
        code: "RM",
        name: "Romford",
        knownFor: "Romford, where Underworld started, and the pubs out to Upminster.",
        gettingThere: "Elizabeth line to Romford. District line to Upminster for the eastern edge. National Rail from Liverpool Street.",
      },
    ],
  },
]

const BY_ID = new Map(REGIONS.map((region) => [region.id, region]))
const BY_AREA = new Map(REGIONS.flatMap((region) => region.areas.map((area) => [area.code, { region, area }] as const)))

export function regions(): Region[] {
  return REGIONS
}

export function regionById(id: string): Region | null {
  return BY_ID.get(id) ?? null
}

export function regionPath(id: string): string {
  return `/region/${id}`
}

export function areaInfo(code: string): { region: Region; area: PostcodeAreaInfo } | null {
  return BY_AREA.get(postcodeArea(code)) ?? null
}

export function regionForPostcode(postcode: string): Region | null {
  return areaInfo(postcode)?.region ?? null
}

export function districtInRegion(postcode: string, regionId: string): boolean {
  return regionForPostcode(postcode)?.id === regionId
}

export function postcodeAreas(): string[] {
  return REGIONS.flatMap((region) => region.areas.map((area) => area.code))
}

export function artistInRegion(artist: ArtistRecord, regionId: string): boolean {
  return artist.locality.some(
    (place) =>
      place.precision === "place" && place.postcodes.some((postcode) => districtInRegion(postcode, regionId)),
  )
}

export function artistsInRegion(artists: ArtistRecord[], regionId: string): ArtistRecord[] {
  return artists.filter((artist) => artistInRegion(artist, regionId))
}
