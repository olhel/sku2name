// Upstream attribution, in one place.
//
// MicrosoftDocs/entra-docs is MIT licensed, and its LICENSE explicitly covers
// "this software and associated documentation files". MIT carries exactly one
// obligation: the copyright notice and permission notice must be included in
// all copies or substantial portions. sku2name's dataset is derived from a
// substantial portion of that documentation, so the notice ships with it.
//
// This module is the single source of truth. It is rendered on /data/, written
// to dist/data/NOTICE.txt beside the JSON downloads, and mirrored in the
// repository's NOTICE file.

export const UPSTREAM_LICENSE = {
  spdx: 'MIT',
  holder: 'Microsoft Corporation',
  repo: 'MicrosoftDocs/entra-docs',
  repoUrl: 'https://github.com/MicrosoftDocs/entra-docs',
  licenseUrl: 'https://github.com/MicrosoftDocs/entra-docs/blob/main/LICENSE',
};

export const MIT_NOTICE = `MIT License

Copyright (c) Microsoft Corporation.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

/** The NOTICE text shipped alongside the JSON downloads. */
export function renderNoticeText({ syncedLabel = null } = {}) {
  return `sku2name — third-party attribution
==================================

The Microsoft 365 licensing data published by sku2name is derived from
Microsoft's product names and service plan identifiers reference:

  ${UPSTREAM_LICENSE.repoUrl}
  docs/identity/users/licensing-service-plan-reference.md
${syncedLabel ? `\n  Synced ${syncedLabel}\n` : ''}
That documentation is licensed by ${UPSTREAM_LICENSE.holder} under the MIT
License, reproduced in full below as that license requires.

sku2name adds its own derived material on top of it: the reverse index from
service plans to SKUs, similarity between SKUs, canonical name selection,
category labels, and URL slugs. Those additions are sku2name's, not
Microsoft's, and are covered by the project's own MIT license.

sku2name is an independent tool. It is not affiliated with or endorsed by
Microsoft. Microsoft 365 and Microsoft Entra are trademarks of Microsoft
Corporation.

----------------------------------------------------------------------
Upstream license (${UPSTREAM_LICENSE.repo})
----------------------------------------------------------------------

${MIT_NOTICE}
`;
}
