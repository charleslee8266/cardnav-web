---
title: 云服务器推荐
description: 为自建节点或自建中转站准备更可控的海外主机环境。
parent:
  slug: network-env-overview
  title: 3.2 网络环境与主机准备
---
# 云服务器推荐

> 本文由 **卡网大全 [cardnav.xyz](https://cardnav.xyz)** 提供。

如果你准备自建节点、运行反向代理程序，或者希望拥有更可控的网络环境，那么你通常需要一台自己的云服务器。对于个人或几个人的小规模使用场景，很多时候 `1C1G` 就已经够用了。

选择 VPS 时，主要看这几件事：
- **线路质量与延迟**：选择机房位置和回国优化线路，确保连接大模型时的网络流畅度。
- **IP 纯净度检测**：自建节点使用的 IP 应当避免被官方大面积拉黑或标记高风险。
- **价格与订阅周期**：综合对比年付或月付的采购预算，选择最划算的配置阶梯。
- **服务商靠谱稳定**：优先选择稳定运营多年的老牌服务商，避免遭遇关门失联。

一般来说，老牌服务商的优势不一定是最便宜，而是更稳、更容易排查问题。便宜套餐也不是不能用，但要接受网络质量和 IP 表现的不确定性更高。

## 搬瓦工
<!-- badge="高端优质线路" icon="vps" -->

搬瓦工是一个老牌云主机服务商，已经稳定运行了很多年。它的优势在于服务完善，并且提供 CN2-GIA 等线路。这些线路到中国的延迟极低、速度最快，且 IP 纯净度相对较高，适合极速自建节点及追求绝对稳定访问的用户。
- **东京CN2-GIA方案**：提供极低延迟与优秀带宽，可参考 [东京 Tokyo 方案订购](https://bandwagonhost.com/aff.php?aff=82503&a=add&pid=87&billingcycle=quarterly&configoption[17]=159)。
- **大阪Softbank方案**：针对联通线路优化，访问速度快，可参考 [大阪 Osaka 方案订购](https://bandwagonhost.com/aff.php?aff=82503&a=add&pid=87&billingcycle=quarterly&configoption[17]=53)。
- **其他优质线路方案**：支持自行选配，认准 CN2 GIA 与 Softbank 关键字，详情参考 [搬瓦工官方总览](https://bandwagonhost.com/aff.php?aff=82503)。

## RackNerd
<!-- badge="极高性价比" icon="vps" -->

RackNerd 的优势就是便宜。它是目前美国云主机市场极具性价比的商家，最便宜的 1C1G 套餐一年仅需 21.99 刀（折合人民币 150 元左右），虽然不是优化线路，但用来搭建备用节点或部署小型的 Sub2API 中转程序非常经济合算。
- **入门型性价比方案**：仅需 $21.99/年，配置为 1核1G，可参考 [1C1G 套餐订购](https://my.racknerd.com/aff.php?aff=20079&pid=952)。
- **中端型升级方案**：仅需 $35.99/年，配置为 2核2G，可参考 [2C2G 套餐订购](https://my.racknerd.com/aff.php?aff=20079&pid=953)。
- **高配型多核方案**：可用于运行中转等高级程序，可参考 [3C4G 到 7C8G 方案总览](https://my.racknerd.com/aff.php?aff=20079&pid=954)。
