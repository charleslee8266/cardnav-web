---
title: "2.5 Self-hosted API gateways"
description: "Assess upstream permissions, technical work and maintenance costs before hosting an AI API gateway, with Sub2API and CliProxyAPI options and guidance on keys, quotas and team permissions."
parent: choose-usage-method
next: usage-self-deploy-model
---
# 2.5 Self-hosted API gateways

> This article is provided by **CardNav [cardnav.xyz](https://cardnav.xyz)**.

A self-hosted API gateway connects upstream models to internal tools through one interface. It suits developers and teams that need centralized keys, usage allowances and call records. Confirm upstream authorization, connection methods and permitted use before deployment. A working integration does not mean a subscription permits sharing, resale or conversion into an API service.

## Main advantages

- **Centralized allowances**: Allocate official service credits across tools, projects or members.
- **Cost control**: Set team usage limits, record calls and manage budgets.
- **Flexible integration**: Connect internal applications, coding assistants, automation scripts and multiple clients.
- **Access control**: Easier to manage than sharing original accounts or master keys directly.

## Limitations and risks

- **Operational skills required**: Servers, domains, HTTPS, logs, rate limits and key management need maintenance.
- **Upstream limits still apply**: Request rates, user counts and features remain subject to upstream quotas and permissions; a gateway cannot remove them.
- **More access-management responsibility**: Leaked or misused member keys can exhaust credits. Assign separate permissions and usage limits.
- **Clear security boundaries needed**: All requests pass through the gateway, so protect logs and keys.

## Who it suits

- Developers experienced with Linux, Docker, reverse proxies and API operations
- Small teams needing centralized model credits and keys
- Developers connecting models to internal tools, automation or multiple clients

## Is hosting your own gateway worthwhile?

### When it makes sense
- A team needs centralized key distribution, usage limits and call records
- Internal tools require reliable access to multiple models or clients

### When it can wait
- For light personal use, consider official accounts or established gateways first
- Without server, HTTPS, logging, security and troubleshooting experience, budget for maintenance time and incident handling

### Important boundaries
- Do not share the main account or master key directly
- Give members individual keys where possible and retain usage and error records

## Sub2API
<!-- badge="Subscription conversion" icon="api" -->

Converts subscriptions or account credentials into an OpenAI-compatible interface. Suits users with upstream accounts who need quick API client integration.

### Suitable uses
- Connect existing accounts or subscription allowances to Chatbox, Cherry Studio and coding extensions
- Validate a gateway workflow with lower deployment costs

### Considerations
- Check account sources, upstream terms and the subscription’s permitted uses before deployment
- Do not expose the main account, master key or sensitive logs to team members

[View project](https://github.com/Wei-Shaw/sub2api)

## CliProxyAPI
<!-- badge="CLI proxy" icon="vps" -->

A proxy interface for CLI and agent use, connecting models to command-line tools, development workflows and internal automation.

### Suitable uses
- Unified model access for coding assistants, command-line tools and agent workflows
- Central management of team keys, usage allowances and endpoints

### Considerations
- Configure HTTPS, access keys, rate limits and logging policies during deployment
- Test reliability, compatibility and usage with real development tasks before long-term use

[View project](https://github.com/router-for-me/CLIProxyAPI)

## Deployment steps

1. Choose an overseas cloud server; see [Cloud server recommendations](./322-tool-vps.md).
2. Prepare an official account, available credits or an upstream API Key, and confirm usage terms and account restrictions.
3. Select a suitable gateway project from the options above.
4. Configure HTTPS, access keys, quotas, log retention and error alerts.
5. Give members individual keys instead of sharing the main account or master key.
6. Review usage, failure rates, unusual requests and upstream account status regularly.

## Recommendations

Self-hosting costs include servers, maintenance time, security management and upstream fees. Those costs are worthwhile only when unified access, member permissions or call management provide real benefits. For light personal use, start with an official service or a verified managed provider.
