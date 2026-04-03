/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
}: RecoveryEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head>
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet" />
    </Head>
    <Preview>Reset your password for {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Heading style={logoText}>{siteName}</Heading>
          <Text style={tagline}>AI-Powered GTM Platform</Text>
        </Section>
        <Section style={body}>
          <Heading style={h1}>Reset your password 🔑</Heading>
          <Text style={text}>
            We received a request to reset your password for {siteName}. Click the button below to choose a new one.
          </Text>
          <Section style={buttonContainer}>
            <Button style={button} href={confirmationUrl}>
              Reset Password
            </Button>
          </Section>
          <Text style={muted}>
            If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.
          </Text>
        </Section>
        <Section style={footer}>
          <Text style={footerText}>© {new Date().getFullYear()} Signal + Scale. All rights reserved.</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail

const main = { backgroundColor: '#f8f8fc', fontFamily: "'Poppins', Arial, sans-serif", padding: '40px 0' }
const container = { backgroundColor: '#ffffff', maxWidth: '560px', margin: '0 auto', borderRadius: '12px', overflow: 'hidden' as const, boxShadow: '0 4px 24px rgba(15, 40, 76, 0.08)' }
const header = { backgroundColor: '#0f284c', padding: '32px 40px', textAlign: 'center' as const }
const logoText = { color: '#ffffff', margin: '0', fontSize: '24px', fontWeight: '700' as const, fontFamily: "'Poppins', Arial, sans-serif" }
const tagline = { color: '#e33e23', margin: '8px 0 0', fontSize: '14px', fontFamily: "'Poppins', Arial, sans-serif" }
const body = { padding: '40px' }
const h1 = { fontSize: '22px', fontWeight: '700' as const, color: '#0f284c', margin: '0 0 16px', fontFamily: "'Poppins', Arial, sans-serif" }
const text = { fontSize: '15px', color: '#555555', lineHeight: '1.6', margin: '0 0 16px', fontFamily: "'Poppins', Arial, sans-serif" }
const buttonContainer = { textAlign: 'center' as const, margin: '24px 0' }
const button = { backgroundColor: '#8833ff', color: '#ffffff', fontSize: '16px', fontWeight: '600' as const, borderRadius: '8px', padding: '14px 32px', textDecoration: 'none', fontFamily: "'Poppins', Arial, sans-serif" }
const muted = { fontSize: '13px', color: '#999999', lineHeight: '1.5', margin: '0', fontFamily: "'Poppins', Arial, sans-serif" }
const footer = { padding: '24px 40px', textAlign: 'center' as const, borderTop: '1px solid #eee' }
const footerText = { margin: '0', fontSize: '12px', color: '#888888', fontFamily: "'Poppins', Arial, sans-serif" }
