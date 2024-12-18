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

export function getFanTokenDetails({
  symbol,
  name,
}: {
  symbol: string;
  name: string;
}) {
  const assetType = getMoxieTokenTypeBySymbol(symbol);

  if (assetType === "user") {
    return { name: name, id: symbol.split(":")[1], type: assetType };
  }

  if (assetType === "channel") {
    return { name: name, id: symbol.split(":")[1], type: assetType };
  }

  if (assetType === "network") {
    return { name: "Farcaster Network", id: undefined, type: assetType };
  }
}
