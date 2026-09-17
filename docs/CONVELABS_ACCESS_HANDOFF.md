# ConveLabs Access Handoff

Purpose: track what has been granted, what is still missing, and what blocks execution.

Do not store passwords in this file.

## Current Status

### Granted in principle

- Google stack access granted by owner
- Google Business Profile access granted by owner
- Google Ads access granted by owner
- Website / repo / Vercel access granted by owner
- Booking dashboard access granted by owner
- Analytics access granted by owner
- Meta Business Manager access granted by owner

### Received identifiers

- Google login email: received from owner
- Google Ads customer ID: received from owner
- Booking dashboard URL: received from owner

### Still needed to actually operate cleanly

- Google Business Profile listing name and URL
- Google Analytics property identifier
- Google Search Console property URL
- Meta account email / username
- Meta Business Manager ID
- Facebook Page name / URL
- Instagram handle
- Analytics login URL or tool names
- Monthly budget cap
- Standing approval rules for outbound actions

## Immediate Operator Checklist

Nico should send:

1. Google Business Profile business name or listing URL
2. Meta login email
3. Meta Business Manager ID
4. Facebook Page name / URL
5. Instagram handle
6. Analytics tool names if more than one system is involved
7. Monthly ad budget cap
8. Approval rule for what can be launched without checking first

## Current Blockers

- Browser-operation rule: I can use an already signed-in browser session, but I should not type passwords into login forms myself.
- Nico needs to sign into Google and Meta on the active browser profile, or grant access through existing account-sharing flows, before live dashboard work can proceed.
- Cannot manage live campaigns safely without a budget cap.
- Cannot own outbound execution fully until approval boundaries are explicit.
