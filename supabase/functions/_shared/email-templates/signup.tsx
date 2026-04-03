/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head>
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet" />
    </Head>
    <Preview>Confirm your email for {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Heading style={logoText}>{siteName}</Heading>
          <Text style={tagline}>AI-Powered GTM Platform</Text>
        </Section>
        <Section style={body}>
          <Heading style={h1}>Confirm your email ✉️</Heading>
          <Text style={text}>
            Thanks for signing up for{' '}
            <Link href={siteUrl} style={linkStyle}>
              <strong>{siteName}</strong>
            </Link>
            !
          </Text>
          <Text style={text}>
            Please confirm your email address (
            <Link href={`mailto:${recipient}`} style={linkStyle}>
              {recipient}
            </Link>
            ) by clicking the button below:
          </Text>
          <Section style={buttonContainer}>
            <Button style={button} href={confirmationUrl}>
              Verify Email
            </Button>
          </Section>
          <Text style={muted}>
            If you didn't create an account, you can safely ignore this email.
          </Text>
        </Section>
        <Section style={footer}>
          <Text style={footerText}>© {new Date().getFullYear()} Signal + Scale. All rights reserved.</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

const main = { backgroundColor: '#f8f8fc', fontFamily: "'Poppins', Arial, sans-serif", padding: '40px 0' }
const container = { backgroundColor: '#ffffff', maxWidth: '560px', margin: '0 auto', borderRadius: '12px', overflow: 'hidden' as const, boxShadow: '0 4px 24px rgba(15, 40, 76, 0.08)' }
const header = { backgroundColor: '#0f284c', padding: '32px 40px', textAlign: 'center' as const }
const logoText = { color: '#ffffff', margin: '0', fontSize: '24px', fontWeight: '700' as const, fontFamily: "'Poppins', Arial, sans-serif" }
const tagline = { color: '#e33e23', margin: '8px 0 0', fontSize: '14px', fontFamily: "'Poppins', Arial, sans-serif" }
const body = { padding: '40px' }
const h1 = { fontSize: '22px', fontWeight: '700' as const, color: '#0f284c', margin: '0 0 16px', fontFamily: "'Poppins', Arial, sans-serif" }
const text = { fontSize: '15px', color: '#555555', lineHeight: '1.6', margin: '0 0 16px', fontFamily: "'Poppins', Arial, sans-serif" }
const linkStyle = { color: '#8833ff', textDecoration: 'underline' }
const buttonContainer = { textAlign: 'center' as const, margin: '24px 0' }
const button = { backgroundColor: '#8833ff', color: '#ffffff', fontSize: '16px', fontWeight: '600' as const, borderRadius: '8px', padding: '14px 32px', textDecoration: 'none', fontFamily: "'Poppins', Arial, sans-serif" }
const muted = { fontSize: '13px', color: '#999999', lineHeight: '1.5', margin: '0', fontFamily: "'Poppins', Arial, sans-serif" }
const footer = { padding: '24px 40px', textAlign: 'center' as const, borderTop: '1px solid #eee' }
const footerText = { margin: '0', fontSize: '12px', color: '#888888', fontFamily: "'Poppins', Arial, sans-serif" }
