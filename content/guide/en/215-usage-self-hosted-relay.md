---
title: "2.5 Self-hosted AI large model relay site"
description: "Purchase official AI large model quota and self-host a relay interface, suitable for users with technical foundations who need team sharing and internal access."
parent: choose-usage-method
next: practical-prep
---
# 2.5 Self-hosted AI large model relay site

> This article is provided by **CardNav [cardnav.xyz](https://cardnav.xyz)**.

A self-hosted relay site is usually suitable for people with technical foundations. You purchase official quota or prepare usable accounts yourself, then use a reverse proxy, relay program, or internal gateway to distribute model capability to a team, friends, or your own multiple tools.

## Core advantages

- **Quota can be centrally managed**: Official quota can be uniformly allocated to multiple tools, projects, or members.
- **Controllable cost**: Teams can limit quota, record call volume, and control budgets as needed.
- **Flexible access**: It can connect to internal applications, code assistants, automation scripts, and multiple clients.
- **Permission control is possible**: It is easier to manage than directly giving the original account or main Key to others.

## Limitations and risks

- **Operations capability is required**: Server, domain, HTTPS, logs, rate limits, and key management all need to be maintained by you.
- **Risk control pressure is more concentrated**: Multiple users or accounts sharing the same relay entry may trigger official anti-abuse policies.
- **Account responsibility is more complex**: Once team members abuse quota, it may affect the main account or upstream quota.
- **Security boundaries must be clear**: The relay service itself passes through all requests, so logs and keys must be protected.

## Suitable users

- People with basic Linux, Docker, reverse proxy, and API operations experience
- Scenarios where small teams want to uniformly manage model quota and Keys
- People who want to connect model capability to internal tools, automation processes, or multiple clients

## Is self-hosting worth it

### Worth doing
- The team needs to uniformly distribute Keys, limit quota, and view call volume
- Internal tools need stable access to multiple models or multiple clients

### Not recommended at the start
- If it is only personal light use, first consider official accounts or mature relay sites
- When you have no experience with servers, HTTPS, logs, security, and exception handling, the maintenance cost will quickly exceed the money saved

### Key boundaries
- Do not directly share the main account or main Key
- Try to distribute independent Keys to members, and retain usage and anomaly records

## Recommended projects

## Sub2API
<!-- badge="Subscription conversion" icon="api" -->

Convert subscriptions or account credentials into OpenAI-compatible interfaces, suitable for users who already have usable upstream accounts and want quick access to API clients.

### Suitable scenarios
- Want to connect existing accounts or subscription quota to tools such as Chatbox, Cherry Studio, and code plugins
- Need to first validate a self-hosted relay process in a lightweight way

### Notes
- Before deployment, first confirm that the upstream account and subscription source are compliant and stable
- Do not expose the main account, main Key, or sensitive logs to team members

[View project](https://github.com/Wei-Shaw/sub2api)

## CliProxyAPI
<!-- badge="CLI proxy" icon="vps" -->

A proxy interface project for CLI and Agent usage scenarios, suitable for distributing model capability to command-line tools, development workflows, and internal automation tasks.

### Suitable scenarios
- Code assistants, command-line tools, and Agent workflows need unified model access
- The team wants centralized management of access keys, quota, and call entry

### Notes
- It needs to be deployed together with HTTPS, access keys, rate limits, and log policies
- Before long-term use, first test stability, compatibility, and quota consumption with real development tasks

[View project](https://github.com/router-for-me/CLIProxyAPI)

## Practical steps

1. First purchase an overseas cloud server. For specific host choices, refer to [Cloud server recommendations](./322-tool-vps.md).
2. Prepare an official account, usable quota, or upstream API Key, and confirm its terms of use and risk control boundaries.
3. Choose the relay program that better suits your usage scenario from the recommended projects above.
4. Configure HTTPS, access keys, quota limits, log retention policies, and anomaly alerts.
5. Distribute independent Keys to team members, and do not directly share the main account or main Key.
6. Regularly check call volume, failure rate, abnormal requests, and upstream account status.

## Usage advice

A self-hosted relay site is not a "cheaper universal solution." It is more like internal infrastructure that requires continuous maintenance. It is worth doing only when you truly need team sharing, unified access, and permission control; for personal light use, there is usually no need to take this path at the start.
