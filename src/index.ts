import { decoder } from "./decoder/decoder.js";
import { transformEvent, type InterpretedTx } from "./decoder/interpreter.js";
import {
  BUY_TOPIC,
  CHAIN_ID,
  ETHERSCAN_ENDPOINT,
  FARCASTER_HUB_URL,
  FRAME_ENDPOINT,
  RPC,
} from "./constants.js";
import { HubRestAPIClient } from "@standard-crypto/farcaster-js-hub-rest";
import { createPublicClient, webSocket, type Hex } from "viem";
import { getFarcasterUserInfoByAddress } from "./utils/airstack.js";
import {
  getFanTokenDisplayNameAndId,
  getMoxieTokenTypeBySymbol,
} from "./utils/moxie.js";
import { formatNumber } from "./utils/format.js";
import { getChannelDetails } from "./utils/fc.js";

const signerPrivateKey = process.env.SIGNER_PRIVATE_KEY;
const fid = process.env.ACCOUNT_FID;
const client = new HubRestAPIClient({
  hubUrl: FARCASTER_HUB_URL,
});

const wsClient = createPublicClient({
  transport: webSocket(RPC[CHAIN_ID].url),
});

async function publishToFarcaster(cast: {
  text: string;
  url: string;
  mentions: number[];
  mentionsPositions: number[];
  parentUrl?: string;
}) {
  if (!signerPrivateKey || !fid) {
    throw new Error("No signer private key or account fid provided");
  }
  const mentions = cast.mentions;

  const publishCastResponse = await client.submitCast(
    {
      text: cast.text,
      parentUrl: cast.parentUrl,
      mentions,
      mentionsPositions: cast.mentionsPositions,
      embeds: [
        {
          url: cast.url,
        },
      ],
    },
    Number(fid),
    signerPrivateKey
  );
  console.log(`new cast hash: ${publishCastResponse.hash}`);
}

function skipTx(tx: InterpretedTx) {
  if (tx.type !== "swap") return true;

  if (tx.assetsSent.length !== 1 || tx.assetsReceived.length !== 1) return true;

  const [fanToken, moxieToken] = tx.action.includes("Sold")
    ? [tx.assetsSent[0], tx.assetsReceived[0]]
    : [tx.assetsReceived[0], tx.assetsSent[0]];

  if (moxieToken.symbol === "MOXIE" && Number(moxieToken.amount) < 1000)
    return true;

  const fanTokenType = getMoxieTokenTypeBySymbol(fanToken.symbol!);

  if (fanTokenType === "network") return true;

  if (fanTokenType === "channel") return true;

  return false;
}

async function constructMessage(interpreted: InterpretedTx) {
  const context = interpreted.context as {
    spender: string;
    beneficiary: string;
  };

  const actor = interpreted.user.toLowerCase();
  const spender = context.spender.toLowerCase();
  const beneficiary = context.beneficiary.toLowerCase();
  const actorInfo = await getFarcasterUserInfoByAddress(actor);

  const beneficiaryInfo =
    spender !== beneficiary
      ? await getFarcasterUserInfoByAddress(beneficiary)
      : null;

  const eventType = interpreted.action.includes("Sold") ? "sold" : "bought";
  const [fanToken, moxieToken] =
    eventType === "sold"
      ? [interpreted.assetsSent[0], interpreted.assetsReceived[0]]
      : [interpreted.assetsReceived[0], interpreted.assetsSent[0]];

  if (
    !actorInfo?.userId ||
    (spender !== beneficiary && !beneficiaryInfo?.userId)
  ) {
    return;
  }

  let text = ` ${eventType} ${formatNumber(fanToken.amount!)} Fan Tokens of `;

  let mentions = [actorInfo?.userId];
  let mentionsPositions = [0];
  let parentUrl: string | undefined;

  const fanTokenType = getMoxieTokenTypeBySymbol(fanToken.symbol!);
  const fanTokenInfo = getFanTokenDisplayNameAndId({
    symbol: fanToken.symbol!,
    name: fanToken.name!,
  });

  switch (fanTokenType) {
    case "user":
      if (fanTokenInfo?.id) {
        mentions.push(fanTokenInfo.id);
        mentionsPositions.push(text.length);
      }
      break;
    case "channel":
      if (fanTokenInfo?.id) {
        const channelDetails = await getChannelDetails(fanTokenInfo.id);

        if (channelDetails?.result?.channel?.url)
          parentUrl = channelDetails?.result?.channel?.url;

        text += `${fanToken.name}`;
      }
      break;
    case "network":
      text += `${fanToken?.name}`;
      break;
  }

  text += ` for ${formatNumber(moxieToken.amount!)} ${moxieToken.symbol!}`;

  if (spender !== beneficiary && beneficiaryInfo?.userId) {
    text += ` on behalf of `;
    mentions.push(beneficiaryInfo?.userId);
    mentionsPositions.push(text.length);
  }

  return {
    text,
    mentions: mentions.map((fid) => Number(fid)),
    mentionsPositions,
    parentUrl,
  };
}

async function handleTransaction(txHash?: string) {
  try {
    console.log("Transaction mined!", txHash);
    if (!txHash) return;

    await wsClient.waitForTransactionReceipt({ hash: txHash as Hex });

    const decoded = await decoder.decodeTransaction({
      chainID: CHAIN_ID,
      hash: txHash,
    });

    if (!decoded) return;

    const interpreted = transformEvent(decoded);

    if (skipTx(interpreted)) {
      console.log("skipping transaction", txHash);
      return;
    }

    const message = await constructMessage(interpreted);

    if (!message) {
      console.log("could not construct message");
      return;
    }

    const frameUrl = `${FRAME_ENDPOINT}/${CHAIN_ID}/${txHash}`;
    console.log(message);

    await publishToFarcaster({
      ...message,
      url: frameUrl,
    });
  } catch (e) {
    console.error(e);
  }
}

let lastProcessedAt = Date.now();

async function createSubscription() {
  const response = await wsClient.transport.subscribe({
    method: "eth_subscribe",
    params: [
      //@ts-expect-error
      "logs",
      {
        topics: [BUY_TOPIC],
      },
    ],
    onData: (data: any) => {
      const txHash = data?.result?.transactionHash;
      lastProcessedAt = Date.now();
      if (txHash) handleTransaction(txHash);
    },
    onError: (error: any) => {
      console.error(error);
    },
  });

  const interval = setInterval(() => {
    if (Date.now() - lastProcessedAt > 60_000 * 5) {
      console.error(
        "No new transactions in the last 5 minutes, restarting subscription"
      );
      clearInterval(interval);
      response.unsubscribe();
      createSubscription();
    }
  }, 60_000 * 5);
}

async function main() {
  const server = Bun.serve({
    port: process.env.PORT || 3000,
    fetch(req) {
      return new Response("Moxie Alerts Bot is running!");
    },
  });

  console.log(`Server running on http://localhost:${server.port}`);

  await decoder.decodeTransaction({
    chainID: CHAIN_ID,
    hash: "0x6dd5ffecfe9d6e2d63fe5ed7b0f3b929dc3fcd4e9a00c8fa1064be65306a3f71",
  });

  console.log("Creating subscription");

  createSubscription();
}

// Call the main function to start the server
main().catch(console.error);
