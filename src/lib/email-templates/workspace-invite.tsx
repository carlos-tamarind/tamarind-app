import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from '@react-email/components'

import type { TemplateEntry } from './registry'

interface WorkspaceInviteEmailProps {
  workspaceName?: string
  inviterName?: string
  roleLabel?: string
  acceptUrl?: string
  expiresInHours?: number
}

const WorkspaceInviteEmail = ({
  workspaceName = 'a workspace',
  inviterName,
  roleLabel,
  acceptUrl = '#',
  expiresInHours = 24,
}: WorkspaceInviteEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head>
      <style>{darkModeCss}</style>
    </Head>
    <Preview>{`You've been invited to join ${workspaceName} on Tamarind`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Join {workspaceName}</Heading>
        <Text style={text}>
          {inviterName ? `${inviterName} invited you` : 'You have been invited'} to join{' '}
          <strong>{workspaceName}</strong> on Tamarind
          {roleLabel ? ` as ${roleLabel}` : ''}. Accept the invitation to get started.
        </Text>
        <Button className="dm-btn" style={button} href={acceptUrl}>
          Accept invitation
        </Button>
        <Text style={footer}>
          This invitation expires in {expiresInHours} hours. If you weren't expecting it, you
          can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: WorkspaceInviteEmail,
  subject: (data: Record<string, any>) =>
    data['workspaceName']
      ? `You've been invited to join ${data['workspaceName']}`
      : "You've been invited to a workspace",
  displayName: 'Workspace invitation',
  previewData: {
    workspaceName: 'Acme HQ',
    inviterName: 'Jane Doe',
    roleLabel: 'a member',
    acceptUrl: 'https://tamarind.so/accept-invite?token=example',
    expiresInHours: 24,
  },
} satisfies TemplateEntry

export default WorkspaceInviteEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '20px 25px' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#000000',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#55575d',
  lineHeight: '1.5',
  margin: '0 0 25px',
}
const button = {
  backgroundColor: '#000000',
  color: '#ffffff',
  fontSize: '14px',
  border: '1px solid #000000',
  borderRadius: '8px',
  padding: '12px 20px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
// Rendered as a text child, which React may HTML-escape: keep this CSS free of >, &, and quotes.
const darkModeCss = `
  @media (prefers-color-scheme: dark) {
    .dm-btn { background-color: #ffffff !important; color: #000000 !important; }
  }
  [data-ogsc] .dm-btn { background-color: #ffffff !important; color: #000000 !important; }
  [data-ogsb] .dm-btn { background-color: #ffffff !important; color: #000000 !important; }
`
