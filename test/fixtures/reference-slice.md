---
title: Product names and service plan identifiers for licensing
description: Identifier map for licensing
ms.date: 07/01/2026
ms.topic: reference
---

# Product names and service plan identifiers for licensing

Intro prose that contains a pipe | character to prove prose is not a table.

>[!NOTE]
>This information was last updated on August 14, 2026.<br/>You can also download a CSV version of this table [here](https://example.invalid/x.csv).
><br/>

| Product name | String ID | GUID | Service plans included | Service plans included (friendly names) |
| --- | --- | --- |--- | --- |
| Office 365 E3 | ENTERPRISEPACK | 6fd2c87f-b296-42f0-b197-1e91e994b900 | EXCHANGE_S_ENTERPRISE (efb87545-963c-4e0d-99df-69c6916d9eb0)<br/>EXCHANGE_S_FOUNDATION (113feb6c-3fe4-4440-bddc-54d774bf0318) | Exchange Online (Plan 2) (efb87545-963c-4e0d-99df-69c6916d9eb0)<br/>Exchange Foundation (113feb6c-3fe4-4440-bddc-54d774bf0318) |
| Reordered Friendly Column | REORDERED | 11111111-1111-4111-8111-111111111111 | ALPHA (aaaaaaaa-0000-4000-8000-000000000001)<br/>BETA (bbbbbbbb-0000-4000-8000-000000000002)<br/>GAMMA (cccccccc-0000-4000-8000-000000000003) | Gamma Friendly (cccccccc-0000-4000-8000-000000000003)<br/>Alpha Friendly (aaaaaaaa-0000-4000-8000-000000000001)<br/>Beta Friendly (bbbbbbbb-0000-4000-8000-000000000002) |
| Nested Parens In Name | NESTEDPARENS | 22222222-2222-4222-8222-222222222222 | MICROSOFT_APPLICATION_PROTECTION_AND_GOVERNANCE_A (5f3b1ded-75c0-4b31-8e6e-9b077eaadfd5) | Microsoft Application Protection and Governance (A) (5f3b1ded-75c0-4b31-8e6e-9b077eaadfd5) |
| Unbalanced Paren Name | UNBALANCED | 33333333-3333-4333-8333-333333333333 | RMS_S_ENTERPRISE) (bea4c11e-220a-4e6d-8eb8-8ea15d019f90) | Azure Rights Management (bea4c11e-220a-4e6d-8eb8-8ea15d019f90) |
| Malformed Guid Space | MALFORMEDSPACE | 44444444-4444-4444-8444-444444444444 | INTUNE_O365 (882e1d05-acd1-4ccb-8708- 6ee03664b117) | Mobile Device Management for Office 365 (882e1d05-acd1-4ccb-8708-6ee03664b117) |
| Malformed Guid Hyphen | MALFORMEDHYPHEN | 55555555-5555-4555-8555-555555555555 | EXCHANGE_S_FOUNDATION (113feb6c-3fe4-4440-bddc 54d774bf0318) | Exchange Foundation (113feb6c-3fe4-4440-bddc-54d774bf0318) |
| Unclosed Paren Friendly | UNCLOSEDPAREN | 66666666-6666-4666-8666-666666666666 | WHITEBOARD_PLAN2 (94a54592-cd8b-425e-87c6-97868b000b91) | Whiteboard (Plan 2) (94a54592-cd8b-425e-87c6-97868b000b91 |
| Guid Not Last | GUIDNOTLAST | 77777777-7777-4777-8777-777777777777 | PRIVACY_MANGEMENT_DSR_EXCHANGE_1 (93d24177-c2c3-408a-821d-3d25dfa66e7a) | Privacy Management - Subject Rights Request (1 - Exchange) (93d24177-c2c3-408a-821d-3d25dfa66e7a) (PRIVACY_MANGEMENT_DSR_EXCHANGE_1) |
| Friendly Longer Than Technical | LONGERFRIENDLY | 88888888-8888-4888-8888-888888888888 | ONLY_ONE (dddddddd-0000-4000-8000-000000000004) | Only One (dddddddd-0000-4000-8000-000000000004)<br/>Orphan Friendly (eeeeeeee-0000-4000-8000-000000000005) |
| Technical Longer Than Friendly | LONGERTECHNICAL | 99999999-9999-4999-8999-999999999999 | FIRST_PLAN (ffffffff-0000-4000-8000-000000000006)<br/>SECOND_PLAN (a1a1a1a1-0000-4000-8000-000000000007) | First Plan (ffffffff-0000-4000-8000-000000000006) |
| Stray Tabs Row |	STRAYTABS	| aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa	| TABBED_PLAN (b2b2b2b2-0000-4000-8000-000000000008) |	Tabbed Plan (b2b2b2b2-0000-4000-8000-000000000008) |
| Url Hostile Id | O365_w/o Teams Bundle_M3 | bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb | CDS_O365_P2 (95b76021-0000-4000-8000-000000000009) | Common Data Service (95b76021-0000-4000-8000-000000000009) |
| Skype for Business PSTN Domestic Calling (120 Minutes)| MCOPSTN5	| 54a152dc-90de-4996-93d2-bc47e670fc06	| MCOPSTN5 (54a152dc-90de-4996-93d2-bc47e670fc06) | DOMESTIC CALLING PLAN (54a152dc-90de-4996-93d2-bc47e670fc06) |
| Skype for Business PSTN Calling Domestic Small | MCOPSTN5 |	d43177b5-475b-4880-92d4-d54c27b5efbd | Skype for Business PSTN Calling Domestic Small (9a0125a5-c8f8-4526-b231-49e2abe0ebce) | Skype for Business PSTN Calling Domestic Small (9a0125a5-c8f8-4526-b231-49e2abe0ebce) |
| Casing Variants | CASINGVARIANTS | cccccccc-1111-4111-8111-cccccccccccc | EXCHANGE_S_FOUNDATION (113feb6c-3fe4-4440-bddc-54d774bf0318) | EXCHANGE FOUNDATION (113feb6c-3fe4-4440-bddc-54d774bf0318) |

## Service plans that cannot be assigned at the same time

Some prose introducing the conflict tables.

### Service: *Exchange Online*

| Service Plan Name | GUID |
| --- | --- |
| EXCHANGE_S_STANDARD	| 9aaf7827-d63c-4b61-89c3-182f06f82e5c |
| EXCHANGE_S_ENTERPRISE | efb87545-963c-4e0d-99df-69c6916d9eb0 |

### Service: *Microsoft Entra ID*

| Service Plan Name | GUID |
| --- | --- |
| AAD_PREMIUM | 41781fb2-bc02-4b7c-bd55-b576c07bb09d |

## Next steps

| Product name | String ID | GUID | Service plans included | Service plans included (friendly names) |
| --- | --- | --- |--- | --- |
| Decoy After Next Steps | DECOY | dddddddd-1111-4111-8111-dddddddddddd | DECOY_PLAN (c3c3c3c3-0000-4000-8000-000000000010) | Decoy Plan (c3c3c3c3-0000-4000-8000-000000000010) |
