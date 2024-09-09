import { decoder } from "./decoder/decoder.js";
import { transformEvent } from "./decoder/interpreter.js";
import {
  CHAIN_ID,
  ETHERSCAN_ENDPOINT,
  FARCASTER_HUB_URL,
  TOPIC,
} from "./constants.js";
import { HubRestAPIClient } from "@standard-crypto/farcaster-js-hub-rest";
import { createPublicClient, webSocket, type Hex } from "viem";
import { getFarcasterUserInfoByAddress } from "./utils/airstack.js";
import {
  getFanTokenDisplayNameAndId,
  getMoxieTokenTypeBySymbol,
} from "./utils/moxie.js";
import { formatNumber } from "./utils/format.js";

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
  mentionsFids: number[];
  mentionsPositions: number[];
}) {
  if (!signerPrivateKey || !fid) {
    throw new Error("No signer private key or account fid provided");
  }
  const mentions = cast.mentionsFids;

  const publishCastResponse = await client.submitCast(
    {
      text: cast.text,
      mentions: mentions,
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

async function constructMessage(interpreted: any) {
  const context = interpreted.context as {
    spender: string;
    beneficiary: string;
  };

  const actor = interpreted.user.address.toLowerCase();
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

  let text = ` ${eventType} ${formatNumber(assetSent.amount)} shares of `;

  let mentionsFids = [actorInfo?.userId];
  let mentionsPositions = [0];

  const fanTokenType = getMoxieTokenTypeBySymbol(assetSent.asset.symbol);
  const fanToken = getFanTokenDisplayNameAndId(assetSent.asset);

  if (fanTokenType === "user") {
    mentionsFids.push(fanToken?.id);
    mentionsPositions.push(text.length);
  } else {
    text += `${fanToken?.name}`;
  }

  text += ` for ${formatNumber(assetReceived.amount)} ${
    assetReceived.asset.symbol
  }`;

  if (spender !== beneficiary) {
    text += ` on behalf of `;
    mentionsFids.push(beneficiaryInfo?.userId);
    mentionsPositions.push(text.length);
  }

  return {
    text,
    mentionsFids: mentionsFids.map((fid) => Number(fid)),
    mentionsPositions,
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
    if (!interpreted || interpreted.type !== "swap") return;
    const { text, mentionsFids, mentionsPositions } = await constructMessage(
      interpreted
    );
    const etherscanUrl = `${ETHERSCAN_ENDPOINT}/tx/${txHash}`;

    console.log(text, mentionsFids, mentionsPositions);
    await publishToFarcaster({
      text,
      url: etherscanUrl,
      mentionsFids,
      mentionsPositions,
    });
  } catch (e) {
    console.error(e);
  }
}

async function createSubscription() {
  await wsClient.transport.subscribe({
    method: "eth_subscribe",
    params: [
      //@ts-expect-error
      "logs",
      {
        topics: [TOPIC],
      },
    ],
    onData: (data: any) => {
      const txHash = data?.result?.transactionHash;
      if (txHash) handleTransaction(txHash);
    },
    onError: (error: any) => {
      console.error(error);
    },
  });
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

  createSubscription();
}

// Call the main function to start the server
main().catch(console.error);
