import { CATEGORIES } from "../constants.js";
import {
  getFanTokenDisplayNameAndId,
  getMoxieTokenTypeBySymbol,
} from "./moxie.js";
import { formatNumber } from "./format.js";
import { type InterpretedTransaction } from "@3loop/transaction-interpreter";
import type { DecodedTransaction } from "@3loop/transaction-decoder";
import { getFarcasterUserInfoByAddress } from "./airstack";

function getTextLengthInBytes(text: string) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  return bytes.length;
}

export async function constructBuyOrSellMessage(tx: InterpretedTransaction) {
  const eventType = tx.action.includes("Sold") ? "sold" : "bought";
  const [moxieToken, fanToken] =
    eventType === "sold"
      ? [tx.assetsReceived[0], tx?.assetsBurned?.[0]]
      : [tx.assetsSent[0], tx?.assetsMinted?.[0]];

  const [spenderToken, receiverToken] =
    eventType === "sold" ? [fanToken, moxieToken] : [moxieToken, fanToken];

  if (
    !moxieToken ||
    !fanToken ||
    !spenderToken?.from.address ||
    !receiverToken?.to.address
  ) {
    console.log("no spender or receiver", spenderToken, receiverToken);
    return;
  }

  const spender = spenderToken.from.address.toLowerCase();
  const beneficiary = receiverToken.to.address.toLowerCase();
  const actor = tx.user.address.toLowerCase();
  const actorInfo = await getFarcasterUserInfoByAddress(actor);

  const beneficiaryInfo =
    spender !== beneficiary
      ? await getFarcasterUserInfoByAddress(beneficiary)
      : null;

  if (
    !actorInfo?.userId ||
    (spender !== beneficiary && !beneficiaryInfo?.userId)
  ) {
    console.log("no actor or beneficiary info", actor, beneficiary);
    return;
  }

  let text = ``;

  if (Number(moxieToken.amount!) >= CATEGORIES.WHALE) {
    text += `🐋 🚨 Whale alert\n\n`;
  }

  let mentionsPositions = [getTextLengthInBytes(text)];
  let mentions = [actorInfo?.userId];
  text += ` ${eventType} ${formatNumber(fanToken.amount!)} Fan Tokens of `;

  let parentUrl: string | undefined;

  const fanTokenType = getMoxieTokenTypeBySymbol(fanToken.asset.symbol!);
  const fanTokenInfo = getFanTokenDisplayNameAndId({
    symbol: fanToken.asset.symbol!,
    name: fanToken.asset.name!,
  });

  switch (fanTokenType) {
    case "user":
      if (fanTokenInfo?.id) {
        mentions.push(fanTokenInfo.id);
        mentionsPositions.push(getTextLengthInBytes(text));
      }
      break;
    case "channel":
      if (fanTokenInfo?.id) {
        text += `${fanToken.asset.name}`;
      }
      break;
    case "network":
      text += `${fanToken.asset.name}`;
      break;
  }

  text += ` for ${formatNumber(moxieToken.amount!)} ${moxieToken.asset
    .symbol!}`;

  if (spender !== beneficiary && beneficiaryInfo?.userId) {
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

  mentions.push(actorInfo.userId);
  mentionsPositions.push(getTextLengthInBytes(text));
  text += ` burned ${formatNumber(interpreted.assetsSent[0].amount!)} ${
    interpreted.assetsSent[0].asset.symbol
  }`;

  const fanToken = Object.values(decoded.addressesMeta).find(
    (meta) => meta.tokenSymbol !== "MOXIE"
  );

  if (fanToken && fanToken.tokenSymbol && fanToken.contractName) {
    const fanTokenType = getMoxieTokenTypeBySymbol(fanToken.tokenSymbol);
    const fanTokenInfo = getFanTokenDisplayNameAndId({
      symbol: fanToken.tokenSymbol,
      name: fanToken.contractName,
    });

    if (fanTokenType === "user" && fanTokenInfo?.id) {
      text += ` for `;
      mentions.push(fanTokenInfo.id);
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
  console.log(JSON.stringify(interpreted, null, 2));

  const actor = interpreted.user.address.toLowerCase();
  const actorInfo = await getFarcasterUserInfoByAddress(actor);
  const method = interpreted.method;

  if (!actorInfo?.userId) {
    console.log("no actor info", actor);
    return;
  }

  let text = ``;
  let mentions = [];
  let mentionsPositions = [];
  mentions.push(actorInfo.userId);
  mentionsPositions.push(getTextLengthInBytes(text));

  const fanToken =
    method === "depositAndLock"
      ? interpreted.assetsSent[0]
      : interpreted.assetsMinted?.[0];

  if (fanToken && fanToken.asset.symbol && fanToken.asset.name) {
    const fanTokenType = getMoxieTokenTypeBySymbol(fanToken.asset.symbol);
    const fanTokenInfo = getFanTokenDisplayNameAndId({
      symbol: fanToken.asset.symbol,
      name: fanToken.asset.name,
    });

    if (fanTokenType === "user" && fanTokenInfo?.id) {
      text +=
        " " +
        interpreted.action.substring(0, interpreted.action.indexOf(" of") + 3) +
        " ";
      mentions.push(fanTokenInfo.id);
      mentionsPositions.push(getTextLengthInBytes(text));
    }

    if (fanTokenType === "channel" && fanTokenInfo?.id) {
      text += " " + interpreted.action + " ";
    }
  }

  return {
    text,
    mentions: mentions.map((fid) => Number(fid)),
    mentionsPositions,
  };
}
