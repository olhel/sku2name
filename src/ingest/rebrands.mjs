// Microsoft brand renames, used to prefer the current name for a product when
// both spellings are published.
//
// This exists because staleness is not a property of either source file. The
// markdown leads the CSV 5 cases to 1 on brand tokens, which looks like grounds
// for preferring it, but flipping the source preference was measured against
// the live dataset and changed 35 SKU names: it fixed 5 and broke about 13,
// including reintroducing "PowerApps" on POWERAPPS_DEV while fixing it
// elsewhere. The retired name sits in whichever file happened to be regenerated
// last, so the rule has to key on the rename rather than on the file.
//
// Renames only ever run one way, which is what makes a fixed list safe here.
// Nothing is invented: a name is only set aside when another observed spelling
// of the same GUID carries the current brand, so if Microsoft never published
// the new name for a product, the old one still wins and the page is not wrong.
//
// Deliberately absent: Microsoft 365 E5 Security against Microsoft Defender
// Suite. That is a repositioning rather than a token swap, both names are in
// use, and it is one SKU. It belongs in a decision, not in a rule.

/**
 * `retired` marks a candidate as carrying the old brand, `current` marks one as
 * carrying the new. A candidate matching `current` is never treated as stale,
 * which is load-bearing rather than defensive: "Power Automate per flow plan"
 * is Microsoft's current name and still contains the word "flow".
 */
export const REBRANDS = [
  {
    // Azure AD became Microsoft Entra ID in July 2023. Both spellings are still
    // published, including the bare "Azure Active Directory" on AAD_SMB.
    retired: /\bazure active directory\b/i,
    current: /\bentra\b/i,
  },
  {
    // The same rename in its abbreviated form, as in "(AAD Identity)".
    retired: /\baad\b/i,
    current: /\bentra\b/i,
  },
  {
    // Microsoft Flow became Power Automate in November 2019.
    retired: /\bflow\b/i,
    current: /\bpower automate\b/i,
  },
  {
    // PowerApps became two words, Power Apps, in 2020.
    retired: /powerapps/i,
    current: /\bpower apps\b/i,
  },
];

/**
 * Rank a candidate as carrying a retired brand name. Lower is better.
 *
 * @param {string} name
 * @param {string[]} allNames every observed spelling for the same entity
 */
export function rebrandRank(name, allNames) {
  for (const { retired, current } of REBRANDS) {
    if (!retired.test(name)) continue;
    if (current.test(name)) continue;
    if (allNames.some((other) => other !== name && current.test(other))) return 1;
  }
  return 0;
}
