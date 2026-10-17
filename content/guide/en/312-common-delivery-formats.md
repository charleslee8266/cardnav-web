---
title: "Common account delivery formats"
description: "Understand AI account delivery formats, including login details, four-part RT records, ChatGPT Session data and tool import files, along with access methods, verification and credential security."
parent: merchant-overview
---
# Common account delivery formats

> This article is provided by **CardNav [cardnav.xyz](https://cardnav.xyz)**.

What a seller calls an “account” may be login details, a login token or a JSON file for a tool. Confirm the contents, access method and additional verification requirements before buying. Format only describes how data is organized; it does not establish ownership, subscription entitlements or validity.

For official-site or client access, confirm valid login details and who controls email and verification. For tool imports, check supported formats and required fields.

## Login details
<!-- badge="Login credentials" icon="key" -->

These are an email address or username and password. Direct login depends on account status, sign-in method and additional verification.

- Whether the password is for the service or only its associated email account
- Whether a verification code is required and who receives it
- Whether password, email and recovery methods can be changed; login access is not full ownership

```txt
example@example.com | abc***XYZ
```

## Four-part RT
<!-- badge="Account and tokens" icon="key" -->

A four-part RT record usually combines account, password, `client_id` and `refresh_token` on one line. The former identifies an application; the latter refreshes access tokens.

Sellers may define fields differently, and they may belong to an email service. Confirm their platform and purpose; the name “four-part RT” does not establish compatibility with ChatGPT login or conversion.

```txt
example@example.com----abc***XYZ----cli***123----rt_abc***xyz
```

Direct login requires valid credentials and any necessary verification. Tool use depends on the token's authorization, validity and supported format.

## ChatGPT Session
<!-- badge="Session JSON" icon="api" -->

Session data describes a logged-in session. It can be exported as JSON for compatible tools but cannot be entered as a username and password in a login form.

```json
{
  "user": {
    "id": "user_abc***xyz",
    "email": "example@example.com"
  },
  "account": {
    "id": "acct_abc***xyz",
    "planType": "plus"
  }
}
```

This example shows only part of the structure, lacks complete credentials and cannot be imported directly. A plan name does not prove an active subscription; check the actual account.

## Codex / CPA / Sub2API / Cockpit
<!-- badge="Tool import formats" icon="toolbox" -->

These names appear in tool import instructions. Fields vary by tool, version and seller; they are not a universal format.

```json
{
  "refresh_token": "rt_abc***xyz",
  "access_token": "eyJ***xyz",
  "email": "example@example.com"
}
```

An `access_token` generally accesses an authorized service; a `refresh_token` obtains a new access token. Example values are placeholders and may omit fields required by a particular tool.

Confirm the tool, version, import process and validity before buying. Successful import does not imply web login, profile editing or account recovery rights.

## Conversion and credential storage

Conversion reorganizes existing data; it cannot supply missing passwords, authorization or subscription entitlements. Check the source format, target requirements and field meanings. A username and password alone cannot necessarily produce every token a tool needs.

Protect login tokens and session credentials like passwords. Submitting them to third-party sites or untrusted tools may grant others account access. Remove passwords, tokens and other sensitive fields before sharing screenshots or asking for help.

## Before ordering

- **Access method**: Official website, official client or a specified third-party tool
- **Complete data**: Required fields and any email codes or other verification
- **Account rights**: Control of email, password and recovery; shared account or team seat status
- **Validity and support**: Subscription and credential expiry, replacement and refund conditions
