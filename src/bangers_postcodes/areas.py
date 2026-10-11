"""Southwest London places used to decide who counts as local.

MusicBrainz area names collide with other towns (Richmond, Virginia; Barnes
County; a city called Kew in Johannesburg). Every MusicBrainz locality claim
is accepted only when the area MBID is one listed here. Wikidata place of
birth and location of formation use the QID, which is the same idea.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class Place:
    id: str
    name: str
    postcodes: tuple[str, ...]
    # "place" is a district, suburb, or town. "borough" is a whole London
    # borough and is wider than the postcodes in the product brief.
    precision: str
    musicbrainz_area_mbid: str | None
    musicbrainz_area_name: str | None
    wikidata_qid: str | None
    note: str

    def to_dict(self) -> dict:
        data = asdict(self)
        data["postcodes"] = list(self.postcodes)
        return data


# MBIDs and QIDs were resolved against the live MusicBrainz and Wikidata
# APIs (area lookup, including parent "part of" relations).
PLACES: tuple[Place, ...] = (
    Place(
        id="barnes",
        name="Barnes",
        postcodes=("SW13",),
        precision="place",
        musicbrainz_area_mbid="2a16c206-6158-4751-95dc-7a799d250e2c",
        musicbrainz_area_name="Barnes",
        wikidata_qid="Q668140",
        note="Barnes in the London Borough of Richmond upon Thames, not other towns named Barnes.",
    ),
    Place(
        id="putney",
        name="Putney",
        postcodes=("SW15",),
        precision="place",
        musicbrainz_area_mbid="79e9cadb-c71e-40fc-bf78-950ef290517e",
        musicbrainz_area_name="Putney",
        wikidata_qid="Q2465220",
        note="District in the London Borough of Wandsworth.",
    ),
    Place(
        id="roehampton",
        name="Roehampton",
        postcodes=("SW15",),
        precision="place",
        musicbrainz_area_mbid=None,
        musicbrainz_area_name=None,
        wikidata_qid="Q3057456",
        note="SW15. MusicBrainz has no Roehampton area, so only Wikidata can place someone here.",
    ),
    Place(
        id="richmond",
        name="Richmond",
        postcodes=("TW9", "TW10"),
        precision="place",
        musicbrainz_area_mbid="2df2bbc1-e61f-44aa-bbd7-25c57729fe98",
        musicbrainz_area_name="Richmond",
        wikidata_qid="Q2500974",
        note="Richmond district in London. Richmond in Virginia, Yorkshire, and elsewhere are rejected by area id.",
    ),
    Place(
        id="kew",
        name="Kew",
        postcodes=("TW9",),
        precision="place",
        musicbrainz_area_mbid=None,
        musicbrainz_area_name=None,
        wikidata_qid="Q1740301",
        note="Kew in Richmond. The MusicBrainz city named Kew is in Johannesburg, so that MBID is not used.",
    ),
    Place(
        id="ham",
        name="Ham",
        postcodes=("TW10",),
        precision="place",
        musicbrainz_area_mbid=None,
        musicbrainz_area_name=None,
        wikidata_qid="Q5643819",
        note="Ham in Richmond upon Thames. A name-only MusicBrainz search also hits Ham in Belgium and East Ham.",
    ),
    Place(
        id="petersham",
        name="Petersham",
        postcodes=("TW10",),
        precision="place",
        musicbrainz_area_mbid=None,
        musicbrainz_area_name=None,
        wikidata_qid="Q2323537",
        note="Petersham in Richmond upon Thames. The only MusicBrainz area named Petersham is in Massachusetts.",
    ),
    Place(
        id="kingston",
        name="Kingston upon Thames",
        postcodes=("KT1", "KT2"),
        precision="place",
        musicbrainz_area_mbid="82d06beb-9ddb-4f9b-bc83-95fab1304289",
        musicbrainz_area_name="Kingston upon Thames",
        wikidata_qid="Q2321706",
        note="The town district, which is the part of Kingston that lines up with KT1 and KT2.",
    ),
    Place(
        id="norbiton",
        name="Norbiton",
        postcodes=("KT2",),
        precision="place",
        musicbrainz_area_mbid=None,
        musicbrainz_area_name=None,
        wikidata_qid="Q7050427",
        note="Norbiton is in KT2. MusicBrainz has no Norbiton area.",
    ),
    Place(
        id="wimbledon",
        name="Wimbledon",
        postcodes=("SW19",),
        precision="place",
        musicbrainz_area_mbid="36eeafda-c557-483e-a7fd-7842c9a892e3",
        musicbrainz_area_name="Wimbledon",
        wikidata_qid="Q736742",
        note="Wimbledon district in Merton. A US city named Wimbledon is a different MusicBrainz area and is ignored.",
    ),
    Place(
        id="mortlake",
        name="Mortlake",
        postcodes=("SW14",),
        precision="place",
        musicbrainz_area_mbid="abe8102c-6299-4473-9517-b7b3b2b5e725",
        musicbrainz_area_name="Mortlake",
        wikidata_qid="Q2456238",
        note="Mortlake district in Richmond upon Thames. A city named Mortlake in Victoria, Australia is ignored.",
    ),
    Place(
        id="east-sheen",
        name="East Sheen",
        postcodes=("SW14",),
        precision="place",
        musicbrainz_area_mbid=None,
        musicbrainz_area_name=None,
        wikidata_qid="Q2530557",
        note="East Sheen shares SW14 with Mortlake. MusicBrainz has no East Sheen area.",
    ),
    Place(
        id="fulham",
        name="Fulham",
        postcodes=("SW6",),
        precision="place",
        musicbrainz_area_mbid="5f6f6d2f-eed5-449d-82a5-613f1380f2e6",
        musicbrainz_area_name="Fulham",
        wikidata_qid="Q3367868",
        note="Fulham district. The wider borough of Hammersmith and Fulham is not treated as SW6.",
    ),
    Place(
        id="southfields",
        name="Southfields",
        postcodes=("SW18",),
        precision="place",
        musicbrainz_area_mbid="609ed3db-a769-4bbc-9b00-c516b2cd7187",
        musicbrainz_area_name="Southfields",
        wikidata_qid="Q3492335",
        note="Southfields sits in SW18, inside the borough of Wandsworth.",
    ),
    Place(
        id="wandsworth-borough",
        name="Wandsworth (borough)",
        postcodes=(),
        precision="borough",
        musicbrainz_area_mbid="54181a4b-9f77-4919-b8c5-f7af03fbbe17",
        musicbrainz_area_name="Wandsworth",
        wikidata_qid="Q210563",
        note=(
            "London Borough of Wandsworth. Editors often stop at the borough, "
            "which also covers Putney, Battersea, Balham and Tooting, so this is wider than SW18."
        ),
    ),
    Place(
        id="kingston-borough",
        name="Kingston upon Thames (borough)",
        postcodes=(),
        precision="borough",
        musicbrainz_area_mbid="5d9d8e13-c62b-4fe8-8f18-7b22346a7ed8",
        musicbrainz_area_name="Kingston upon Thames",
        wikidata_qid="Q32508",
        note=(
            "Royal Borough of Kingston upon Thames, including Surbiton and New Malden. "
            "Wider than KT1 and KT2."
        ),
    ),
    Place(
        id="richmond-borough",
        name="Richmond upon Thames (borough)",
        postcodes=(),
        precision="borough",
        musicbrainz_area_mbid="be0308c4-9c83-4e19-8cb7-33d3fb54d32f",
        musicbrainz_area_name="Richmond upon Thames",
        wikidata_qid="Q32515",
        note=(
            "London Borough of Richmond upon Thames, including Twickenham, Teddington and Hampton. "
            "Wider than TW9 and TW10."
        ),
    ),
)


def places_by_id() -> dict[str, Place]:
    return {place.id: place for place in PLACES}


def places_by_mbid() -> dict[str, Place]:
    return {
        place.musicbrainz_area_mbid: place
        for place in PLACES
        if place.musicbrainz_area_mbid
    }


def places_by_qid() -> dict[str, Place]:
    return {place.wikidata_qid: place for place in PLACES if place.wikidata_qid}


def postcodes() -> list[str]:
    found: list[str] = []
    for place in PLACES:
        for postcode in place.postcodes:
            if postcode not in found:
                found.append(postcode)
    return found
