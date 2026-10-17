---
title: "Claude 订阅充值"
description: "了解 Claude 与 Claude Code 的订阅、付款及续费，区分套餐用量和 Console/API 账单，处理扣费未开通、重复订阅、取消续费与退款。"
parent: payment-overview
---
# Claude 订阅充值

> 本文由 **卡网大全 [cardnav.xyz](https://cardnav.xyz)** 提供。

购买 Claude 订阅前，应明确需要的是网页与客户端功能、Claude Code 编程使用量，还是 API 调用额度。三者的使用入口和账单不能混为一谈。

## 订阅与 API 计费

Pro、Max 订阅可用于 Claude 和 Claude Code，两者共享相应套餐的使用限额。使用 Claude Code 时，登录同一个 Claude 账号才能使用该订阅权益；若配置了 `ANTHROPIC_API_KEY`，可能使用 API 密钥认证并产生 API 费用。

Console/API 与 Claude 订阅分别计费，API 余额不等于 Claude 或 Claude Code 的订阅内用量。

## 购买渠道与开通步骤

官网订阅、Apple App Store 和 Google Play 的订单分别管理。官网付款方式与应用商店可选方式可能不同，具体以当前购买页面为准。

1. **确认账号**：登录需要开通的 Claude 账号，检查是否已有有效订阅。
2. **选择套餐**：核对所需功能、用量、订阅周期、最终价格和续费方式。
3. **完成付款**：官网按结算页面操作；手机端从官方应用进入商店购买流程，确认商店账号正确。
4. **验收权益**：检查套餐状态并保存订单。使用 Claude Code 时确认登录账号与计费方式，避免误用 API 付款。

应用商店准备可参考 [App Store 支付](./332-payment-app-store.md) 与 [Google Play Store 支付](./333-payment-google-play.md)。通过商家代充时，另行确认交付与失败处理条件，见 [第三方代充](./213-usage-third-party-top-up.md)。

## 扣款与到账问题

| 情况 | 处理方式 |
| --- | --- |
| 付款被拒绝 | 按提示检查卡片状态、账单资料和支付条件，必要时联系发卡行或官方支持 |
| 已付款但仍显示免费账号 | 检查是否登录了其他邮箱，并查看最近付款是否失败；凭订单联系相应支持 |
| 出现多笔扣款 | 分别查看官网、Apple、Google Play 和 Console 账单，区分订阅、API 费用与重复订单 |
| 商家收款后未开通 | 依据订单向商家追索，商家收款不等于官方已收到订阅付款 |

原因未明时不要连续重复付款。保留订单号、账号邮箱、交易时间与扣款记录，向支持人员提供必要信息时隐藏密码和登录令牌。

## 续费、取消与退款

官网购买可在 Settings → Billing 管理；通过 Apple 或 Google Play 购买的订阅，在原商店管理付款方式、续费和取消。取消通常在当前周期结束后生效；官方要求至少在下一账单日前 24 小时取消，以避免下一期扣款。

退款需另行申请，资格与金额按购买渠道和适用规则处理。官网订单通过 Claude 官方支持申请；Apple 订单由 Apple 审核退款；Google Play 订单可联系 Claude 支持，并提供关联邮箱或 GPA 订单号。退款申请与取消续费应分别确认，避免后续继续扣款。

## 参考资料

- [Claude 与 Claude Code 的套餐权益](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan)
- [付费套餐账单说明](https://support.claude.com/en/articles/8325618-paid-plan-billing-faqs)
- [取消订阅](https://support.claude.com/en/articles/8325617-cancel-your-pro-or-max-subscription)
- [申请退款](https://support.claude.com/en/articles/12386328-request-a-refund-for-a-paid-claude-plan)
