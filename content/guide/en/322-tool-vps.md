---
title: "Cloud server recommendations"
description: "Prepare a more controllable overseas host environment for self-hosted nodes or self-hosted gateway sites."
parent: network-env-overview
---
# Cloud server recommendations

> This article is provided by **CardNav [cardnav.xyz](https://cardnav.xyz)**.

If you plan to self-host a node, run a reverse proxy program, or want a more controllable network environment, you usually need your own cloud server. For personal or small-scale use by a few people, `1C1G` is often already enough.

When choosing a VPS, mainly look at these things:
- **Route quality and latency**: Choose data center location and China-optimized routes to ensure smooth network when connecting to large models.
- **IP purity check**: The IP used for a self-hosted node should avoid being widely blacklisted or marked high-risk by official services.
- **Price and subscription period**: Compare annual or monthly procurement budgets comprehensively, and choose the most cost-effective configuration tier.
- **Reliable and stable provider**: Prioritize established providers that have operated stably for many years, and avoid shutdowns and loss of contact.

In general, the advantage of established providers is not necessarily the lowest price, but greater stability and easier troubleshooting. Cheap plans are not unusable, but you need to accept higher uncertainty in network quality and IP performance.

## BandwagonHost
<!-- badge="High-end quality routes" icon="vps" -->

BandwagonHost is an established cloud host provider that has run stably for many years. Its advantage is complete service and CN2-GIA routes. These routes have extremely low latency and the fastest speed to China, with relatively high IP purity, suitable for ultra-fast self-hosted nodes and users pursuing absolutely stable access.
- **Tokyo CN2-GIA plan**: Provides extremely low latency and excellent bandwidth. Refer to [Tokyo plan order](https://bandwagonhost.com/aff.php?aff=82503&a=add&pid=87&billingcycle=quarterly&configoption[17]=159).
- **Osaka Softbank plan**: Optimized for China Unicom routes with fast access speed. Refer to [Osaka plan order](https://bandwagonhost.com/aff.php?aff=82503&a=add&pid=87&billingcycle=quarterly&configoption[17]=53).
- **Other quality route plans**: Supports self-selection of configurations. Look for CN2 GIA and Softbank keywords. For details, refer to [BandwagonHost official overview](https://bandwagonhost.com/aff.php?aff=82503).

## RackNerd
<!-- badge="Very cost-effective" icon="vps" -->

RackNerd's advantage is cheapness. It is currently a very cost-effective merchant in the U.S. cloud host market. The cheapest 1C1G plan costs only $21.99 per year, although it is not an optimized route, but it is very economical for building a backup node or deploying a small Sub2API gateway program.
- **Entry-level cost-effective plan**: Only $21.99/year, configured as 1 core 1G. Refer to [1C1G plan order](https://my.racknerd.com/aff.php?aff=20079&pid=952).
- **Mid-tier upgrade plan**: Only $35.99/year, configured as 2 cores 2G. Refer to [2C2G plan order](https://my.racknerd.com/aff.php?aff=20079&pid=953).
- **High-configuration multi-core plan**: Can be used to run advanced programs such as gateways. Refer to [3C4G to 7C8G plan overview](https://my.racknerd.com/aff.php?aff=20079&pid=954).
