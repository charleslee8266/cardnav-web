---
title: "Common account delivery format explanation"
description: "First judge whether the merchant delivers account/password, four-part RT, or various JSON credentials, then decide whether you can log in directly or what tool you should import into."
parent:
  slug: merchant-overview
---
# Common account delivery format explanation

> This article is provided by **CardNav [cardnav.xyz](https://cardnav.xyz)**.

Although many merchants sell items all called "accounts," the actual delivered content is not the same. Some are account information that can be used directly for web login, while others are JSON configurations for relay panels, import tools, or scripts. Confirming the delivery format before ordering helps reduce understanding gaps and usage risks.

You can first make a basic distinction:

- **Direct web and client login**: Prefer the "account/password" format that can directly log in on the official website, or the "four-part RT" direct login format with a password.
- **Tool and relay site import**: For formats delivered as session or various JSON configurations, they are usually more suitable for importing into third-party relay software or management panels.

## Account and password
<!-- badge="Most direct" icon="key" -->

The merchant directly sends email and password, which can usually log in directly on the web page or client.

- Suitable for people who want to directly log in to ChatGPT or the client
- Not suitable for people who want to batch import into tools or do format conversion
- Easy to confuse with other "account formats," so you still need to confirm whether direct login is supported

```txt
example@example.com | abc***XYZ
```

## Four-part RT
<!-- badge="Direct login / convertible" icon="key" -->

One line contains account, password, `client_id`, and `refresh_token` at the same time.

- Suitable for people who want both direct login and possible later format conversion
- Not suitable for people who cannot understand fields and only want brainless login
- The name looks complex and can easily be mistaken as only importable into tools

```txt
example@example.com----abc***XYZ----cli***123----rt_abc***xyz
```

## ChatGPT Session
<!-- badge="Session JSON" icon="api" -->

Session information obtained from an already logged-in web page, not ordinary account and password.

- Suitable for people who need session export and continued format conversion
- Not suitable for people who want to directly enter account and password on the login page
- Many people think it equals an account, but it actually cannot be used directly as account and password

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

## Codex / CPA / Sub2API / Cockpit
<!-- badge="Tool import format" icon="toolbox" -->

These are usually JSON files for importing into tools, panels, or relay programs.

- Suitable for local tool import, batch management, and continued format conversion
- Not suitable for people who only want direct web login
- When the product title says "account," this is the easiest format for beginners to buy by mistake

```json
{
  "refresh_token": "rt_abc***xyz",
  "access_token": "eyJ***xyz",
  "email": "example@example.com"
}
```

## How to convert

If you receive `account/password` or `four-part RT`, usually first confirm whether direct login works, then decide whether to convert it into `Session` or another import format.

If you receive JSON such as `Session`, `CPA`, `Sub2API`, or `Cockpit`, it is usually for tools or relay programs. First read the merchant's instructions, then decide how to import it.

## Order confirmation

- **Direct login format check**: Carefully confirm whether the card code content belongs to a delivery format such as account and password that can directly log in on the web page.
- **Tool format identification**: Identify whether what the merchant provides is JSON credentials for importing into clients such as Codex / CPA.
- **Terms of service confirmation**: Check whether the product details clearly state the subscription period, secondary verification method, and risk-control warranty time.
