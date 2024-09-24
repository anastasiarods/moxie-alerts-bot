import { CATEGORIES } from "../constants.js";
import {
  getFanTokenDisplayNameAndId,
  getMoxieTokenTypeBySymbol,
} from "./moxie.js";
import { formatNumber } from "./format.js";
import { type InterpretedTransaction } from "@3loop/transaction-interpreter";
import type { DecodedTx } from "@3loop/transaction-decoder";
import { getFarcasterUserInfoByAddress } from "./airstack";

function getTextLengthInBytes(text: string) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);
    return bytes.length;
}

  
export async function constructBuyOrSellMessage(tx: InterpretedTransaction) {
  const spenderAddress = tx.assetsSent?.[0]?.from.address;
  const beneficiaryAddress = tx.assetsReceived?.[0]?.to.address;

  if (!spenderAddress || !beneficiaryAddress) return;

  const spender = spenderAddress.toLowerCase();
  const beneficiary = beneficiaryAddress.toLowerCase();
  const actor = tx.user.address.toLowerCase();
  const actorInfo = await getFarcasterUserInfoByAddress(actor);

  const beneficiaryInfo =
    spender !== beneficiary
      ? await getFarcasterUserInfoByAddress(beneficiary)
      : null;

  const eventType = tx.action.includes("Sold") ? "sold" : "bought";
  const [fanToken, moxieToken] =
    eventType === "sold"
      ? [tx.assetsSent[0], tx.assetsReceived[0]]
      : [tx.assetsReceived[0], tx.assetsSent[0]];

  if (
    !actorInfo?.userId ||
    (spender !== beneficiary && !beneficiaryInfo?.userId)
  ) {
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
  decoded: DecodedTx
) {
  const actor = interpreted.user.address.toLowerCase();
  const actorInfo = await getFarcasterUserInfoByAddress(actor);

  if (!actorInfo?.userId) return;

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

  if (fanToken) {
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
