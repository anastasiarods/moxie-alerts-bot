import { getFidFromUsername } from "./fc";

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

  if (symbol.startsWith("moxie:")) {
    return "moxie";
  }

  if (symbol === "base-economy") {
    return "base-economy";
  }

  return null;
}

export async function getFanTokenDetails({
  symbol,
  name,
}: {
  symbol: string;
  name: string;
}) {
  const assetType = getMoxieTokenTypeBySymbol(symbol.toLowerCase());

  if (assetType === "user") {
    return { name: name, id: symbol.split(":")[1], type: assetType };
  }

  if (assetType === "channel") {
    return { name: name, id: symbol.split(":")[1], type: assetType };
  }

  if (assetType === "network") {
    return { name: "Farcaster Network", id: undefined, type: assetType };
  }

  if (assetType === "moxie") {
    const fcUser = symbol.endsWith("-fc");

    if (fcUser) {
      const username = symbol.split(":")[1].replace("-fc", "");
      const fid = await getFidFromUsername(username);

      if (fid) {
        return {
          id: fid,
          name: username,
          type: "user",
        };
      }
    }

    return {
      id: undefined,
      name: symbol
        .split(":")[1]
        .replace("-x", "")
        .replace("-fc", "")
        .replace("-base", "")
        .replace("-ens", ""),
      type: assetType,
    };
  }

  if (assetType === "base-economy") {
    return {
      id: undefined,
      name: "Base Economy",
      type: assetType,
    };
  }
}
