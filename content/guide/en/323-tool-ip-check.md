---
title: "IP purity check"
description: "Before registration, login, and payment, first roughly filter out obviously high-risk exit IPs."
parent: network-env-overview
---
# IP purity check

> This article is provided by **CardNav [cardnav.xyz](https://cardnav.xyz)**.

Many users mistakenly treat "the proxy can connect" as "this IP can safely register and be used." In reality, platform risk control usually considers IP history, abuse records, proxy traces, and regional credibility together, so checking the IP before key operations can at least help you exclude some exits with obvious problems.

An IP check cannot guarantee absolute safety, because no one knows the platform's complete risk control logic. But it still has two practical values:

- **Screen high-risk exits**: Before registration, use detection tools to exclude exit IPs marked as spam, malicious, or with serious abuse history.
- **Rough comparison between nodes**: Compare purity among multiple network nodes you have, and choose the one with relatively the lowest risk-control value.

Suitable times to do an IP check:

- **Before registering a new account**: Checking the network before creating an official account can greatly reduce the initial ban probability of "new account immediately permanently banned."
- **When login anomalies appear**: When frequent human verification or even login errors occur, you should promptly check whether the current IP is polluted.
- **Before payment subscription operations**: Before binding a bank card for payment, make sure the IP region highly matches the card's issuing location and has no high-fraud score.

Use the detection tool directly: [IP purity check](/tools/ip-purity)
