---
title: "2. Choose an AI subscription usage method"
description: "Compare the barriers, risks, and suitable users of five large model usage methods: relay sites, ready-made accounts, top-ups, self top-ups, and self-hosting."
parent: start-here
next: practical-prep
---
# 2. Choose an AI subscription usage method

> This article is provided by **CardNav [cardnav.xyz](https://cardnav.xyz)**.

Common paths for using top foreign large models can roughly be divided into five categories. There is no absolute good or bad among them. The key is what you care about more: convenience, saving money, stability, privacy, or long-term controllability.

First judge the route by usage barrier and risk boundary: if you only want a quick trial, first look at relay sites or ready-made accounts; if you already have an account but are stuck at payment, focus on third-party top-ups; if you are preparing for long-term heavy use, then consider official subscription top-up or a self-hosted relay.

## 2.1 AI large model API relay site
<!-- badge="Fastest to start" icon="api" -->

The service provider hosts account registration and payment, and you directly obtain an API Key to connect to third-party clients.

### Core advantages
- No overseas phone number verification, and no need to deal with complex proxies
- Pay as you go, suitable for small trial amounts first

### Main risks
- Conversation content will pass through the relay service provider
- You need to guard against fake high-tier models, diluted service quality, and service providers disappearing

### Suitable users
- Individual users and developers who debug code, have light non-confidential conversations, and want to quickly try multi-model APIs

[Learn more](./211-usage-api-relay.md)

## 2.2 AI large model ready-made account purchase and login
<!-- badge="Out of the box" icon="model" -->

Purchase a ready-made account for which the merchant has already activated a subscription, and directly log in on the web page or official client.

### Core advantages
- Skip the registration and payment process
- After receiving the account, you can quickly experience native web and client features

### Main risks
- Account source, after-sales period, and credential format may not be stable
- A stable network environment is still required during use

### Suitable users
- Users who urgently need native web interaction, short-term experience, or do not bind core long-term data

[Learn more](./212-usage-ready-account.md)

## 2.3 Third-party top-up for your own AI large model account
<!-- badge="Keep original account" icon="cash" -->

You provide your already registered account, and the merchant uses its payment channel to top up and activate the official subscription for you.

### Core advantages
- Keep your personal account, history, GPTs, and other settings
- Suitable for people who already have an account but cannot complete payment themselves

### Main risks
- If the merchant's payment source is opaque, it may bring risks such as chargebacks, subscription cancellation, or linked account bans
- During the operation, you need to confirm whether account passwords, payment links, or remote control permissions are exposed

### Suitable users
- Users who already have an old personal account, do not want to change accounts, but temporarily cannot complete official payment themselves

[Learn more](./213-usage-third-party-top-up.md)

## 2.4 AI large model official subscription top-up
<!-- badge="Long-term controllable" icon="key" -->

Prepare your own overseas network, phone number, and payment channel, independently register a personal account, and top up the subscription.

### Core advantages
- The account and payment chain are both controlled by you
- Long-term stability and fund safety are relatively better

### Main risks
- The upfront barrier is the highest
- You need to handle network, phone number, payment, and regional consistency issues at the same time

### Suitable users
- Users who use models heavily for the long term, need to bind work or research materials, and cannot easily accept account loss

[Learn more](./214-usage-self-register.md)

## 2.5 Self-hosted AI large model relay site
<!-- badge="Technical sharing" icon="vps" -->

Purchase official quota and use a reverse proxy program to self-host a relay interface, making it convenient for a team or friends to share quota usage.

### Core advantages
- You can centrally manage quota and control usage costs
- You can connect internal applications according to team needs

### Main risks
- Continuous operations and maintenance are required
- When multiple accounts or users share the same relay entry, it can easily trigger official anti-abuse risk control

### Suitable users
- Small teams or geeks with technical foundations who want to build an internal dedicated large model gateway

[Learn more](./215-usage-self-hosted-relay.md)
