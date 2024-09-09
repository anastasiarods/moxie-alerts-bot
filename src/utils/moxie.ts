export function getMoxieTokenTypeBySymbol(symbol: string) {
  if (symbol.startsWith("fid:")) {
    return "user";
  }

  if (symbol.startsWith("cid:")) {
    return "channel";
  }

  if (symbol.startsWith("id:")) {
    return "network";
  }

  return null;
}

export function getAssetMentionName({
  symbol,
  name,
}: {
  symbol: string;
  name: string;
}) {
  const assetType = getMoxieTokenTypeBySymbol(symbol);

  if (assetType === "user") {
    return `@${name}`;
  }

  if (assetType === "channel") {
    return `${name}`;
  }

  if (assetType === "network") {
    return "Farcaster Network";
  }
}
