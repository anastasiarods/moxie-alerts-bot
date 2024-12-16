import { CATEGORIES } from "../constants.js";
import { getFanTokenDetails } from "./moxie.js";
import { type InterpretedTransaction } from "@3loop/transaction-interpreter";
import type { DecodedTransaction } from "@3loop/transaction-decoder";
import { getFarcasterUserInfoByAddress } from "./airstack";

function getTextLengthInBytes(text: string) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  return bytes.length;
}

function splitActionText(text: string) {
  const cleanedText = text.replace(/of [^ ]+ (?=for)/, "of ");
  const parts = cleanedText.split(" for ");
  parts[1] = "for " + parts[1];
  return parts;
}

export async function constructBuyOrSellMessage(tx: InterpretedTransaction) {
  const isSellingEvent = tx.action.includes("Sold");
  const [moxieToken, fanToken] = isSellingEvent
    ? [tx.assetsReceived[0], tx?.assetsSent?.[0]]
    : [tx.assetsSent[0], tx?.assetsReceived?.[0]];
  const [spenderToken, receiverToken] = isSellingEvent
    ? [fanToken, moxieToken]
    : [moxieToken, fanToken];

  if (
    !spenderToken?.from.address ||
    !receiverToken?.to.address ||
    !fanToken ||
    !moxieToken
  ) {
    console.log("no spender or receiver", spenderToken, receiverToken);
    return;
  }

  const addresses = {
    spender: spenderToken.from.address.toLowerCase(),
    beneficiary: receiverToken.to.address.toLowerCase(),
    actor: tx.user.address.toLowerCase(),
  };

  const [actorInfo, beneficiaryInfo] = await Promise.all([
    getFarcasterUserInfoByAddress(addresses.actor),
    addresses.spender !== addresses.beneficiary
      ? getFarcasterUserInfoByAddress(addresses.beneficiary)
      : Promise.resolve(null),
  ]);

  if (
    !actorInfo?.userId ||
    (addresses.spender !== addresses.beneficiary && !beneficiaryInfo?.userId)
  ) {
    console.log(
      "no actor or beneficiary info",
      addresses.actor,
      addresses.beneficiary
    );
    return;
  }

  let text = ``;

  if (Number(moxieToken.amount!) >= CATEGORIES.WHALE) {
    text += `🐋 🚨 Whale alert\n\n`;
  }

  let mentionsPositions = [getTextLengthInBytes(text)];
  let mentions = [actorInfo?.userId];
  const actionParts = splitActionText(tx.action);
  text += ` ${actionParts[0]} `;

  let parentUrl: string | undefined;

  const fanTokenDetails = getFanTokenDetails({
    symbol: fanToken.asset.symbol!,
    name: fanToken.asset.name!,
  });

  switch (fanTokenDetails?.type) {
    case "user":
      if (fanTokenDetails.id) {
        mentions.push(fanTokenDetails.id);
        mentionsPositions.push(getTextLengthInBytes(text));
      }
      break;
    case "channel":
      if (fanTokenDetails.id) {
        text += `${fanToken.asset.name}`;
      }
      break;
    case "network":
      text += `${fanToken.asset.name}`;
      break;
  }

  text += ` ${actionParts[1]}`;

  if (addresses.spender !== addresses.beneficiary && beneficiaryInfo?.userId) {
    text += ` on behalf of `;
    mentions.push(beneficiaryInfo?.userId);
    mentionsPositions.push(getTextLengthInBytes(text));
  }

  return {
    text,
    mentions: mentions.map((fid) => Number(fid)),
    mentionsPositions,
    parentUrl,
  };
}

export async function constructBurnMessage(
  interpreted: InterpretedTransaction,
  decoded: DecodedTransaction
) {
  const actor = interpreted.user.address.toLowerCase();
  const actorInfo = await getFarcasterUserInfoByAddress(actor);

  if (!actorInfo?.userId) {
    console.log("no actor info", actor);
    return;
  }

  let text = `🔥 `;
  let mentions = [];
  let mentionsPositions = [];
  const actionParts = interpreted.action.split(" for ");

  mentions.push(actorInfo.userId);
  mentionsPositions.push(getTextLengthInBytes(text));
  text += ` ${actionParts[0]}`;

  const fanToken = Object.values(decoded.addressesMeta).find(
    (meta) =>
      meta?.tokenSymbol?.startsWith("fid:") ||
      meta?.tokenSymbol?.startsWith("cid:") ||
      meta?.tokenSymbol?.startsWith("id:")
  );

  if (fanToken) {
    const fanTokenDetails = getFanTokenDetails({
      symbol: fanToken.tokenSymbol ?? "",
      name: fanToken.contractName ?? "",
    });

    if (fanTokenDetails?.type === "user" && fanTokenDetails.id) {
      text += ` for `;
      mentions.push(fanTokenDetails.id);
      mentionsPositions.push(getTextLengthInBytes(text));
      text += ` Fan Token hodlers`;
    }
  }

  return {
    text,
    mentions: mentions.map((fid) => Number(fid)),
    mentionsPositions,
  };
}

export async function constructStakeMessage(
  interpreted: InterpretedTransaction
) {
  const actor = interpreted.user.address.toLowerCase();
  const actorInfo = await getFarcasterUserInfoByAddress(actor);

  if (!actorInfo?.userId) {
    console.log("no actor info", actor);
    return;
  }

  const fanToken =
    interpreted.method === "depositAndLock"
      ? interpreted.assetsSent[0]
      : interpreted.assetsMinted?.[0];

  if (!fanToken || !fanToken.asset.symbol || !fanToken.asset.name) {
    console.log("Invalid fan token data");
    return;
  }

  const fanTokenDetails = getFanTokenDetails({
    symbol: fanToken.asset.symbol,
    name: fanToken.asset.name,
  });

  let text = "";
  const mentions = [actorInfo.userId];
  const mentionsPositions = [0];

  if (fanTokenDetails?.type === "user" && fanTokenDetails.id) {
    const actionParts = interpreted.action.split(" of ");
    text = ` ${actionParts[0]} of `;
    mentions.push(fanTokenDetails.id);
    mentionsPositions.push(getTextLengthInBytes(text));
    text += ` for${actionParts[1].split(" for")[1]}`;
  } else if (fanTokenDetails?.type === "channel" && fanTokenDetails.id) {
    text = ` ${interpreted.action} `;
  }

  return text
    ? {
        text,
        mentions: mentions.map(Number),
        mentionsPositions,
      }
    : undefined;
}
