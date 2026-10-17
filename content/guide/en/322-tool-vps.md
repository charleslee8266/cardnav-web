---
title: "Cloud Server Recommendations"
description: "Choose 4 GB of RAM for general cloud server use, or 2 GB for a lightweight personal AI API gateway. Prioritize routes optimized for China’s three major carriers and compare BandwagonHost with RackNerd."
parent: network-env-overview
---
# Cloud Server Recommendations

> This article is provided by **CardNav [cardnav.xyz](https://cardnav.xyz)**.

Think of a VPS as a rented remote computer with a continuous internet connection, used to host a network node or AI API gateway.

## Choosing Specifications

**4 GB of RAM** generally suffices; a lightweight personal AI API gateway can use **2 GB of RAM**. It only forwards requests rather than running a large model, so no GPU is needed.

## Prioritize Routes Optimized for All Three Carriers

**Three-carrier optimization** means optimizing cross-border routes for China Telecom, China Unicom, and China Mobile to reduce detours, peak-hour congestion, and packet loss. Prioritize it when mainland China connectivity matters.

**CN2 GIA** is China Telecom’s premium international network, often included in three-carrier optimized plans; confirm whether the particular data center covers all three. **SoftBank** is a Japanese carrier and another common network option for VPS hosting in Japan.

## BandwagonHost
<!-- badge="Mainland China routing" icon="vps" -->

An established provider whose strength is premium mainland China routing, at relatively higher prices. Compare three-carrier optimized plans first for low-latency AI access and peak-hour stability.

- **Tokyo CN2 GIA**: For low latency and a larger budget. [View Tokyo plan](https://bandwagonhost.com/aff.php?aff=82503&a=add&pid=87&billingcycle=quarterly&configoption[17]=159)
- **Osaka SoftBank**: Balance a Japanese location with budget. [View Osaka plan](https://bandwagonhost.com/aff.php?aff=82503&a=add&pid=87&billingcycle=quarterly&configoption[17]=53)
- **Los Angeles and other locations**: Optimized routes usually cost less if higher latency is acceptable. [View all plans](https://bandwagonhost.com/aff.php?aff=82503)

## RackNerd
<!-- badge="Low-cost hosting" icon="vps" -->

Inexpensive annual plans suit backup nodes for AI access or lightweight gateways such as Sub2API. Standard low-cost plans do not specialize in mainland China routing. Calls from applications outside mainland China make better use of the price advantage, with a trade-off in peak-hour access from the mainland.

- **1C1G (1 core / 1 GB RAM)**: Lightweight proxies for AI access and backup nodes. [View plan](https://my.racknerd.com/aff.php?aff=20079&pid=952)
- **2C2G (2 cores / 2 GB RAM)**: A lightweight personal gateway. [View plan](https://my.racknerd.com/aff.php?aff=20079&pid=953)
- **3C4G to 7C8G (3–7 cores / 4–8 GB RAM)**: Multiple services; upgrade as needed. [View more configurations](https://my.racknerd.com/aff.php?aff=20079&pid=954)

Before buying, check specifications, availability, promotional prices, and renewal prices.

## Purchasing and Maintenance

Start with a monthly plan before considering annual billing. Check renewal prices, traffic limits, and refund terms. Self-hosting requires system updates, key management, and configuration backups.
