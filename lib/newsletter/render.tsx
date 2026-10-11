import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components"
import { render } from "@react-email/render"

import type { AreaSection, PersonalNewsletter } from "@/lib/newsletter/issue"

export const BRAND = {
  red: "#A63446",
  paper: "#FBFEF9",
  blue: "#0C6291",
  ink: "#000004",
  berry: "#7E1946",
} as const

const font = "Georgia, 'Iowan Old Style', 'Palatino Linotype', Palatino, serif"
const sans = "Outfit, 'Segoe UI', Helvetica, Arial, sans-serif"

export async function renderWeekly(issue: PersonalNewsletter): Promise<{ html: string; text: string }> {
  const html = await render(<WeeklyEmail issue={issue} />)
  const text = await render(<WeeklyEmail issue={issue} />, { plainText: true })
  return { html, text }
}

export async function renderConfirm(input: {
  confirmUrl: string
  areas: { code: string; label: string }[]
  siteUrl: string
}): Promise<{ html: string; text: string }> {
  const html = await render(<ConfirmEmail {...input} />)
  const text = await render(<ConfirmEmail {...input} />, { plainText: true })
  return { html, text }
}

export async function renderManage(input: { preferencesUrl: string; siteUrl: string }): Promise<{ html: string; text: string }> {
  const html = await render(<ManageEmail {...input} />)
  const text = await render(<ManageEmail {...input} />, { plainText: true })
  return { html, text }
}

function WeeklyEmail({ issue }: { issue: PersonalNewsletter }) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{issue.previewText}</Preview>
      <Body style={{ backgroundColor: BRAND.paper, color: BRAND.ink, margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: "600px", width: "100%", margin: "0 auto", padding: "28px 16px 40px" }}>
          <Text style={kicker}>Bangers & Postcodes</Text>
          <Heading style={title}>{issue.subject}</Heading>
          <Text style={lede}>
            {`Gigs from ${issue.fromLabel} to ${issue.toLabel}. Ticket links, a few local artists, and the area playlist on the site.`}
          </Text>
          {issue.areas.map((area) => (
            <AreaBlock key={area.code} area={area} />
          ))}
          <Section style={card}>
            <Heading as="h2" style={sectionTitle}>
              For you
            </Heading>
            <Text style={body}>
              For you ranks local artists and gigs from your Spotify session when you are logged in. The weekly email
              does not store that taste.
            </Text>
            <Button href={issue.forYouUrl} style={secondaryButton}>
              Open For you
            </Button>
          </Section>
          <Hr style={{ borderColor: "#eadfe3", margin: "28px 0 16px" }} />
          <Text style={fine}>
            You are getting this because you confirmed a Bangers & Postcodes email for these postcode districts. We
            store your email, those areas, and the times you signed up, confirmed, and unsubscribed.
          </Text>
          <Text style={fine}>
            <Link href={issue.preferencesUrl} style={link}>
              Change areas
            </Link>
            {" · "}
            <Link href={issue.unsubscribeUrl} style={link}>
              Unsubscribe
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

function AreaBlock({ area }: { area: AreaSection }) {
  return (
    <Section style={card}>
      <Text style={kicker}>{area.code}</Text>
      <Heading as="h2" style={sectionTitle}>
        {area.label}
      </Heading>
      {area.gigs.length === 0 ? <Text style={body}>No gigs listed for the next 7 days.</Text> : null}
      {area.gigs.map((gig) => (
        <Section key={gig.id} style={{ marginBottom: "16px" }}>
          <Text style={{ ...body, fontWeight: 700, marginBottom: "4px" }}>{gig.title}</Text>
          <Text style={{ ...fine, margin: "0 0 6px" }}>
            {gig.when}
            {" · "}
            {gig.venueUrl ? (
              <Link href={gig.venueUrl} style={link}>
                {gig.venueName}
              </Link>
            ) : (
              gig.venueName
            )}
          </Text>
          {gig.ticketUrl ? (
            <Text style={{ ...fine, margin: "0 0 4px" }}>
              <Link href={gig.ticketUrl} style={link}>
                Tickets
              </Link>
            </Text>
          ) : null}
          {gig.artists.map((artist) => (
            <Text key={artist.name} style={{ ...fine, margin: "0 0 2px" }}>
              <Link href={artist.spotifyUrl} style={link}>
                {`Open ${artist.name} in Spotify`}
              </Link>
            </Text>
          ))}
        </Section>
      ))}
      {area.moreGigs > 0 ? (
        <Text style={fine}>
          <Link href={area.pageUrl} style={link}>
            {area.moreGigs} more on the {area.code} page
          </Link>
        </Text>
      ) : null}
      {area.spotlights.length > 0 ? (
        <Section style={{ marginTop: "8px" }}>
          <Text style={subhead}>From the area</Text>
          {area.spotlights.map((artist) => (
            <Text key={artist.name} style={{ ...body, margin: "0 0 6px" }}>
              {`${artist.kind === "legend" ? "Local legend" : artist.kind === "newer" ? "Newer act" : "Local artist"}: `}
              <Link href={artist.spotifyUrl} style={link}>
                {`Open ${artist.name} in Spotify`}
              </Link>
            </Text>
          ))}
        </Section>
      ) : null}
      {area.rooms.length > 0 ? (
        <Section style={{ marginTop: "8px" }}>
          <Text style={subhead}>Rooms with a bill</Text>
          {area.rooms.map((room) => (
            <Text key={room.name} style={{ ...body, margin: "0 0 4px" }}>
              {room.href ? (
                <Link href={room.href} style={link}>
                  {room.name}
                </Link>
              ) : (
                room.name
              )}
            </Text>
          ))}
        </Section>
      ) : null}
      <Button href={area.playlistUrl} style={primaryButton}>
        {area.code} playlist
      </Button>
      <Text style={{ ...fine, marginTop: "10px" }}>
        <Link href={area.weekPlaylistUrl} style={link}>
          This week&apos;s gigs playlist
        </Link>
      </Text>
    </Section>
  )
}

