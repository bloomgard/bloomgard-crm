# Bloomgard erp Email Infrastructure & Architecture

## Overview
The Bloomgard erp platform utilizes a robust, hybrid email pipeline designed for enterprise-grade scalability, data sovereignty, and uncompromised deliverability. This document outlines the finalized architectural flow for both inbound communications and outbound transactional relays.

## 1. Inbound Pipeline (Cloudflare Shield)
Our inbound infrastructure is built to seamlessly integrate with our clients' existing corporate domains (e.g., `jeevanecotex.com`) without disrupting their primary mail servers. 

**Flow Summary:** Client Domain Global Mail Flow/BCC Rules -> Cloudflare Email Routing -> Cloudflare Worker (JSON translation) -> Vercel Serverless Endpoint.

1. **Global Routing Rules**: The client sets up a server-level Mail Flow or BCC routing rule to forward corporate inboxes to our designated alias (e.g., `jeevanecotex@bloomgard.co`).
2. **Edge Interception**: Cloudflare Email Routing acts as the first line of defense, catching the incoming mail at the edge.
3. **Packet Translation**: A serverless Cloudflare Worker intercepts the raw SMTP packet before it hits any origin server. It processes and translates the MIME data into a structured JSON payload.
4. **Webhook Dispatch**: The Cloudflare Worker fires a secure HTTPS POST webhook directly to our Vercel API endpoint.
5. **CRM Logging**: The Vercel Serverless Endpoint securely logs the communication in the Bloomgard erp CRM, ensuring seamless synchronization with client records.

## 2. Outbound Pipeline (Resend)
For outbound deliverability, we utilize Resend for high-availability transactional emails.

**Flow Summary:** Vercel Serverless Function -> Resend API -> External Recipient.

1. **Serverless Invocation**: A transactional event triggers our Vercel Serverless Function.
2. **Native API Integration**: The function routes the payload via the native Resend SDK.
3. **Anti-Spoofing Fallback**: If a client's custom domain is not yet verified in Resend, the system automatically catches the 403 error and falls back to using `onboarding@resend.dev` while preserving the intended display name and `Reply-To` address, ensuring zero dropped messages.

---

## Troubleshooting Outbound Client Domain Mail Flow

When a client's custom domain is added to the Bloomgard erp system, outbound email sending may fail inside Postal if the domain lacks proper authentication. Follow these diagnostic steps to verify and unlock outbound relaying.

### Step 1: SPF Validation Check
The client's IT Administrator must authorize our infrastructure to send emails on their behalf.
* **Action Required**: The client must add a `TXT` record at the apex/root of their custom domain.
* **Value**: `v=spf1 a mx include:spf.mail.bloomgard.co include:_spf.mx.cloudflare.net ~all`
* **Purpose**: This ensures recipient mail servers recognize our Postal infrastructure as an authorized sender, preventing emails from being rejected or flagged as spoofed.

### Step 2: DKIM Key Generation & Broadcasting
To cryptographically sign outbound emails and prevent them from landing in spam, a domain-specific key must be broadcasted.
* **Action Required**: The Bloomgard erp system automatically generates a unique domain key (e.g., `postal-xxxx._domainkey`) for the client's domain.
* **Client Task**: Instruct the user to have their IT department add this DKIM `TXT` record inside their respective DNS registrar (e.g., GoDaddy, Cloudflare, Route53).
* **Purpose**: This signature validates the integrity of the email payload in transit.

### Step 3: Tracking / Return Path Verification
To ensure reliable bounce handling and open/click tracking, the Return Path must align with the sender's domain.
* **Action Required**: Ensure the tracking `CNAME` or `MX` Return Path records match the client's DNS settings exactly.
* **Purpose**: Once these records are verified, Postal will flag the domain as fully "Green" and authenticated, permanently unlocking outbound relaying.

*For further escalation, contact our corporate operations team at support@bloomgard.co.*
