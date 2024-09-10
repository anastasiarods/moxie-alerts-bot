import { decoder } from "./decoder/decoder.js";
import { transformEvent, type InterpretedTx } from "./decoder/interpreter.js";
import {
  BUY_TOPIC,
  CHAIN_ID,
  ETHERSCAN_ENDPOINT,
  FARCASTER_HUB_URL,
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
  transport: webSocket(process.env.WS_RPC_URL || ""),
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

function invalidTx(tx: InterpretedTx) {
  return (
    tx.type !== "swap" ||
    tx.assetsSent.length !== 1 ||
    tx.assetsReceived.length !== 1 ||
    !tx.assetsSent[0].amount ||
    !tx.assetsReceived[0].amount ||
    !tx.assetsSent[0].symbol ||
    !tx.assetsReceived[0].symbol ||
    !tx.assetsSent[0].name ||
    !tx.assetsReceived[0].name
  );
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
  const [assetSent, assetReceived] =
    eventType === "sold"
      ? [interpreted.assetsSent[0], interpreted.assetsReceived[0]]
      : [interpreted.assetsReceived[0], interpreted.assetsSent[0]];

  if (
    !actorInfo?.userId ||
    (spender !== beneficiary && !beneficiaryInfo?.userId)
  ) {
    return;
  }

  let text = ` ${eventType} ${formatNumber(assetSent.amount!)} shares of `;

  let mentions = [actorInfo?.userId];
  let mentionsPositions = [0];
  let parentUrl: string | undefined;

  const fanTokenType = getMoxieTokenTypeBySymbol(assetSent.symbol!);
  const fanToken = getFanTokenDisplayNameAndId({
    symbol: assetSent.symbol!,
    name: assetSent.name!,
  });

  switch (fanTokenType) {
    case "user":
      if (fanToken?.id) {
        mentions.push(fanToken.id);
        mentionsPositions.push(text.length);
      }
      break;
    case "channel":
      if (fanToken?.id) {
        const channelDetails = await getChannelDetails(fanToken.id);

        if (channelDetails?.result?.channel?.url)
          parentUrl = channelDetails?.result?.channel?.url;

        text += `${fanToken.name}`;
      }
      break;
    case "network":
      text += `${fanToken?.name}`;
      break;
  }

  text += ` for ${formatNumber(
    assetReceived.amount!
  )} ${assetReceived.symbol!}`;

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

    if (invalidTx(interpreted)) {
      console.log("skipping transaction", txHash);
      return;
    }

    const message = await constructMessage(interpreted);

    if (!message) {
      console.log("could not construct message");
      return;
    }

    const etherscanUrl = `${ETHERSCAN_ENDPOINT}/tx/${txHash}`;

    console.log(JSON.stringify(message, null, 2));

    await publishToFarcaster({
      ...message,
      url: etherscanUrl,
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