function ConfirmEmail({
  confirmUrl,
  areas,
  siteUrl,
}: {
  confirmUrl: string
  areas: { code: string; label: string }[]
  siteUrl: string
}) {
  const list = areas.map((area) => `${area.code} (${area.label})`).join(", ")
  return (
    <Html lang="en">
      <Head />
      <Preview>Confirm your Bangers & Postcodes email</Preview>
      <Body style={{ backgroundColor: BRAND.paper, color: BRAND.ink, margin: 0 }}>
        <Container style={{ maxWidth: "600px", width: "100%", margin: "0 auto", padding: "28px 16px 40px" }}>
          <Text style={kicker}>Bangers & Postcodes</Text>
          <Heading style={title}>Confirm your email</Heading>
          <Text style={lede}>
            You asked for a weekly roundup for {list}. Nothing else is sent until you confirm. If this was not you,
            ignore this email.
          </Text>
          <Button href={confirmUrl} style={primaryButton}>
            Confirm subscription
          </Button>
          <Text style={fine}>
            We store your email, those areas, and the time you consent. Spotify listening is not stored.{" "}
            <Link href={siteUrl} style={link}>
              bangers-and-postcodes
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

function ManageEmail({ preferencesUrl, siteUrl }: { preferencesUrl: string; siteUrl: string }) {
  return (
    <Html lang="en">
      <Head />
      <Preview>Manage your Bangers & Postcodes email</Preview>
      <Body style={{ backgroundColor: BRAND.paper, color: BRAND.ink, margin: 0 }}>
        <Container style={{ maxWidth: "600px", width: "100%", margin: "0 auto", padding: "28px 16px 40px" }}>
          <Text style={kicker}>Bangers & Postcodes</Text>
          <Heading style={title}>You are already subscribed</Heading>
          <Text style={lede}>
            This address is already confirmed. Areas stay as they are until you change them. We will not start a second
            subscription.
          </Text>
          <Button href={preferencesUrl} style={primaryButton}>
            Change areas
          </Button>
          <Text style={fine}>
            <Link href={siteUrl} style={link}>
              Back to the site
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const kicker = {
  fontFamily: sans,
  fontSize: "12px",
  letterSpacing: "0.16em",
  textTransform: "uppercase" as const,
  color: BRAND.red,
  margin: "0 0 8px",
}

const title = {
  fontFamily: font,
  fontSize: "32px",
  lineHeight: "1.15",
  fontWeight: 650,
  color: BRAND.ink,
  margin: "0 0 12px",
}

const sectionTitle = {
  fontFamily: font,
  fontSize: "22px",
  lineHeight: "1.2",
  color: BRAND.berry,
  margin: "0 0 12px",
}

const lede = {
  fontFamily: sans,
  fontSize: "16px",
  lineHeight: "1.5",
  color: BRAND.ink,
  margin: "0 0 20px",
}

const body = {
  fontFamily: sans,
  fontSize: "15px",
  lineHeight: "1.45",
  color: BRAND.ink,
  margin: "0 0 8px",
}

const fine = {
  fontFamily: sans,
  fontSize: "13px",
  lineHeight: "1.45",
  color: BRAND.ink,
  margin: "0 0 8px",
}

const subhead = {
  fontFamily: sans,
  fontSize: "12px",
  letterSpacing: "0.14em",
  textTransform: "uppercase" as const,
  color: BRAND.berry,
  margin: "12px 0 8px",
}

const card = {
  backgroundColor: "#ffffff",
  border: `1px solid ${BRAND.red}`,
  borderRadius: "12px",
  padding: "16px",
  marginBottom: "16px",
}

const link = { color: BRAND.blue, textDecoration: "underline" }

const primaryButton = {
  backgroundColor: BRAND.red,
  color: BRAND.paper,
  fontFamily: sans,
  fontSize: "15px",
  fontWeight: 700,
  borderRadius: "8px",
  padding: "12px 18px",
  textDecoration: "none",
  display: "inline-block",
}

const secondaryButton = {
  ...primaryButton,
  backgroundColor: BRAND.blue,
}
